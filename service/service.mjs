// Real67 Studio arka plan servisi.
//
// Klavyenin firmware'i özel renkli akışı kendi başına oynatamıyor. Bu servis, web
// arayüzündeki canlı efektlerin AYNI kodunu (js/effects.js) Node'da çalıştırıp kareleri
// klavyeye gönderir; böylece tarayıcı kapalıyken de akış sürer.
//
//  - Web arayüzünü http://localhost:8667 adresinde sunar (WebHID izni bu adrese bağlı).
//  - /api/play, /api/stop, /api/status, /api/quit: arayüz efekti buradan başlatır/durdurur.
//  - Son oynatılan efekt service/state.json'da saklanır; servis yeniden başlayınca sürer.
//  - Yalnızca ışık komutları gönderir (js/protocol.js içindeki izin listesi burada da geçerli).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// Efekt, protokol ve dizilim kodu web arayüzüyle ortak: tek kaynak web-app/js
import { EFFECTS, defaultsFor, hexToRgb, brightnessOf } from '../web-app/js/effects.js';
import { Real67, VID, PID, USAGE_PAGE, KEY_COUNT, MOOD_COLORS, MOOD_SPEED, decodeParams, keyBrightCap, moodBrightCap } from '../web-app/js/protocol.js';
import { KEYS, WIDTH_U } from '../web-app/js/layout.js';
import { pollPresses, resetPresses, keysAvailable, hotkeyReader } from './keys.mjs';

const HID = createRequire(import.meta.url)('node-hid');

// Klasör düzeni:  real67-studio/service (bu dosya)  ve  real67-studio/web-app (arayüz)
const SERVICE_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(SERVICE_DIR, '..', 'web-app');
const STATE_FILE = path.join(SERVICE_DIR, 'state.json');
const PORT = Number(process.argv[2]) || 8667;
const LIVE_SLOT = 6; // Özel 7: canlı efektlerin slotu (web arayüzüyle aynı)
const FPS_CHOICES = [20, 30, 45, 60];

const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

// ------------------------------------------------------------ kalıcı durum
// playing: oynatılan efektin ayarları (yoksa null)
// saved: oynatmaya başlamadan önceki klavye ışığı; durdurunca geri yüklenir
// mood: ortam ışığının otomatik renk değişimi (kind: off | cycle | follow)
const MOOD_OFF = { kind: 'off', colors: [1, 2, 3, 4, 5, 6, 7], interval: 5, shuffle: false, region: 'all' };
let persisted = { playing: null, saved: null, mood: MOOD_OFF };
try { persisted = { ...persisted, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }; } catch { /* ilk çalıştırma */ }
function persist() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(persisted)); } catch (e) { log('Durum dosyası yazılamadı:', e.message); }
}

// ------------------------------------------------------------ node-hid → WebHID benzeri uyarlayıcı
// js/protocol.js WebHID cihazı bekliyor; aynı sürücü sınıfını burada da kullanabilmek için.
class HidAdapter {
  constructor(info) {
    this.info = info; this.opened = false; this.listeners = new Set();
    this.productName = info.product || 'REAL67'; this.onerror = null; this.h = null;
  }
  async open() {
    this.h = new HID.HID(this.info.path);
    this.opened = true;
    this.h.on('data', (buf) => {
      const ev = { data: new DataView(buf.buffer, buf.byteOffset, buf.byteLength) };
      for (const fn of this.listeners) fn(ev);
    });
    this.h.on('error', (e) => this.onerror?.(e));
  }
  async close() {
    this.opened = false;
    try { this.h?.close(); } catch { /* zaten kapalı */ }
    this.h = null;
  }
  addEventListener(type, fn) { if (type === 'inputreport') this.listeners.add(fn); }
  removeEventListener(type, fn) { this.listeners.delete(fn); }
  async sendReport(id, data) {
    if (!this.h) throw new Error('Klavye bağlı değil');
    this.h.write([id, ...data]);
  }
}

const findKeyboard = () =>
  HID.devices().find((d) => d.vendorId === VID && d.productId === PID && d.usagePage === USAGE_PAGE);

