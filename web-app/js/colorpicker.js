// Uygulamanın kendi renk seçicisi: tarayıcının / Windows'un renk penceresi yerine, alanın
// hemen altında açılan küçük bir panel. Renk alanı (doygunluk × parlaklık), ton şeridi,
// renk kodu ve klavye ışığında iyi görünen hazır renkler.

const PRESETS = [
  '#ff1a1a', '#ff6a00', '#ffc400', '#b6ff00', '#2aff4a', '#00ffa3', '#00e5ff', '#1a8cff',
  '#2b3cff', '#7a2bff', '#c02bff', '#ff2bd6', '#ff2e7a', '#ffd9a8', '#ffffff', '#000000',
];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const norm = (hex) => {
  let s = String(hex ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = [...s].map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(s) ? '#' + s.toLowerCase() : null;
};
function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h /= 6; if (h < 0) h += 1;
  }
  return { h, s: mx ? d / mx : 0, v: mx };
}
function hsvToHex({ h, s, v }) {
  const f = (n) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

let pop = null, sv, hue, hexIn, chip, presets;
let cur = null; // { anchor, hsv, onInput }

function build() {
  pop = document.createElement('div');
  pop.className = 'cp'; pop.hidden = true;
  pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Renk seç');
  pop.innerHTML = `
    <div class="cp-sv" tabindex="0" role="slider" aria-label="Doygunluk ve parlaklık"><i></i></div>
    <div class="cp-hue" tabindex="0" role="slider" aria-label="Renk tonu" aria-valuemin="0" aria-valuemax="360"><i></i></div>
    <div class="cp-row"><i class="cp-chip"></i><input class="cp-hex" type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Renk kodu" /></div>
    <div class="cp-presets" role="group" aria-label="Hazır renkler"></div>`;
  sv = pop.querySelector('.cp-sv'); hue = pop.querySelector('.cp-hue');
  hexIn = pop.querySelector('.cp-hex'); chip = pop.querySelector('.cp-chip'); presets = pop.querySelector('.cp-presets');
  for (const c of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button'; b.style.background = c; b.dataset.c = c; b.title = c.toUpperCase(); b.setAttribute('aria-label', c.toUpperCase());
    b.addEventListener('click', () => setHex(c, true));
    presets.append(b);
  }

  drag(sv, (x, y) => { cur.hsv.s = x; cur.hsv.v = 1 - y; sync(true); });
  drag(hue, (x) => { cur.hsv.h = Math.min(0.9999, x); sync(true); });
  sv.addEventListener('keydown', (e) => {
    const d = e.shiftKey ? 0.1 : 0.02;
    const m = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] }[e.key];
    if (!m) return;
    e.preventDefault();
    cur.hsv.s = clamp01(cur.hsv.s + m[0]); cur.hsv.v = clamp01(cur.hsv.v + m[1]); sync(true);
  });
  hue.addEventListener('keydown', (e) => {
    const d = (e.shiftKey ? 15 : 3) / 360;
    const m = { ArrowLeft: -d, ArrowDown: -d, ArrowRight: d, ArrowUp: d }[e.key];
    if (!m) return;
    e.preventDefault();
    cur.hsv.h = (cur.hsv.h + m + 1) % 1; sync(true);
  });
  hexIn.addEventListener('input', () => { const n = norm(hexIn.value); if (n) setHex(n, true, false); });
  hexIn.addEventListener('blur', () => { if (cur) hexIn.value = hsvToHex(cur.hsv).toUpperCase(); });
  hexIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); close(true); } });

  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(true); } });
  document.addEventListener('pointerdown', (e) => {
    if (!cur || pop.contains(e.target) || cur.anchor.contains(e.target)) return;
    // alanın etiketine tıklamak düğmeyi tetikler; onu düğmenin kendi tıklaması yönetsin
    if (e.target.closest?.('label')?.contains(cur.anchor)) return;
    close(false);
  }, true);
  window.addEventListener('resize', () => cur && place());
  window.addEventListener('scroll', () => cur && place(), true);
  document.body.append(pop);
}

