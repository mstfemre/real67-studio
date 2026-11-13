// Tuş basışlarını algılama: basışa tepki veren efektler (Halkalar) için.
//
// Klavyenin ışık arayüzü basılan tuşu bildirmiyor; bu yüzden Windows'a "şu tuş şu an basılı mı"
// diye sorulur (GetAsyncKeyState). Klavye kancası KURULMAZ: tuşlar bu süreçten geçmez, yazma ve
// oyun gecikmesi etkilenmez. Yalnızca "hangi konumdaki tuşa basıldı" bilgisi o karedeki ışık
// için kullanılır; hiçbir yere yazılmaz, saklanmaz, gönderilmez.
import { createRequire } from 'node:module';
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

export const keysAvailable = () => !!api;

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
export function hotkeyReader(isDown = (vk) => (api.state(vk) & 0x8000) !== 0, now = Date.now) {
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
  if (!api) return;
  remap(Date.now());
  for (const k of KEYS) for (const vk of table[k.i]) down[vk] = api.state(vk) & 0x8000 ? 1 : 0;
}
