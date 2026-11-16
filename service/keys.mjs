// Tuş basışlarını algılama: basışa tepki veren efektler (Halkalar) için.
//
// Klavyenin ışık arayüzü basılan tuşu bildirmiyor; bu yüzden Windows'a "şu tuş şu an basılı mı"
// diye sorulur (GetAsyncKeyState). Klavye kancası KURULMAZ: tuşlar bu süreçten geçmez, yazma ve
// oyun gecikmesi etkilenmez. Yalnızca "hangi konumdaki tuşa basıldı" bilgisi o karedeki ışık
// için kullanılır; hiçbir yere yazılmaz, saklanmaz, gönderilmez.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { KEYS } from '../web-app/js/layout.js';

// Tuşun fiziksel konumu (tarama kodu). Sanal tuş koduna her seferinde o anki klavye
// düzeniyle çevrilir; böylece Türkçe Q / F ya da başka düzende de doğru tuş yanar.
const SCAN = {
  Escape: 0x01, Digit1: 0x02, Digit2: 0x03, Digit3: 0x04, Digit4: 0x05, Digit5: 0x06, Digit6: 0x07,
  Digit7: 0x08, Digit8: 0x09, Digit9: 0x0a, Digit0: 0x0b, Minus: 0x0c, Equal: 0x0d, Backspace: 0x0e,
  Tab: 0x0f, KeyQ: 0x10, KeyW: 0x11, KeyE: 0x12, KeyR: 0x13, KeyT: 0x14, KeyY: 0x15, KeyU: 0x16,
  KeyI: 0x17, KeyO: 0x18, KeyP: 0x19, BracketLeft: 0x1a, BracketRight: 0x1b, Enter: 0x1c,
  ControlLeft: 0x1d, KeyA: 0x1e, KeyS: 0x1f, KeyD: 0x20, KeyF: 0x21, KeyG: 0x22, KeyH: 0x23,
  KeyJ: 0x24, KeyK: 0x25, KeyL: 0x26, Semicolon: 0x27, Quote: 0x28, ShiftLeft: 0x2a, Backslash: 0x2b,
  KeyZ: 0x2c, KeyX: 0x2d, KeyC: 0x2e, KeyV: 0x2f, KeyB: 0x30, KeyN: 0x31, KeyM: 0x32, Comma: 0x33,
  Period: 0x34, Slash: 0x35, ShiftRight: 0x36, AltLeft: 0x38, Space: 0x39, CapsLock: 0x3a,
};
// Düzenden bağımsız sanal tuş kodları (genişletilmiş tuşlar)
const VKEY = {
  PrintScreen: [0x2c], Delete: [0x2e], ArrowLeft: [0x25], ArrowUp: [0x26], ArrowRight: [0x27], ArrowDown: [0x28],
  MetaLeft: [0x5b], AltRight: [0xa5],
  MediaTrackNext: [0xb0], MediaTrackPrevious: [0xb1],
  CapsLock: [0xb3],   // bu konum oynat/duraklat olarak atanmış olabilir
};
const EXTRA_SCAN = { Escape: 0x29 }; // Esc konumu Fn ile ` / " tuşu olur
const VK_LCONTROL = 0xa2, VK_RMENU = 0xa5;

let api = null;
try {
  if (process.platform === 'win32') {
    const koffi = createRequire(import.meta.url)('koffi');
    const u = koffi.load('user32.dll');
    api = {
      state: u.func('short GetAsyncKeyState(int vKey)'),
      map: u.func('uint32_t MapVirtualKeyExW(uint32_t uCode, uint32_t uMapType, void *dwhkl)'),
      fg: u.func('void *GetForegroundWindow()'),
      tid: u.func('uint32_t GetWindowThreadProcessId(void *hWnd, void *lpdwProcessId)'),
      hkl: u.func('void *GetKeyboardLayout(uint32_t idThread)'),
    };
  }
} catch { api = null; /* koffi kurulu değil: basışa tepki veren efektler tepkisiz kalır */ }