// ------------------------------------------------------------ oynatıcı
const S = {
  kb: null, connecting: false, prepared: false, error: null,
  fx: null, fxState: {}, cfg: null,
  timer: null, busy: false, lastSent: null, resyncAt: 0,
  t0: performance.now(), last: performance.now(),
  frames: 0, fpsT: performance.now(), fps: 0,
};
const out = new Float32Array(KEY_COUNT * 3);
const to255 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));

// Arayüzden gelen ayarları efektin tanımına göre doğrula
function sanitize(cfg) {
  const fx = EFFECTS.find((f) => f.id === cfg?.fxId && !f.shelved);
  if (!fx) throw new Error('Bilinmeyen efekt');
  const params = defaultsFor(fx);
  for (const q of fx.params) {
    const v = cfg.params?.[q.key];
    if (v === undefined) continue;
    if (q.type === 'range') { if (typeof v === 'number' && v >= q.min && v <= q.max) params[q.key] = v; }
    else if (q.type === 'select') { if (q.options.some((o) => o[0] === v)) params[q.key] = v; }
    else if (q.type === 'color') { if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) params[q.key] = v; }
    else if (q.type === 'toggle') params[q.key] = !!v;
  }
  return {
    fxId: fx.id, params,
    master: typeof cfg.master === 'number' && cfg.master >= 0 && cfg.master <= 1 ? cfg.master : 1,
    gamma: cfg.gamma !== false,
    fps: FPS_CHOICES.includes(cfg.fps) ? cfg.fps : 30,
  };
}

async function connect() {
  if (S.kb || S.connecting) return;
  S.connecting = true;
  try {
    const info = findKeyboard();
    if (!info) { S.error = 'Klavye bulunamadı'; return; }
    const dev = new HidAdapter(info);
    const kb = new Real67(dev);
    dev.onerror = (e) => drop('Klavye bağlantısı koptu: ' + e.message);
    dev.addEventListener('inputreport', watchForHive);
    await kb.open();
    await kb.info();
    S.kb = kb; S.prepared = false; S.lastSent = null; S.error = null;
    M.prepared = false;
    log('Klavye bağlandı');
  } catch (e) {
    S.error = e.message;
  } finally { S.connecting = false; }
}
function drop(msg) {
  const kb = S.kb;
  if (!kb) return;
  S.kb = null; S.prepared = false; S.error = msg;
  log(msg);
  kb.close().catch(() => {});
}

// Klavyeyi canlı akışa hazırla; önceki ışığı (bir kez) sakla
async function prepare() {
  const kb = S.kb;
  if (!persisted.saved) {
    const params = await kb.getKeyParams(1);
    persisted.saved = {
      mode: await kb.getKeyMode(), slot: await kb.getSlot(),
      colors: await kb.readSlot(LIVE_SLOT), params: [...params.raw],
    };
    persist();
  }
  await kb.setBacklight(true);
  await kb.setSlot(LIVE_SLOT);
  await kb.setKeyMode(1);
  const p1 = await kb.getKeyParams(1);
  await kb.setKeyParams({ ...p1, brightness: keyBrightCap(1) });
  S.lastSent = null; S.prepared = true;
}

async function restore() {
  const kb = S.kb, s = persisted.saved;
  if (!kb || !s) return;
  await kb.writeSlot(LIVE_SLOT, s.colors);
  await kb.setKeyParams(decodeParams(s.params));
  await kb.setSlot(s.slot);
  await kb.setKeyMode(s.mode);
  persisted.saved = null; persist();
  log('Klavye önceki ışığına döndü');
}