function drag(el, fn) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); el.focus(); el.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = el.getBoundingClientRect();
      fn(clamp01((ev.clientX - r.left) / r.width), clamp01((ev.clientY - r.top) / r.height));
    };
    const end = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end); };
    move(e);
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  });
}

function setHex(hex, emit, writeField = true) {
  const next = hexToHsv(hex);
  // gri / siyah tonun rengi yoktur: seçili tonu koru, kaydırıcı sıçramasın
  if (next.s === 0 || next.v === 0) next.h = cur.hsv.h;
  cur.hsv = next;
  sync(emit, writeField);
}

function sync(emit, writeField = true) {
  const { h, s, v } = cur.hsv, hex = hsvToHex(cur.hsv);
  pop.style.setProperty('--h', String(Math.round(h * 360)));
  pop.style.setProperty('--c', hex);
  sv.firstElementChild.style.left = s * 100 + '%'; sv.firstElementChild.style.top = (1 - v) * 100 + '%';
  hue.firstElementChild.style.left = h * 100 + '%';
  hue.setAttribute('aria-valuenow', String(Math.round(h * 360)));
  sv.setAttribute('aria-valuetext', `doygunluk %${Math.round(s * 100)}, parlaklık %${Math.round(v * 100)}`);
  chip.style.background = hex;
  if (writeField) hexIn.value = hex.toUpperCase();
  for (const b of presets.children) b.setAttribute('aria-pressed', String(b.dataset.c === hex));
  if (emit) cur.onInput(hex);
}

function place() {
  const a = cur.anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, gap = 8, pad = 10;
  let left = Math.min(window.innerWidth - w - pad, Math.max(pad, a.right - w));
  let top = a.bottom + gap;
  if (top + h > window.innerHeight - pad && a.top - gap - h >= pad) top = a.top - gap - h; // aşağıda yer yoksa yukarı aç
  pop.style.left = left + 'px'; pop.style.top = Math.max(pad, top) + 'px';
}

function open(anchor, hex, onInput) {
  if (!pop) build();
  if (cur) cur.anchor.setAttribute('aria-expanded', 'false');
  cur = { anchor, hsv: hexToHsv(hex), onInput };
  anchor.setAttribute('aria-expanded', 'true');
  pop.hidden = false;
  sync(false);
  place();
  sv.focus({ preventScroll: true });
}

function close(refocus) {
  if (!cur) return;
  const a = cur.anchor;
  cur = null; pop.hidden = true;
  a.setAttribute('aria-expanded', 'false');
  if (refocus) a.focus();
}
export const closeColorPicker = () => close(false);

// Renk düğmesi: renk karesi + kodu. Tıklayınca seçici açılır; seçim sürerken onInput(hex) çağrılır.
export function colorControl(value, onInput) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'color-btn';
  btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
  const sw = document.createElement('i'), txt = document.createElement('span');
  btn.append(sw, txt);
  let v = norm(value) || '#000000';
  const paint = () => { btn.style.setProperty('--c', v); txt.textContent = v.toUpperCase(); };
  paint();
  btn.addEventListener('click', () => {
    if (cur?.anchor === btn) return close(false);
    open(btn, v, (hex) => { v = hex; paint(); onInput(hex); });
  });
  return {
    el: btn,
    get value() { return v; },
    set(hex) { const n = norm(hex); if (n && n !== v) { v = n; paint(); if (cur?.anchor === btn) setHex(n, false); } },
  };
}

// Sayfadaki hazır <input type="color"> alanlarını aynı düğmeye çevirir. Girdi gizli kalır;
// .value okuma/yazma ve 'input' olayı eskisi gibi çalışır.
export function enhanceColorInput(input) {
  const start = input.value;
  input.type = 'hidden';
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  desc.set.call(input, start);
  const ctl = colorControl(start, (hex) => { desc.set.call(input, hex); input.dispatchEvent(new Event('input', { bubbles: true })); });
  Object.defineProperty(input, 'value', {
    configurable: true,
    get: () => desc.get.call(input),
    set: (x) => { desc.set.call(input, x); ctl.set(x); },
  });
  input.after(ctl.el);
  return ctl;
}