// ------------------------------------------------------------ Linux: evdev
// Linux'ta GetAsyncKeyState yok; klavyenin /dev/input/eventN düğümü okunur. Cihaz "grab"
// edilmez: tuşlar Hyprland'e ve programlara her zamanki gibi gider, bu süreç yalnızca kopyasını
// görür. Kodlar fiziksel konumdur (düzenden bağımsız), Türkçe Q / F'de de doğru tuş yanar.
// Okuma izni için udev kuralı gerekir (linux/70-real67.rules, linux/kur.sh kurar).
const LINUX = process.platform === 'linux';
const EV_CODE = {
  Escape: [1, 41], Digit1: [2], Digit2: [3], Digit3: [4], Digit4: [5], Digit5: [6], Digit6: [7], Digit7: [8],
  Digit8: [9], Digit9: [10], Digit0: [11], Minus: [12], Equal: [13], Backspace: [14], PrintScreen: [99],
  Tab: [15], KeyQ: [16], KeyW: [17], KeyE: [18], KeyR: [19], KeyT: [20], KeyY: [21], KeyU: [22], KeyI: [23],
  KeyO: [24], KeyP: [25], BracketLeft: [26], BracketRight: [27], Backslash: [43], Delete: [111],
  CapsLock: [58, 164], KeyA: [30], KeyS: [31], KeyD: [32], KeyF: [33], KeyG: [34], KeyH: [35], KeyJ: [36],
  KeyK: [37], KeyL: [38], Semicolon: [39], Quote: [40], Enter: [28], MediaTrackPrevious: [165],
  ShiftLeft: [42], KeyZ: [44], KeyX: [45], KeyC: [46], KeyV: [47], KeyB: [48], KeyN: [49], KeyM: [50],
  Comma: [51], Period: [52], Slash: [53], ShiftRight: [54], ArrowUp: [103], MediaTrackNext: [163],
  ControlLeft: [29], MetaLeft: [125], AltLeft: [56], Space: [57], AltRight: [100],
  ArrowLeft: [105], ArrowDown: [108], ArrowRight: [106],
};
const EV = {
  codeToKey: new Map(), // evdev kodu → KEYS öğesi
  held: new Uint8Array(768), // şu an basılı olanlar
  pending: new Set(), // son yoklamadan beri basılan tuşlar (KEYS indeksi)
  streams: new Map(), // /dev/input/eventN → okuma akışı
  ok: false, error: null,
};
for (const k of KEYS) for (const c of EV_CODE[k.code] || []) EV.codeToKey.set(c, k);

// Real67'nin (VID 0416, PID 0112) olay düğümleri
function real67EventNodes() {
  try {
    return fs.readFileSync('/proc/bus/input/devices', 'utf8').split('\n\n')
      .filter((b) => /Vendor=0416 Product=0112/i.test(b))
      .flatMap((b) => (b.match(/Handlers=.*/)?.[0].match(/event\d+/g) || []).map((e) => '/dev/input/' + e));
  } catch { return []; }
}
function openEvdev() {
  for (const node of real67EventNodes()) {
    if (EV.streams.has(node)) continue;
    try { fs.accessSync(node, fs.constants.R_OK); } catch { EV.error = `${node} okunamıyor (udev kuralı kurulu mu?)`; continue; }
    const st = fs.createReadStream(node, { highWaterMark: 24 * 64 });
    let rest = Buffer.alloc(0);
    st.on('data', (chunk) => {
      const buf = rest.length ? Buffer.concat([rest, chunk]) : chunk;
      let o = 0;
      for (; o + 24 <= buf.length; o += 24) { // struct input_event (64 bit): zaman 16 + tür 2 + kod 2 + değer 4
        if (buf.readUInt16LE(o + 16) !== 1) continue; // EV_KEY
        const code = buf.readUInt16LE(o + 18), value = buf.readInt32LE(o + 20);
        if (code >= EV.held.length) continue;
        if (value === 1 && !EV.held[code]) { const k = EV.codeToKey.get(code); if (k) EV.pending.add(k.i); }
        if (value !== 2) EV.held[code] = value ? 1 : 0; // 2 = otomatik tekrar
      }
      rest = buf.subarray(o);
    });
    const gone = () => { EV.streams.delete(node); EV.held.fill(0); };
    st.on('error', gone); st.on('close', gone);
    EV.streams.set(node, st);
    EV.error = null;
  }
  EV.ok = EV.streams.size > 0;
}
if (LINUX) {
  openEvdev();
  setInterval(openEvdev, 2000).unref(); // klavye çıkarılıp takılırsa yeniden bağlan
}
// Windows sanal tuş kodu → evdev kodları (hotkeyReader Windows kodlarıyla çalışır)
const VK_TO_EV = { 0x10: [42, 54], 0x11: [29, 97], 0x12: [56, 100], 0x5b: [125], 0x5c: [126], 0x25: [105], 0x26: [103], 0x27: [106], 0x28: [108] };
const evIsDown = (vk) => (VK_TO_EV[vk] || []).some((c) => EV.held[c]);
export const keysError = () => (LINUX ? EV.error : null);

