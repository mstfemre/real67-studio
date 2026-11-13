// MelGeek Real67 (VID 0x0416 / PID 0x0112) WebHID sürücüsü.
// Protokol, Hive web sürücüsünün gönderdiği paketlerin kaydından çıkarıldı.
//
// Paket (64 bayt, rapor ID 0):
//   [0] komut grubu  [1] alt komut  [2] veri uzunluğu  [3..5] 0
//   [6..7] CRC16-CCITT-FALSE(veri), little-endian   [8..] veri
// Yanıt: aynı grup, alt komut & 0x7F. Hata yanıtı grubu 0xEE.

export const VID = 0x0416;
export const PID = 0x0112;
export const USAGE_PAGE = 0xff60;

export const KEY_COUNT = 67;
export const SLOT_COUNT = 8;      // 0..6 = Özel 1..7, 7 = dinamik modların renk tablosu
export const DYNAMIC_SLOT = 7;
const CHUNK = 12;                 // tek pakette en fazla 12 tuş

const G_KEYCOLOR = 0x03;
const G_KEYMODE = 0x06;
const G_MOOD = 0x0b;
const G_INFO = 0x0a;
const LIGHT_GROUPS = new Set([G_KEYCOLOR, G_KEYMODE, G_MOOD]);

export const KEY_MODES = [
  { id: 0, name: 'Kapalı' },
  { id: 1, name: 'Statik' },
  { id: 2, name: 'Geçişli' },
  { id: 3, name: 'Nefes' },
  { id: 4, name: 'Dalga' },
  { id: 5, name: 'Halka' },
  { id: 6, name: 'Tepki' },
  { id: 7, name: 'Rastgele' },
];
export const MOOD_MODES = [
  { id: 1, name: 'Statik' },
  { id: 2, name: 'Geçişli' },
  { id: 3, name: 'Nefes' },
  { id: 4, name: 'Şarj döngüsü' },
];
export const MOOD_COLORS = [
  { id: 0, name: 'Beyaz', hex: '#ffffff' },
  { id: 1, name: 'Kırmızı', hex: '#ff2a2a' },
  { id: 2, name: 'Yeşil', hex: '#2aff4a' },
  { id: 3, name: 'Mavi', hex: '#2a5bff' },
  { id: 4, name: 'Sarı', hex: '#ffe62a' },
  { id: 5, name: 'Turuncu', hex: '#ff8a1a' },
  { id: 6, name: 'Mor', hex: '#b02aff' },
  { id: 7, name: 'Camgöbeği', hex: '#19e0ff' }, // Hive'da gizli; cihazda doğrulandı
];

// Hive'ın kullandığı aralıklar (real67 yapılandırma dosyasındaki min/max değerleri)
export const KEY_SPEED = { min: 0x04, max: 0x30 };
export const MOOD_SPEED = { min: 0x04, max: 0x0c };
// Halka (5) ve Tepki (6): fabrika/Hive hızı 0x30 halkayı göremeyeceğin kadar hızlı geçiriyor
// (cihazda doğrulandı: 0x30 görünmez, 0x10 her basışta tek halka). Görünür aralıkla sınırla.
export const REACTIVE_SPEED = { min: 0x06, max: 0x1c };
export const keySpeedRange = (mode) => (mode === 5 || mode === 6 ? REACTIVE_SPEED : KEY_SPEED);
export const BRIGHT_MAX = 63;
export const keyBrightCap = () => 60;
export const moodBrightCap = (mode) => (mode === 1 ? 53 : 63);

export function crc16(bytes) {
  let c = 0xffff;
  for (const b of bytes) {
    c ^= b << 8;
    for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
  }
  return c;
}

export function buildFrame(group, sub, payload = []) {
  const data = Uint8Array.from(payload);
  if (data.length > 56) throw new Error('Veri 56 baytı aşıyor');
  const p = new Uint8Array(64);
  p[0] = group; p[1] = sub; p[2] = data.length;
  const c = crc16(data);
  p[6] = c & 0xff; p[7] = c >> 8;
  p.set(data, 8);
  return p;
}