// Windows'ta zamanlayıcılar ~15,6 ms adımlarla çalışır; setInterval(1000/60) bu yüzden ~40 kare/sn
// verir. Bunun yerine zamanlayıcı sık çalışır (TICK_MS) ve kare vakti gelmişse çizilir.
const TICK_MS = 5, FRAME_SLACK_MS = 3;
async function tick() {
  if (!S.cfg || S.busy || !S.kb) return;
  if (performance.now() - S.last < 1000 / S.cfg.fps - FRAME_SLACK_MS) return;
  S.busy = true;
  try {
    if (!S.prepared) await prepare();
    const now = performance.now();
    const dt = Math.min(0.25, (now - S.last) / 1000);
    S.last = now;
    const presses = S.fx.needsKeys ? pollPresses() : []; // yalnızca basışa tepki veren efektlerde
    S.fx.frame({ t: (now - S.t0) / 1000, dt, p: S.cfg.params, out, s: S.fxState, presses, audio: null, screen: null });

    const g = S.cfg.gamma ? 2.2 : 1, m = S.cfg.master * brightnessOf(S.cfg.params); // genel × efektin parlaklığı
    const full = !S.lastSent || now > S.resyncAt; // arada bir tam kare: kaçan paket olursa toparlar
    const colors = new Array(KEY_COUNT), changed = [];
    for (let i = 0; i < KEY_COUNT; i++) {
      const c = {
        r: to255(Math.pow(Math.min(1, Math.max(0, out[i * 3])), g) * m),
        g: to255(Math.pow(Math.min(1, Math.max(0, out[i * 3 + 1])), g) * m),
        b: to255(Math.pow(Math.min(1, Math.max(0, out[i * 3 + 2])), g) * m),
        x: 0x33,
      };
      colors[i] = c;
      const p = S.lastSent?.[i];
      if (full || !p || p.r !== c.r || p.g !== c.g || p.b !== c.b) changed.push(i);
    }
    if (full) S.resyncAt = now + 2000;
    if (changed.length) await S.kb.writeSlot(LIVE_SLOT, colors, full ? null : changed);
    S.lastSent = colors;

    S.frames++;
    if (now - S.fpsT > 1000) { S.fps = Math.round((S.frames * 1000) / (now - S.fpsT)); S.frames = 0; S.fpsT = now; }
  } catch (e) {
    drop('Klavyeye yazılamadı: ' + e.message);
  } finally { S.busy = false; }
}

const idle = async () => { while (S.busy) await new Promise((r) => setTimeout(r, 5)); };

// ------------------------------------------------------------ Hive algılama
// Hive (web ya da masaüstü) klavyeyi açar açmaz tuş atama, tetik ve profil sorguları gönderir.
// Klavyenin cevapları bu servisin bağlantısına da ulaşır; bu uygulama o sorguları hiç
// göndermediği için (protocol.js yalnızca ışık komutlarına izin verir) bu cevaplar Hive'ın
// açık olduğunu gösterir. O zaman servis kendini duraklatır ve klavyeyi Hive'a bırakır.
const P = { paused: false, since: 0 };
function isHiveTraffic(u) {
  const g = u[0], s = u[1];
  return g === 0x04 || g === 0x02 || (g === 0x0a && s !== 0x15); // 0x0a 0x15: bizim sürüm sorgumuzun cevabı
}
function watchForHive(ev) {
  if (P.paused) return;
  const u = new Uint8Array(ev.data.buffer, ev.data.byteOffset, ev.data.byteLength);
  if (isHiveTraffic(u)) pauseForHive();
}
async function pauseForHive() {
  if (P.paused) return;
  P.paused = true; P.since = Date.now();
  log('Hive algılandı: servis duraklatıldı, klavye Hive\'a bırakıldı');
  const resumeCfg = S.cfg || persisted.playing;
  clearInterval(S.timer); S.timer = null;
  S.cfg = null; S.fps = 0;
  await idle();
  while (M.busy) await new Promise((r) => setTimeout(r, 5));
  try { await restore(); } catch { /* Hive zaten konuşuyor; elden gelen yapıldı */ }
  // Efekt hatırlanır: devam edilince ya da servis yeniden başlayınca kaldığı yerden sürer
  persisted.playing = resumeCfg; persist();
  if (S.kb) { const kb = S.kb; S.kb = null; S.prepared = false; await kb.close().catch(() => {}); }
}
function resume() {
  if (!P.paused) return;
  P.paused = false;
  log('Servis devam ediyor');
  if (persisted.playing) { try { play(persisted.playing, 'service'); } catch (e) { log('Efekt sürdürülemedi:', e.message); } }
  else if (persisted.mood.kind !== 'off') connect();
}