export const keysAvailable = () => (LINUX ? EV.ok : !!api);

// tuş indeksi → izlenecek sanal tuş kodları
let table = [], mappedAt = 0, layout = null;
const down = new Uint8Array(256);

function remap(now) {
  mappedAt = now;
  let h = null;
  try { h = api.hkl(api.tid(api.fg(), null)); } catch { /* ön planda pencere yok */ }
  if (table.length && String(h) === layout) return;
  layout = String(h);
  table = KEYS.map((k) => {
    const vks = [...(VKEY[k.code] || [])];
    for (const sc of [SCAN[k.code], EXTRA_SCAN[k.code]]) {
      if (sc !== undefined) { const vk = api.map(sc, 3, h); if (vk) vks.push(vk); } // 3 = MAPVK_VSC_TO_VK_EX (sol/sağ ayrımlı)
    }
    return vks.filter((v) => v > 0 && v < 256);
  });
}

// Son çağrıdan beri basılan tuşlar (layout.js'teki KEYS öğeleri). Basılı tutmak tekrar saymaz.
export function pollPresses() {
  if (LINUX) { const hits = [...EV.pending].map((i) => KEYS[i]); EV.pending.clear(); return hits; }
  if (!api) return [];
  const now = Date.now();
  if (now - mappedAt > 1500) remap(now);
  const hits = [];
  let ctrl = null, altGr = false;
  for (const k of KEYS) {
    for (const vk of table[k.i]) {
      const s = api.state(vk);
      const isDown = (s & 0x8000) !== 0;
      // düşük bit: iki yoklama arasına sığan çok kısa basışları da yakalar
      if ((isDown || (s & 1)) && !down[vk]) {
        if (vk === VK_LCONTROL) ctrl = k; else { hits.push(k); if (vk === VK_RMENU) altGr = true; }
      }
      down[vk] = isDown ? 1 : 0;
    }
  }
  // AltGr, Windows'ta sol Ctrl + sağ Alt olarak gelir: yalnızca sağ Alt'ı say
  if (ctrl && !altGr) hits.push(ctrl);
  return hits;
}

// ------------------------------------------------------------ kısayollar
// Ctrl+Alt+← / →: önceki / sonraki efekt.  Ctrl+Alt+↑ / ↓: parlaklık (basılı tutunca tekrarlar).
// Tuşlar yutulmaz (kanca yok): öndeki program da aynı tuşları görür. Shift ya da Win de basılıysa
// kısayol sayılmaz; AltGr (Windows'ta Ctrl+Alt) da çalışır.
const VK = { shift: 0x10, ctrl: 0x11, alt: 0x12, lwin: 0x5b, rwin: 0x5c };
const HOTKEYS = [['prev', 0x25, false], ['next', 0x27, false], ['up', 0x26, true], ['down', 0x28, true]];
const REPEAT_DELAY = 400, REPEAT_EVERY = 120; // ms

// isDown ve now dışarıdan verilebilir (sınama için). Her çağrıda yeni basılan kısayolları döner.
export function hotkeyReader(isDown = LINUX ? evIsDown : (vk) => (api.state(vk) & 0x8000) !== 0, now = Date.now) {
  const held = new Map();
  return () => {
    const mods = isDown(VK.ctrl) && isDown(VK.alt) && !isDown(VK.shift) && !isDown(VK.lwin) && !isDown(VK.rwin);
    const fired = [];
    for (const [action, vk, repeat] of HOTKEYS) {
      if (!mods || !isDown(vk)) { held.delete(action); continue; }
      const t = now(), h = held.get(action);
      if (!h) { held.set(action, { t0: t, last: t }); fired.push(action); }
      else if (repeat && t - h.t0 >= REPEAT_DELAY && t - h.last >= REPEAT_EVERY) { h.last = t; fired.push(action); }
    }
    return fired;
  };
}

// Efekt başlarken çağrılır: o ana kadar basılmış / basılı tuşlar halka başlatmasın
export function resetPresses() {
  if (LINUX) { EV.pending.clear(); return; }
  if (!api) return;
  remap(Date.now());
  for (const k of KEYS) for (const vk of table[k.i]) down[vk] = api.state(vk) & 0x8000 ? 1 : 0;
}