// 12 baytlık mod parametresi:
//  b0 = mod | bayraklar(bit6-7)
//  b1 bit0-5 korunur (bit3 = rastgele renk, bit5 = statik modda tuş ışığı etkin;
//     bu bit silinirse firmware tuş parlaklığını 0 yapar)
//  parlaklık(6 bit, 0..63) = (b2 << 2) | (b1 >> 6)   b3 = hız   b4..b11 korunur
export function decodeParams(raw) {
  const b = Uint8Array.from(raw);
  return {
    raw: b,
    mode: b[0] & 0x3f,
    brightness: ((b[2] & 0x0f) << 2) | (b[1] >> 6),
    speed: b[3],
    random: !!(b[1] & 0x08),
  };
}
export function encodeParams(p) {
  const b = Uint8Array.from(p.raw);
  const br = Math.max(0, Math.min(63, Math.round(p.brightness)));
  b[1] = (b[1] & 0x3f) | ((br & 0x03) << 6);
  b[2] = (b[2] & 0xf0) | (br >> 2);
  if ((b[0] & 0x3f) === 1) b[1] |= 0x20; // statik mod: bu bit olmadan ışık yanmıyor
  b[3] = p.speed & 0xff;
  b[1] = p.random ? b[1] | 0x08 : b[1] & ~0x08;
  return b;
}

export class Real67 {
  constructor(device) {
    this.dev = device;
    this.queue = Promise.resolve();
    this.pending = null;
    this.onPacket = null; // (dir, bytes) hata ayıklama günlüğü
    this._onInput = this._onInput.bind(this);
  }

  static supported() { return 'hid' in navigator; }

  static matches(d) {
    return d.vendorId === VID && d.productId === PID && d.collections.some((c) => c.usagePage === USAGE_PAGE);
  }

  static async findGranted() {
    const list = await navigator.hid.getDevices();
    const d = list.find(Real67.matches);
    return d ? new Real67(d) : null;
  }

  static async request() {
    const list = await navigator.hid.requestDevice({
      filters: [{ vendorId: VID, productId: PID, usagePage: USAGE_PAGE }],
    });
    const d = list.find(Real67.matches);
    return d ? new Real67(d) : null;
  }

  get name() { return this.dev.productName || 'REAL67'; }

  async open() {
    if (!this.dev.opened) await this.dev.open();
    this.dev.addEventListener('inputreport', this._onInput);
  }

  async close() {
    this.dev.removeEventListener('inputreport', this._onInput);
    if (this.dev.opened) await this.dev.close();
  }