// Oynayan ayar her değiştiğinde artar. Arayüz, kısayolla yapılan değişikliği (source 'hotkey')
// bundan anlar ve kendi ekranını ona uydurur.
const REV = { n: 0, source: null };

// source: 'ui' (arayüz), 'hotkey' (kısayol), 'service' (servisin kendisi: açılış, devam)
function play(raw, source = 'ui') {
  P.paused = false; // bir efekte tıklamak duraklatmayı da bitirir
  const cfg = sanitize(raw);
  if (!S.fx || S.fx.id !== cfg.fxId) {
    S.fx = EFFECTS.find((f) => f.id === cfg.fxId);
    S.fxState = {};
    S.fx.init?.(S.fxState);
    if (S.fx.needsKeys) resetPresses();
  }
  S.cfg = cfg;
  persisted.playing = cfg;
  persisted.last = { master: cfg.master, gamma: cfg.gamma, fps: cfg.fps };
  (persisted.fxParams ??= {})[cfg.fxId] = cfg.params; // kısayolla o efekte dönünce aynı ayarlarla gelsin
  persist();
  REV.n++; REV.source = source;
  if (!S.timer) {
    S.last = performance.now();
    S.timer = setInterval(tick, TICK_MS);
  }
  connect();
}

async function stop() {
  clearInterval(S.timer); S.timer = null;
  if (S.cfg) persisted.lastFx = S.cfg.fxId; // kısayolla yeniden başlatınca kaldığı yerden
  S.cfg = null; S.fps = 0;
  persisted.playing = null; persist();
  await idle();
  if (!S.kb && persisted.saved) await connect();
  try { await restore(); } catch (e) { drop('Geri yükleme başarısız: ' + e.message); }
  // Ortam ışığı otomatiği açıksa bağlantı açık kalır
  if (S.kb && !persisted.saved && persisted.mood.kind === 'off') {
    while (M.busy) await new Promise((r) => setTimeout(r, 5));
    const kb = S.kb; S.kb = null; S.prepared = false; await kb.close();
  }
}

// ------------------------------------------------------------ kısayollar
// Ctrl+Alt+← / →: önceki / sonraki efekt (arayüzdeki sırayla). Ctrl+Alt+↑ / ↓: o efektin parlaklığı.
// Arayüz açık olmasa da çalışır; arayüz açıksa ekranı kısayolla gelen ayara uyar.
const SWITCHABLE = EFFECTS.filter((f) => !f.shelved);
const BRIGHT_STEPS = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
function onHotkey(action) {
  const cur = S.cfg;
  if (action === 'prev' || action === 'next') {
    const from = (cur || persisted.playing)?.fxId ?? persisted.lastFx;
    const i = SWITCHABLE.findIndex((f) => f.id === from), n = SWITCHABLE.length;
    const fx = SWITCHABLE[i < 0 ? 0 : (i + (action === 'next' ? 1 : n - 1)) % n];
    const base = cur || persisted.last || {};
    play({ ...base, fxId: fx.id, params: persisted.fxParams?.[fx.id] ?? {} }, 'hotkey');
    return;
  }
  if (!cur) return; // efekt oynamıyorken parlaklık kısayolu bir şey yapmaz
  const b = cur.params.brightness ?? 100;
  const nb = action === 'up' ? BRIGHT_STEPS.find((v) => v > b) ?? 100 : [...BRIGHT_STEPS].reverse().find((v) => v < b) ?? 5;
  if (nb !== b) play({ ...cur, params: { ...cur.params, brightness: nb } }, 'hotkey');
}
if (keysAvailable()) {
  const readHotkeys = hotkeyReader();
  setInterval(() => {
    if (P.paused) return; // Hive açıkken klavyeye dokunma
    for (const a of readHotkeys()) { try { onHotkey(a); } catch (e) { log('Kısayol uygulanamadı:', e.message); } }
  }, 25);
}