  _onInput(e) {
    const u = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength);
    this.onPacket?.('in', u);
    const p = this.pending;
    if (!p) return;
    if (u[0] === 0xee) {
      this.pending = null; clearTimeout(p.timer);
      p.rej(new Error(`Klavye komutu reddetti (0x${p.group.toString(16)} 0x${p.sub.toString(16)}, kod ${u[16]})`));
    } else if (u[0] === p.group && u[1] === (p.sub & 0x7f)) {
      this.pending = null; clearTimeout(p.timer);
      p.res(u.slice(8, 8 + u[2]));
    }
  }

  xfer(group, sub, payload = [], timeout = 800) {
    // Güvenlik: yalnızca ışık grupları (0x03 tuş renkleri, 0x06 tuş modu, 0x0b ortam ışığı)
    // ve salt okunur sürüm sorgusu gönderilir. Tuş ataması, rapid trigger, makro vb.
    // gruplarına bu sürücüden hiçbir komut gidemez.
    const allowed = LIGHT_GROUPS.has(group) || (group === G_INFO && sub === 0x95);
    if (!allowed) return Promise.reject(new Error(`Işık dışı komut engellendi (0x${group.toString(16)})`));
    const run = () => new Promise((res, rej) => {
      const pkt = buildFrame(group, sub, payload);
      const timer = setTimeout(() => { this.pending = null; rej(new Error('Klavye yanıt vermedi')); }, timeout);
      this.pending = { group, sub, res, rej, timer };
      this.onPacket?.('out', pkt);
      this.dev.sendReport(0, pkt).catch((err) => { clearTimeout(timer); this.pending = null; rej(err); });
    });
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  // ---- bilgi
  async info() {
    const [k, cur, slot] = await Promise.all([
      this.xfer(G_KEYCOLOR, 0x80),
      this.xfer(G_KEYMODE, 0x81),
      this.xfer(G_KEYCOLOR, 0x81),
    ]);
    const fw = await this.xfer(G_INFO, 0x95, [0]).catch(() => null);
    return { slots: k[0], keys: k[1], mode: cur[0], slot: slot[0], fw: fw ? fw[0] : null };
  }

  // ---- tuş ışığı
  getKeyMode() { return this.xfer(G_KEYMODE, 0x81).then((r) => r[0]); }
  setKeyMode(m) { return this.xfer(G_KEYMODE, 0x82, [m]); }
  getSlot() { return this.xfer(G_KEYCOLOR, 0x81).then((r) => r[0]); }
  setSlot(s) { return this.xfer(G_KEYCOLOR, 0x82, [s]); }
  setBacklight(on) { return this.xfer(G_KEYMODE, 0x88, [on ? 1 : 0]); }
  async getKeyParams(m) { return decodeParams(await this.xfer(G_KEYMODE, 0x86, [m])); }
  setKeyParams(p) { return this.xfer(G_KEYMODE, 0x87, encodeParams(p)); }

  // Renk: {r,g,b,x}; x = tuş başına 4. bayt (cihazdaki değer korunur)
  async readSlot(slot) {
    const out = [];
    for (let s = 0; s < KEY_COUNT; s += CHUNK) {
      const e = Math.min(KEY_COUNT - 1, s + CHUNK - 1);
      const r = await this.xfer(G_KEYCOLOR, 0x83, [slot, s, e, 0]);
      for (let i = 0; i <= e - s; i++) {
        const o = 4 + i * 4;
        out.push({ b: r[o], g: r[o + 1], r: r[o + 2], x: r[o + 3] });
      }
    }
    return out;
  }

  // colors: dizi (uzunluk 67); only: değişen tuş indeksleri (isteğe bağlı)
  async writeSlot(slot, colors, only = null) {
    const runs = [];
    if (only) {
      const idx = [...new Set(only)].sort((a, b) => a - b);
      let start = null, prev = null;
      for (const i of idx) {
        if (start === null) { start = prev = i; continue; }
        if (i === prev + 1 && i - start < CHUNK) { prev = i; continue; }
        runs.push([start, prev]); start = prev = i;
      }
      if (start !== null) runs.push([start, prev]);
    } else {
      for (let s = 0; s < KEY_COUNT; s += CHUNK) runs.push([s, Math.min(KEY_COUNT - 1, s + CHUNK - 1)]);
    }
    for (const [s, e] of runs) {
      const pl = [slot, s, e, 0];
      for (let k = s; k <= e; k++) {
        const c = colors[k];
        pl.push(c.b & 255, c.g & 255, c.r & 255, (c.x ?? 0x33) & 255);
      }
      await this.xfer(G_KEYCOLOR, 0x84, pl);
    }
  }

  // ---- ortam (mood) ışığı
  async getMood() {
    const r = await this.xfer(G_MOOD, 0x80);
    return { colorCount: r[0], modeCount: r[1], color: r[2], mode: r[3] };
  }
  setMoodColor(i) { return this.xfer(G_MOOD, 0x81, [i]); }
  setMoodMode(m) { return this.xfer(G_MOOD, 0x82, [m]); }
  setMoodOn(on) { return this.xfer(G_MOOD, 0x83, [on ? 1 : 0]); }
  async getMoodParams(m) { return decodeParams(await this.xfer(G_MOOD, 0x84, [m])); }
  setMoodParams(p) { return this.xfer(G_MOOD, 0x85, encodeParams(p)); }
}