// ------------------------------------------------------------ ortam ışığı: otomatik renk değişimi
// Firmware ortam ışığına yalnızca 8 hazır renk kabul ediyor; servis bunlar arasında geçiş yapar.
//  cycle : seçilen renkler arasında belirli aralıkla (sırayla ya da rastgele)
//  follow: oynayan efektin seçilen bölgedeki baskın rengine en yakın hazır renk
const M = { cur: null, last: 0, idx: -1, prepared: false, busy: false };
const MOOD_RGB = MOOD_COLORS.map((c) => hexToRgb(c.hex));
const REGION_WEIGHT = {
  all: () => 1,
  left: (k) => (k.cx < 3 ? 1 : 0),
  center: (k) => (Math.abs(k.cx - WIDTH_U / 2) < 2.5 ? 1 : 0),
  right: (k) => (k.cx > WIDTH_U - 3 ? 1 : 0),
};

function sanitizeMood(m = {}) {
  const ids = new Set(MOOD_COLORS.map((c) => c.id));
  const colors = Array.isArray(m.colors) ? [...new Set(m.colors.map(Number))].filter((c) => ids.has(c)) : MOOD_OFF.colors;
  return {
    kind: ['off', 'cycle', 'follow'].includes(m.kind) ? m.kind : 'off',
    colors: colors.length ? colors : MOOD_OFF.colors,
    interval: Number.isFinite(m.interval) && m.interval >= 1 && m.interval <= 30 ? Math.round(m.interval) : 5,
    shuffle: !!m.shuffle,
    region: REGION_WEIGHT[m.region] ? m.region : 'all',
  };
}
persisted.mood = sanitizeMood(persisted.mood);

async function setMoodAuto(cfg) {
  const before = persisted.mood.kind;
  persisted.mood = sanitizeMood(cfg); persist();
  M.idx = -1;
  if (before !== persisted.mood.kind) { M.last = 0; M.prepared = false; }
  if (persisted.mood.kind !== 'off') { connect(); return; }
  // Kapatılınca otomatik başlamadan önceki renge dön (yanıt bundan sonra döner; arayüz
  // ardından elle renk seçerse onun üzerine yazılmaz)
  if (before !== 'off' && S.kb && persisted.moodBefore != null) {
    while (M.busy) await new Promise((r) => setTimeout(r, 5));
    try { await S.kb.setMoodColor(persisted.moodBefore); M.cur = persisted.moodBefore; } catch (e) { drop(e.message); }
  }
  persisted.moodBefore = null; persist();
}

function dominantMoodColor(raw, region) {
  const votes = new Float32Array(MOOD_COLORS.length);
  const weight = REGION_WEIGHT[region] || REGION_WEIGHT.all;
  for (const k of KEYS) {
    const w = weight(k); if (!w) continue;
    const r = raw[k.i * 3], g = raw[k.i * 3 + 1], b = raw[k.i * 3 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < 0.08) continue;
    let best = 0; // beyaz (doygunluğu düşük)
    if ((mx - mn) / mx >= 0.25) {
      let bd = Infinity;
      for (let c = 1; c < MOOD_RGB.length; c++) {
        const m = MOOD_RGB[c];
        const d = (r / mx - m[0]) ** 2 + (g / mx - m[1]) ** 2 + (b / mx - m[2]) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
    }
    votes[best] += mx * w;
  }
  // mevcut renge küçük avantaj: iki renk başa baş giderken titremesin
  let win = M.cur ?? 0, wv = (votes[win] || 0) * 1.2;
  for (let c = 0; c < votes.length; c++) if (votes[c] > wv) { wv = votes[c]; win = c; }
  return win;
}

async function moodTick() {
  const m = persisted.mood;
  if (m.kind === 'off' || !S.kb || M.busy || P.paused) return;
  const now = performance.now();
  M.busy = true;
  try {
    if (!M.prepared) {
      // Geçişli ve Şarj döngüsü kendi renklerini oynatır; seçilen renk Statik/Nefes'te görünür
      const st = await S.kb.getMood();
      M.cur = st.color;
      if (persisted.moodBefore == null) { persisted.moodBefore = st.color; persist(); }
      if (st.mode !== 1 && st.mode !== 3) await S.kb.setMoodMode(1);
      await S.kb.setMoodOn(true);
      M.prepared = true;
    }
    let next = null;
    if (m.kind === 'cycle') {
      if (M.last && now - M.last < m.interval * 1000) return;
      const list = m.colors;
      if (m.shuffle && list.length > 1) { do next = list[(Math.random() * list.length) | 0]; while (next === M.cur); }
      else { M.idx = (M.idx + 1) % list.length; next = list[M.idx]; }
    } else if (S.cfg && S.lastSent) {
      if (now - M.last < 350) return;
      next = dominantMoodColor(out, m.region);
      if (next === M.cur) return;
    }
    if (next === null) return;
    await S.kb.setMoodColor(next);
    M.cur = next; M.last = now;
  } catch (e) {
    drop('Ortam ışığı ayarlanamadı: ' + e.message);
  } finally { M.busy = false; }
}
setInterval(moodTick, 100);

// ------------------------------------------------------------ ortam ışığı: elle ayarlar
// Tarayıcının WebHID desteği gerekmesin diye (Firefox / Zen vb.) arayüz bu ayarları da servise yollar.
async function ensureKb() {
  if (!S.kb) await connect();
  for (let i = 0; !S.kb && S.connecting && i < 40; i++) await new Promise((r) => setTimeout(r, 50));
  if (!S.kb) throw new Error(S.error || 'Klavye bulunamadı');
  return S.kb;
}
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

async function moodGet() {
  const kb = await ensureKb();
  const st = await kb.getMood();
  const p = st.mode > 0 ? await kb.getMoodParams(st.mode) : null;
  return {
    on: persisted.moodOn !== false, // firmware açık/kapalı durumunu okutmuyor; son ayar saklanır
    mode: st.mode, color: st.color,
    // arayüz yüzde olarak gösterir: parlaklık modun üst sınırına, hız firmware aralığına göre
    brightness: p ? Math.round((p.brightness / moodBrightCap(st.mode)) * 100) : null,
    // Statik harekette firmware hızı 0 tutar (aralığın altında): yüzdeyi 0–100'e sınırla
    speed: p ? clampInt(((p.speed - MOOD_SPEED.min) / (MOOD_SPEED.max - MOOD_SPEED.min)) * 100, 0, 100) : null,
  };
}

async function moodSet(b = {}) {
  const kb = await ensureKb();
  if (typeof b.on === 'boolean') { await kb.setMoodOn(b.on); persisted.moodOn = b.on; persist(); }
  if (Number.isInteger(b.mode) && b.mode >= 1 && b.mode <= 4) await kb.setMoodMode(b.mode);
  if (Number.isInteger(b.color) && MOOD_COLORS.some((c) => c.id === b.color)) { await kb.setMoodColor(b.color); M.cur = b.color; }
  if (Number.isFinite(b.brightness) || Number.isFinite(b.speed)) {
    const st = await kb.getMood();
    if (st.mode > 0) {
      const p = await kb.getMoodParams(st.mode);
      if (Number.isFinite(b.brightness)) p.brightness = clampInt((clampInt(b.brightness, 0, 100) / 100) * moodBrightCap(st.mode), 0, 63);
      if (Number.isFinite(b.speed)) p.speed = clampInt(MOOD_SPEED.min + (clampInt(b.speed, 0, 100) / 100) * (MOOD_SPEED.max - MOOD_SPEED.min), MOOD_SPEED.min, MOOD_SPEED.max);
      await kb.setMoodParams(p);
    }
  }
  return moodGet();
}

// Bağlantı bekçisi: klavye çıkarılıp takılırsa kaldığı yerden sürdür;
// durdurulmuşken geri yükleme yarım kaldıysa tamamla.
setInterval(async () => {
  if (S.kb || S.busy || P.paused) return; // duraklatılmışken klavyeye dokunma (Hive kullanıyor)
  if (S.cfg || persisted.mood.kind !== 'off') await connect();
  else if (persisted.saved) { await connect(); try { await restore(); } catch (e) { drop(e.message); } }
}, 2000);

function status() {
  return {
    service: true,
    paused: P.paused, // Hive açıldığı için duraklatıldı
    pausedFx: P.paused ? persisted.playing?.fxId ?? null : null,
    playing: !!S.cfg,
    fxId: S.cfg?.fxId ?? null,
    cfg: S.cfg, // arayüz açıldığında oynayan efektin ayarlarını göstersin
    connected: !!S.kb,
    present: S.kb ? true : !!findKeyboard(),
    fps: S.kb && S.cfg ? S.fps : 0,
    error: S.cfg && !S.kb ? S.error : null,
    keys: keysAvailable(), // tuş basışları algılanabiliyor mu (Halkalar, kısayollar için)
    rev: REV.n, revSource: REV.source,
    mood: { ...persisted.mood, cur: M.cur },
  };
}

// ------------------------------------------------------------ HTTP: arayüz dosyaları + API
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const ORIGINS = new Set([...HOSTS].map((h) => `http://${h}`));

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 65536) { reject(new Error('İstek çok büyük')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('Geçersiz JSON')); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // Yalnızca bu bilgisayardan, bu adrese yapılan istekler (başka sitelerin localhost'a erişimini engeller)
  if (!HOSTS.has(req.headers.host || '')) return json(res, 403, { error: 'Geçersiz adres' });
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api/')) {
    try {
      if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, status());
      if (req.method !== 'POST') return json(res, 405, { error: 'Yöntem desteklenmiyor' });
      if (req.headers.origin && !ORIGINS.has(req.headers.origin)) return json(res, 403, { error: 'Geçersiz kaynak' });
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'JSON bekleniyor' });
      const body = await readBody(req);
      if (url.pathname === '/api/play') { play(body); return json(res, 200, status()); }
      if (url.pathname === '/api/resume') { resume(); return json(res, 200, status()); }
      if (url.pathname === '/api/stop') { await stop(); return json(res, 200, status()); }
      if (url.pathname === '/api/mood') { await setMoodAuto(body); return json(res, 200, status()); }
      if (url.pathname === '/api/mood/get') return json(res, 200, await moodGet());
      if (url.pathname === '/api/mood/set') return json(res, 200, await moodSet(body));
      if (url.pathname === '/api/quit') { json(res, 200, { ok: true }); return shutdown(false); }
      return json(res, 404, { error: 'Bulunamadı' });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  if (!(p === '/index.html' || p === '/styles.css' || /^\/js\/[\w.-]+\.js$/.test(p))) return json(res, 404, { error: 'Bulunamadı' });
  fs.readFile(path.join(WEB_DIR, p), (err, buf) => {
    if (err) return json(res, 404, { error: 'Bulunamadı' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)], 'Cache-Control': 'no-store, must-revalidate' });
    res.end(buf);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') log(`Port ${PORT} kullanımda: Real67 Studio zaten çalışıyor olabilir.`);
  else log('Sunucu hatası:', e.message);
  process.exit(1);
});
server.listen(PORT, '127.0.0.1', () => {
  log(`Real67 Studio: http://localhost:${PORT}/  (kapatmak için Ctrl+C)`);
  if (!keysAvailable()) log('Tuş basışları algılanamıyor (koffi kurulu değil): Halkalar tepkisiz kalır. kur.bat ile yeniden kurun.');
  if (persisted.playing) {
    try { play(persisted.playing, 'service'); log('Son efekt sürdürülüyor:', persisted.playing.fxId); }
    catch (e) { persisted.playing = null; persist(); log('Kayıtlı efekt yüklenemedi:', e.message); }
  }
  if (persisted.mood.kind !== 'off') { connect(); log('Ortam ışığı otomatiği:', persisted.mood.kind); }
});

// ------------------------------------------------------------ kapanış
// keepPlaying: pencere kapatıldı ya da oturum kapanıyor → klavyeyi eski ışığına döndür,
// ama efekti hatırla (servis yeniden başlayınca sürsün). /api/quit ise efekti de bırakır.
let closing = false;
async function shutdown(keepPlaying) {
  if (closing) return;
  closing = true;
  const resume = keepPlaying ? persisted.playing : null;
  try { await stop(); } catch { /* elden gelen yapıldı */ }
  persisted.playing = resume; persist();
  server.close();
  setTimeout(() => process.exit(0), 100);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, () => shutdown(true));
