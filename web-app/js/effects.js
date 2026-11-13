// Yazılım efektleri. Her efekt her karede 67 tuş için 0..1 aralığında RGB üretir.
// frame(ctx) -> ctx.out (Float32Array 67*3) doldurulur.
import { KEYS, WIDTH_U, HEIGHT_U, colOf } from './layout.js';

const N = KEYS.length;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const fract = (v) => v - Math.floor(v);
const mix = (a, b, t) => a + (b - a) * t;

export function hsv(h, s, v) {
  h = fract(h) * 6;
  const i = Math.floor(h), f = h - i;
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
}
export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function samplePalette(stops, t) {
  t = fract(t) * stops.length;
  const i = Math.floor(t), f = t - i;
  const a = stops[i % stops.length], b = stops[(i + 1) % stops.length];
  return [mix(a[0], b[0], f), mix(a[1], b[1], f), mix(a[2], b[2], f)];
}
function rampPalette(stops, t) { // döngüsüz
  t = clamp(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
  const a = stops[i], b = stops[i + 1];
  return [mix(a[0], b[0], f), mix(a[1], b[1], f), mix(a[2], b[2], f)];
}

// Basit değer gürültüsü (3B)
const PERM = new Uint8Array(512);
{ const p = [...Array(256).keys()]; let s = 1337;
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; }
const hash3 = (x, y, z) => PERM[(PERM[(PERM[x & 255] + y) & 255] + z) & 255] / 255;
const sm = (t) => t * t * (3 - 2 * t);
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
  const l = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  const x00 = mix(l(0, 0, 0), l(1, 0, 0), xf), x10 = mix(l(0, 1, 0), l(1, 1, 0), xf);
  const x01 = mix(l(0, 0, 1), l(1, 0, 1), xf), x11 = mix(l(0, 1, 1), l(1, 1, 1), xf);
  return mix(mix(x00, x10, yf), mix(x01, x11, yf), zf);
}

const PALETTES = {
  gokkusagi: null,
  aurora: ['#00ffa3', '#00b3ff', '#6a00ff', '#ff00c8', '#00ffa3'].map(hexToRgb),
  okyanus: ['#001a4d', '#0066ff', '#00e5ff', '#9ffcff', '#0066ff'].map(hexToRgb),
  gunbatimi: ['#ff2e63', '#ff8c00', '#ffd23f', '#ff2e63', '#7b2cbf'].map(hexToRgb),
  orman: ['#0b3d0b', '#2bd52b', '#c3ff00', '#0f7a3a'].map(hexToRgb),
  lav: ['#200000', '#ff1e00', '#ff8a00', '#ffd000', '#ff1e00'].map(hexToRgb),
  siber: ['#ff00e6', '#00f0ff', '#7a00ff', '#00f0ff'].map(hexToRgb),
  // Kullanıcının gönderdiği 8 desen (görseldeki sırayla). Paletler döngüseldir:
  // son renkten ilk renge yumuşak geçişle başa sarar.
  kizil: ['#ff0000', '#c00000', '#800000', '#400000', '#000000'].map(hexToRgb),
  mavikizil: ['#1a1aff', '#5a14d2', '#9a0f96', '#d0084a', '#ff0000'].map(hexToRgb),
  gece: ['#000000', '#0000ff', '#a000a0', '#ff0000'].map(hexToRgb),
  seftali: ['#ffb347', '#ff8a55', '#ff5e62', '#ff3a40', '#ff2a2a'].map(hexToRgb),
  limonbuz: ['#c8ff4d', '#5fe9b0', '#00d4ff', '#5fe9b0'].map(hexToRgb),
  saripembe: ['#ffe100', '#ff7a6a', '#ff00d4', '#ff7a6a'].map(hexToRgb),
  morotesi: ['#ff0090', '#8a00c8', '#4a00d0', '#6a00e6', '#a000ff', '#d800c8'].map(hexToRgb),
  tamspektrum: ['#d400ff', '#0020ff', '#00e5ff', '#00ff3c', '#fff200', '#ff8a00', '#ff1a1a'].map(hexToRgb),
  beyazsiyah: ['#ffffff', '#000000'].map(hexToRgb),
  buzul: ['#ffffff', '#9ffcff', '#00b3ff', '#0033cc', '#00b3ff', '#9ffcff'].map(hexToRgb),
  altin: ['#1a0f00', '#b8860b', '#ffd700', '#fff3b0', '#ffd700', '#b8860b'].map(hexToRgb),
  sakura: ['#ffe4ec', '#ffb7c5', '#ff6f91', '#ff2d6f', '#ff6f91', '#ffb7c5'].map(hexToRgb),
  atesbuz: ['#ff3000', '#ff9000', '#7a00ff', '#00c8ff', '#0030ff', '#7a00ff'].map(hexToRgb),
  zumrut: ['#002b1f', '#00a86b', '#50ffb0', '#00a86b'].map(hexToRgb),
  nebula: ['#0b0033', '#4b0082', '#ff00aa', '#00d4ff', '#4b0082'].map(hexToRgb),
  lagun: ['#003b46', '#07757b', '#00c2c7', '#66fcf1', '#00c2c7'].map(hexToRgb),
  zehir: ['#39ff14', '#00ff9c', '#b000ff', '#ff00e6', '#b000ff'].map(hexToRgb),
  bakir: ['#2b0e00', '#b45309', '#ff7f3f', '#ffc48a', '#ff7f3f', '#b45309'].map(hexToRgb),
  vapor: ['#ff71ce', '#b967ff', '#01cdfe', '#05ffa1', '#01cdfe', '#b967ff'].map(hexToRgb),
  yesilkod: ['#000000', '#003b00', '#00ff41', '#b6ffb6', '#00ff41', '#003b00'].map(hexToRgb),
  seker: ['#ff4d6d', '#ffd60a', '#4cc9f0', '#7209b7'].map(hexToRgb),
  kraliyet: ['#0a0a3d', '#1f1fbf', '#ffd700', '#1f1fbf'].map(hexToRgb),
  tropik: ['#ff6b35', '#f7c548', '#00d9a3', '#00a6ed', '#00d9a3', '#f7c548'].map(hexToRgb),
};
export const PALETTE_OPTS = [
  // Görünen adlar İngilizce (kullanıcının isteği); kimlikler (ilk sütun) kayıtlı ayarlarda geçtiği için değişmez.
  ['gokkusagi', 'Prism'], ['aurora', 'Borealis'], ['okyanus', 'Abyss'], ['gunbatimi', 'Afterglow'],
  ['orman', 'Venom'], ['lav', 'Magma'], ['siber', 'Cyberpunk'],
  ['kizil', 'Bloodmoon'], ['mavikizil', 'Synthwave'], ['gece', 'Eclipse'], ['seftali', 'Solar Flare'],
  ['limonbuz', 'Mojito'], ['saripembe', 'Miami Vice'], ['morotesi', 'Ultraviolet'], ['tamspektrum', 'Hyperspace'],
  ['beyazsiyah', 'Noir'], ['buzul', 'Glacier'], ['altin', 'Midas'], ['sakura', 'Sakura'],
  ['atesbuz', 'Fire & Ice'], ['zumrut', 'Emerald'], ['nebula', 'Nebula'],
  ['lagun', 'Lagoon'], ['zehir', 'Toxic'], ['bakir', 'Copper'], ['vapor', 'Vaporwave'],
  ['yesilkod', 'Mainframe'], ['seker', 'Candy Pop'], ['kraliyet', 'Royale'], ['tropik', 'Tropicana'],
];
export function paletteCss(name) {
  const stops = [];
  for (let i = 0; i <= 16; i++) {
    const [r, g, b] = pal(name, i / 16);
    stops.push(`rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}) ${(i / 16) * 100}%`);
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
export function pal(name, t) { return palFn(name, t); }
const palFn = (name, t) => (name === 'gokkusagi' || !PALETTES[name] ? hsv(t, 1, 1) : samplePalette(PALETTES[name], t));

const put = (out, i, c, k = 1) => { out[i * 3] = c[0] * k; out[i * 3 + 1] = c[1] * k; out[i * 3 + 2] = c[2] * k; };
const CX = WIDTH_U / 2, CY = HEIGHT_U / 2;
// "Canlı" renk: en parlak kanal 1'e çekilir, böylece koyu palet rengi de parlak ışık verir.
const vivid = (c) => { const mx = Math.max(c[0], c[1], c[2], 0.001); return [c[0] / mx, c[1] / mx, c[2] / mx]; };
// Paletten rastgele ama görünür bir renk: siyaha yakın bir yere denk gelirse yeniden dener.
const randVivid = (name) => {
  let c = pal(name, Math.random());
  for (let i = 0; i < 6 && Math.max(c[0], c[1], c[2]) < 0.3; i++) c = pal(name, Math.random());
  return vivid(c);
};
// Sıra sıra tuşlar (soldan sağa) ve her tuşun bitişik komşuları (aynı sırada yan yana, alt/üst sırada üst üste binen).
const ROW_KEYS = Array.from({ length: HEIGHT_U }, (_, r) => KEYS.filter((k) => k.row === r));
const NEIGH = KEYS.map((a) => KEYS.filter((b) => {
  if (a === b) return false;
  const gap = Math.abs(a.cx - b.cx) - (a.w + b.w) / 2; // < 0: yatayda üst üste biniyor
  return a.row === b.row ? gap < 0.6 : Math.abs(a.row - b.row) === 1 && gap < -0.2;
}));

export const EFFECTS = [
  {
    id: 'rainbow', name: 'Gökkuşağı dalgası', hint: 'Klavyenin üzerinden akan renk bandı.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0, max: 2, step: 0.01, def: 0.35 },
      { key: 'angle', label: 'Yön (°)', type: 'range', min: 0, max: 360, step: 1, def: 0 },
      { key: 'scale', label: 'Bant genişliği', type: 'range', min: 0.2, max: 3, step: 0.01, def: 1 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'gokkusagi' },
    ],
    frame({ t, p, out }) {
      const a = (p.angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
      for (const k of KEYS) put(out, k.i, pal(p.palette, ((k.cx * ca + k.cy * sa) / WIDTH_U) / p.scale - t * p.speed));
    },
  },
  {
    id: 'spectrum', name: 'Spektrum döngüsü', hint: 'Tüm tuşlar birlikte renk değiştirir.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0, max: 1, step: 0.01, def: 0.1 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'gokkusagi' },
    ],
    frame({ t, p, out }) { const c = pal(p.palette, t * p.speed); for (let i = 0; i < N; i++) put(out, i, c); },
  },
  {
    id: 'aurora', name: 'Kuzey ışıkları', hint: 'Yavaşça dalgalanan, gürültü tabanlı renk perdeleri.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0, max: 2, step: 0.01, def: 0.4 },
      { key: 'zoom', label: 'Doku', type: 'range', min: 0.05, max: 0.6, step: 0.01, def: 0.18 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'aurora' },
    ],
    frame({ t, p, out }) {
      for (const k of KEYS) {
        const n = noise3(k.cx * p.zoom, k.cy * p.zoom * 1.6, t * p.speed * 0.5);
        const v = clamp(0.25 + 1.1 * noise3(k.cx * p.zoom * 0.7 + 50, t * p.speed * 0.35, k.cy * 0.3));
        put(out, k.i, pal(p.palette, n * 1.3 + t * p.speed * 0.03), v);
      }
    },
  },
  {
    id: 'fire', name: 'Ateş', hint: 'Alt sıradan yükselen alevler.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0.2, max: 3, step: 0.05, def: 1 },
      { key: 'cooling', label: 'Soğuma', type: 'range', min: 0.02, max: 0.4, step: 0.01, def: 0.16 },
      { key: 'sparking', label: 'Kıvılcım', type: 'range', min: 0, max: 1, step: 0.01, def: 0.6 },
      { key: 'blue', label: 'Mavi alev', type: 'toggle', def: false },
    ],
    init(s) { s.heat = new Float32Array(WIDTH_U * (HEIGHT_U + 2)); s.acc = 0; },
    frame({ dt, p, out, s }) {
      const W = WIDTH_U, H = HEIGHT_U + 2, h = s.heat;
      s.acc = Math.min(s.acc + dt * p.speed, 0.5); // hız: simülasyon adımı sıklığı
      while (s.acc > 1 / 30) {
        s.acc -= 1 / 30;
        for (let i = 0; i < h.length; i++) h[i] = Math.max(0, h[i] - Math.random() * p.cooling);
        for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) {
          const b = (y + 1) * W;
          h[y * W + x] = (h[b + x] * 2 + h[b + Math.max(0, x - 1)] + h[b + Math.min(W - 1, x + 1)]) / 4.15;
        }
        for (let x = 0; x < W; x++) if (Math.random() < p.sparking) h[(H - 1) * W + x] = clamp(h[(H - 1) * W + x] + 0.5 + Math.random() * 0.6, 0, 1.2);
      }
      const ramp = p.blue
        ? [[0, 0, 0], [0, 0.05, 0.6], [0, 0.6, 1], [0.8, 1, 1]]
        : [[0, 0, 0], [0.7, 0, 0], [1, 0.35, 0], [1, 0.85, 0.2], [1, 1, 0.8]];
      for (const k of KEYS) {
        const v = h[k.row * W + colOf(k)];
        put(out, k.i, rampPalette(ramp, clamp(v)));
      }
    },
  },
  {
    id: 'matrix', name: 'Matrix yağmuru', hint: 'Sütunlardan aşağı süzülen dijital damlalar.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0.5, max: 12, step: 0.1, def: 5 },
      { key: 'density', label: 'Yoğunluk', type: 'range', min: 0.05, max: 1, step: 0.01, def: 0.35 },
      { key: 'color', label: 'Renk', type: 'color', def: '#20ff5a' },
    ],
    init(s) { s.drops = []; s.trail = new Float32Array(N); },
    frame({ dt, p, out, s }) {
      if (Math.random() < p.density * dt * 8) s.drops.push({ x: Math.floor(Math.random() * WIDTH_U), y: -0.5, v: p.speed * (0.6 + Math.random() * 0.8) });
      for (let i = 0; i < N; i++) s.trail[i] *= Math.pow(0.04, dt);
      for (const d of s.drops) {
        d.y += d.v * dt;
        for (const k of KEYS) if (colOf(k) === d.x || (k.w > 1.6 && d.x >= k.x && d.x < k.x + k.w)) {
          if (Math.abs(k.cy - d.y) < 0.5) s.trail[k.i] = 1;
        }
      }
      s.drops = s.drops.filter((d) => d.y < HEIGHT_U + 1);
      const c = hexToRgb(p.color);
      for (let i = 0; i < N; i++) {
        const v = s.trail[i];
        const head = v > 0.92 ? (v - 0.92) / 0.08 : 0;
        put(out, i, [mix(c[0] * v, 1, head * 0.7), mix(c[1] * v, 1, head * 0.7), mix(c[2] * v, 1, head * 0.7)]);
      }
    },
  },
  {
    id: 'twinkle', name: 'Yıldız tozu', hint: 'Sakin bir zemin üzerinde rastgele parlayan tuşlar.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0.2, max: 3, step: 0.05, def: 1 },
      { key: 'rate', label: 'Sıklık', type: 'range', min: 0.5, max: 30, step: 0.5, def: 8 },
      { key: 'fade', label: 'Sönme süresi', type: 'range', min: 0.1, max: 3, step: 0.05, def: 0.9 },
      { key: 'base', label: 'Zemin', type: 'color', def: '#0b0630' },
      { key: 'star', label: 'Yıldız', type: 'color', def: '#ffffff' },
      { key: 'rainbow', label: 'Renkli yıldızlar', type: 'toggle', def: true },
    ],
    init(s) { s.v = new Float32Array(N); s.c = Array.from({ length: N }, () => [1, 1, 1]); },
    frame({ dt: realDt, p, out, s }) {
      const dt = realDt * p.speed; // hız: yıldızların doğma ve sönme temposu
      let spawn = p.rate * dt;
      while (spawn > 0) { if (Math.random() < spawn) { const i = (Math.random() * N) | 0; s.v[i] = 1; s.c[i] = p.rainbow ? hsv(Math.random(), 0.7, 1) : hexToRgb(p.star); } spawn -= 1; }
      const b = hexToRgb(p.base), k = Math.pow(0.01, dt / p.fade);
      for (let i = 0; i < N; i++) {
        s.v[i] *= k; const v = s.v[i], c = s.c[i];
        put(out, i, [mix(b[0], c[0], v), mix(b[1], c[1], v), mix(b[2], c[2], v)]);
      }
    },
  },
  {
    id: 'breathe', name: 'İki renkli nefes', hint: 'İki renk arasında yumuşak geçiş ve nefes alma.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0.05, max: 2, step: 0.01, def: 0.3 },
      { key: 'a', label: 'Renk A', type: 'color', def: '#ff2bd6' },
      { key: 'b', label: 'Renk B', type: 'color', def: '#2b7bff' },
      { key: 'depth', label: 'Derinlik', type: 'range', min: 0, max: 1, step: 0.01, def: 0.7 },
    ],
    frame({ t, p, out }) {
      const ph = t * p.speed * Math.PI * 2;
      const A = hexToRgb(p.a), B = hexToRgb(p.b);
      for (const k of KEYS) {
        const m = 0.5 + 0.5 * Math.sin(ph * 0.5 + k.cx * 0.25);
        const v = 1 - p.depth * (0.5 + 0.5 * Math.cos(ph));
        put(out, k.i, [mix(A[0], B[0], m), mix(A[1], B[1], m), mix(A[2], B[2], m)], v);
      }
    },
  },
  {
    id: 'plasma', name: 'Plazma', hint: 'Klasik demo sahnesi plazma alanı.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0, max: 3, step: 0.01, def: 0.8 },
      { key: 'zoom', label: 'Ölçek', type: 'range', min: 0.1, max: 1.5, step: 0.01, def: 0.45 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'siber' },
    ],
    frame({ t, p, out }) {
      const z = p.zoom, tt = t * p.speed;
      for (const k of KEYS) {
        const x = k.cx * z, y = k.cy * z * 1.5;
        const v = Math.sin(x + tt) + Math.sin((y + tt) * 0.8) + Math.sin((x + y + tt) * 0.7) + Math.sin(Math.hypot(x - 3, y - 1) + tt * 1.3);
        put(out, k.i, pal(p.palette, v / 8 + 0.5));
      }
    },
  },
  {
    id: 'radar', name: 'Radar', hint: 'Merkez etrafında dönen bir tarama ışını.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0.05, max: 2, step: 0.01, def: 0.4 },
      { key: 'trail', label: 'İz uzunluğu', type: 'range', min: 0.05, max: 1, step: 0.01, def: 0.35 },
      { key: 'color', label: 'Işın', type: 'color', def: '#00e1ff' },
      { key: 'base', label: 'Zemin', type: 'color', def: '#020a12' },
    ],
    frame({ t, p, out }) {
      const ang = fract(t * p.speed), c = hexToRgb(p.color), b = hexToRgb(p.base);
      for (const k of KEYS) {
        const a = fract(Math.atan2((k.cy - CY) * 3, k.cx - CX) / (Math.PI * 2) + 1);
        const d = fract(ang - a);
        const v = d < p.trail ? Math.pow(1 - d / p.trail, 2) : 0;
        put(out, k.i, [mix(b[0], c[0], v), mix(b[1], c[1], v), mix(b[2], c[2], v)]);
      }
    },
  },
  {
    id: 'gradient', name: 'Kayan gradyan', hint: 'Seçtiğin üç renk yatay olarak akar.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: -1, max: 1, step: 0.01, def: 0.15 },
      { key: 'c1', label: 'Renk 1', type: 'color', def: '#ff006e' },
      { key: 'c2', label: 'Renk 2', type: 'color', def: '#8338ec' },
      { key: 'c3', label: 'Renk 3', type: 'color', def: '#3a86ff' },
      { key: 'vertical', label: 'Dikey', type: 'toggle', def: false },
    ],
    frame({ t, p, out }) {
      const stops = [hexToRgb(p.c1), hexToRgb(p.c2), hexToRgb(p.c3)];
      for (const k of KEYS) {
        const pos = p.vertical ? k.cy / HEIGHT_U : k.cx / WIDTH_U;
        put(out, k.i, samplePalette(stops, pos - t * p.speed));
      }
    },
  },
  {
    id: 'comet', name: 'Kuyruklu yıldız', hint: 'Sıralar boyunca kayan parlak yıldızlar ve arkalarında bıraktıkları izler.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 2, max: 30, step: 0.5, def: 12 },
      { key: 'count', label: 'Yıldız sayısı', type: 'range', min: 1, max: 8, step: 1, def: 4 },
      { key: 'trail', label: 'İz uzunluğu', type: 'range', min: 0.1, max: 2, step: 0.05, def: 0.6 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'gokkusagi' },
    ],
    init(s) { s.v = new Float32Array(N); s.c = Array.from({ length: N }, () => [0, 0, 0]); s.comets = []; },
    frame({ dt, p, out, s }) {
      const spawn = () => {
        const dir = Math.random() < 0.5 ? 1 : -1;
        return { row: (Math.random() * HEIGHT_U) | 0, dir, x: dir > 0 ? -1 : WIDTH_U + 1, k: 0.6 + Math.random() * 0.8, col: pal(p.palette, Math.random()) };
      };
      while (s.comets.length < p.count) s.comets.push(spawn());
      s.comets.length = Math.min(s.comets.length, p.count);
      const kf = Math.pow(0.02, dt / p.trail);
      for (let i = 0; i < N; i++) s.v[i] *= kf;
      for (const c of s.comets) {
        c.x += c.dir * p.speed * c.k * dt;
        if (c.x < -1.5 || c.x > WIDTH_U + 1.5) Object.assign(c, spawn());
        for (const k of KEYS) if (k.row === c.row && Math.abs(k.cx - c.x) < k.w / 2 + 0.3) { s.v[k.i] = 1; s.c[k.i] = c.col; }
      }
      for (let i = 0; i < N; i++) put(out, i, s.c[i], s.v[i]);
    },
  },
  {
    id: 'ripples', name: 'Halkalar', hint: 'Bastığın tuştan su halkası yayılır. Hangi programda yazarsan yaz çalışır.',
    needsKeys: true, // servis tuş basışlarını yoklar (service/keys.mjs); kendiliğinden halka çıkmaz
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 2, max: 24, step: 0.5, def: 10 },
      { key: 'width', label: 'Halka kalınlığı', type: 'range', min: 0.8, max: 3, step: 0.1, def: 1.6 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'okyanus' },
    ],
    init(s) { s.drops = []; s.hue = Math.random(); },
    frame({ dt, p, out, s, presses }) {
      // Her basış, basılan tuşun yerinden bir halka başlatır: kalın, yumuşak kenarlı, arkasından
      // zayıf ikinci bir tepe gelir. Zemin ışığı yoktur (kullanıcının isteği): yazmayınca klavye karanlıktır.
      const MAXR = 19, w = p.width; // klavyenin köşegeni ~17u: halka her tuştan karşı kenara ulaşır
      for (const k of presses) {
        s.hue = fract(s.hue + 0.381966); // art arda basışlar paletin farklı yerlerinden renk alır
        const c = pal(p.palette, s.hue), mx = Math.max(c[0], c[1], c[2], 0.001);
        s.drops.push({ x: k.cx, y: k.cy, r: 0, col: [c[0] / mx, c[1] / mx, c[2] / mx] }); // koyu palet rengi de parlak halka verir
      }
      if (s.drops.length > 32) s.drops.splice(0, s.drops.length - 32);
      for (const d of s.drops) d.r += p.speed * dt;
      s.drops = s.drops.filter((d) => d.r < MAXR);
      for (const k of KEYS) {
        // Üst üste binen halkalar renkleri TOPLAMAZ (toplanınca her kanal dolup beyaza dönüyordu):
        // tuşun rengini o anda en güçlü olan halka belirler (v^12 ağırlık: neredeyse "kazanan alır",
        // ama halkalar kesişirken renk sıçramaz), yalnızca yoğunluk birikir. Düz ortalama da olmaz:
        // gökkuşağı gibi paletlerde zıt renklerin ortalaması yine beyaza yakın çıkıyor.
        let r = 0, g = 0, b = 0, wsum = 0, dark = 1;
        for (const d of s.drops) {
          const e = (Math.hypot(k.cx - d.x, k.cy - d.y) - d.r) / w;
          const fade = Math.sqrt(1 - d.r / MAXR);
          const v = Math.min(1, (Math.exp(-e * e) + 0.4 * Math.exp(-((e + 2.3) ** 2))) * fade);
          if (v < 0.004) continue;
          const wt = Math.pow(v, 12);
          r += d.col[0] * wt; g += d.col[1] * wt; b += d.col[2] * wt; wsum += wt; dark *= 1 - v;
        }
        put(out, k.i, [r, g, b], wsum ? (1 - dark) / wsum : 0);
      }
    },
  },
  {
    id: 'trail', name: 'Tuş izi', hint: 'Bastığın tuş yanar ve yavaşça söner. Hangi programda yazarsan yaz çalışır.',
    needsKeys: true,
    params: [
      { key: 'fade', label: 'Solma süresi', type: 'range', min: 0.3, max: 4, step: 0.1, def: 1.4, unit: ' sn' },
      { key: 'spread', label: 'Yayılma', type: 'range', min: 0, max: 100, step: 1, def: 35, unit: '%' },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'morotesi' },
    ],
    init(s) { s.v = new Float32Array(N); },
    frame({ dt, p, out, s, presses }) {
      // Her tuşun rengi paletin o konumdaki rengidir (soldan sağa tüm palet), tam parlak.
      // Basılan tuş tam yanar, komşuları "Yayılma" oranında; sonra hepsi aynı hızla söner.
      // Zemin ışığı yoktur (kullanıcının isteği). Renkler toplanmaz, bu yüzden hızlı yazınca beyaza dönmez.
      const spread = p.spread / 100;
      for (const k of presses) {
        s.v[k.i] = 1;
        if (spread > 0) for (const n of KEYS) {
          const d = Math.hypot(n.cx - k.cx, (n.cy - k.cy) * 1.15);
          if (n !== k && d < 2.2) s.v[n.i] = Math.max(s.v[n.i], spread * (1 - d / 2.2) * 1.4);
        }
      }
      // Doğrusal söner: çıkışa gama uygulandığı için göze de düzgün söner gibi görünür
      // (üstel sönme gama ile ilk yarım saniyede kaybolur, "Solma süresi" anlamını yitirir).
      const step = dt / p.fade;
      for (const k of KEYS) {
        const v = (s.v[k.i] = Math.max(0, Math.min(1, s.v[k.i]) - step));
        const c = pal(p.palette, k.cx / WIDTH_U), mx = Math.max(c[0], c[1], c[2], 0.001);
        put(out, k.i, c, v / mx);
      }
    },
  },
  {
    id: 'typeflow', name: 'Yazma akışı', hint: 'Yazdıkça hızlanan ve parlayan, durunca yavaşlayan renk akışı.',
    needsKeys: true,
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0, max: 0.5, step: 0.01, def: 0.06 },
      { key: 'boost', label: 'Hızlanma', type: 'range', min: 0, max: 100, step: 1, def: 50, unit: '%' },
      { key: 'idle', label: 'Boşta parlaklık', type: 'range', min: 0, max: 100, step: 1, def: 45, unit: '%' },
      { key: 'scale', label: 'Bant genişliği', type: 'range', min: 0.3, max: 3, step: 0.05, def: 1 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'tamspektrum' },
    ],
    init(s) { s.ph = 0; s.rate = 0; s.lvl = 0; s.v = new Float32Array(N); },
    frame({ dt, p, out, s, presses }) {
      // s.rate: son ~1 sn'deki yazma hızı (tuş/sn), yumuşatılmış. Akış hızı ve parlaklık ona göre
      // artar; yazmayı bırakınca birkaç saniyede yavaşça eski hâline döner (sıçrama, yanıp sönme yok).
      const TAU = 0.9;
      s.rate = s.rate * Math.exp(-dt / TAU) + presses.length / TAU;
      const heat = clamp(s.rate / 7); // ~7 tuş/sn (hızlı yazma) = tam
      s.lvl += (heat - s.lvl) * (1 - Math.exp(-dt / 0.6));
      s.ph += dt * (p.speed + (p.boost / 100) * 1.2 * s.lvl * s.lvl);
      for (const k of presses) s.v[k.i] = 1;
      const kf = Math.pow(0.02, dt / 0.6);
      const bright = p.idle / 100 + (1 - p.idle / 100) * s.lvl;
      for (const k of KEYS) {
        const v = (s.v[k.i] *= kf);
        // basılan tuş kısa bir an tam parlaklığa çıkar
        put(out, k.i, pal(p.palette, k.cx / WIDTH_U / p.scale - s.ph), bright * (1 - v) + v);
      }
    },
  },
  {
    id: 'fireworks', name: 'Havai fişek', hint: 'Bastığın tuştan kıvılcımlar saçılır. Hangi programda yazarsan yaz çalışır.',
    needsKeys: true,
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 3, max: 20, step: 0.5, def: 9 },
      { key: 'count', label: 'Kıvılcım sayısı', type: 'range', min: 4, max: 14, step: 1, def: 8 },
      { key: 'life', label: 'Ömür', type: 'range', min: 0.4, max: 2.5, step: 0.1, def: 1.1, unit: ' sn' },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'tamspektrum' },
    ],
    init(s) { s.sparks = []; s.hue = Math.random(); },
    frame({ dt, p, out, s, presses }) {
      // Her basış, tuşun yerinden çevreye saçılan kıvılcımlar çıkarır; kıvılcımlar yavaşlayarak
      // ilerler ve doğrusal söner. Kendiliğinden patlama ve zemin ışığı yoktur.
      for (const k of presses) {
        s.hue = fract(s.hue + 0.381966); // art arda basışlar paletin farklı yerlerinden renk alır
        const a0 = Math.random() * Math.PI * 2;
        for (let i = 0; i < p.count; i++) {
          const a = a0 + (i / p.count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
          const c = pal(p.palette, s.hue + (Math.random() - 0.5) * 0.08), mx = Math.max(c[0], c[1], c[2], 0.001);
          const v = p.speed * (0.6 + Math.random() * 0.6);
          // klavye 5 sıra yüksekliğinde: dikey hız kısılır, yoksa kıvılcımların yarısı hemen dışarı çıkar
          s.sparks.push({ x: k.cx, y: k.cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.55, age: 0, col: [c[0] / mx, c[1] / mx, c[2] / mx] });
        }
      }
      if (s.sparks.length > 320) s.sparks.splice(0, s.sparks.length - 320);
      const drag = Math.pow(0.12, dt);
      for (const q of s.sparks) { q.age += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= drag; q.vy *= drag; }
      s.sparks = s.sparks.filter((q) => q.age < p.life);
      for (const k of KEYS) {
        // Renkler toplanmaz (Halkalar'daki yöntem): rengi en güçlü kıvılcım belirler, yoğunluk birikir.
        let r = 0, g = 0, b = 0, wsum = 0, dark = 1;
        for (const q of s.sparks) {
          const dx = k.cx - q.x, dy = (k.cy - q.y) * 1.15, d2 = dx * dx + dy * dy;
          if (d2 > 3) continue;
          const v = Math.exp(-d2 / 0.5) * (1 - q.age / p.life);
          if (v < 0.004) continue;
          const wt = Math.pow(v, 6);
          r += q.col[0] * wt; g += q.col[1] * wt; b += q.col[2] * wt; wsum += wt; dark *= 1 - v;
        }
        put(out, k.i, [r, g, b], wsum ? (1 - dark) / wsum : 0);
      }
    },
  },
  {
    id: 'laser', name: 'Lazer', hint: 'Bastığın tuştan sıra boyunca iki yana ışın fırlar. Hangi programda yazarsan yaz çalışır.',
    needsKeys: true,
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 5, max: 40, step: 1, def: 18 },
      { key: 'len', label: 'Işın uzunluğu', type: 'range', min: 1, max: 8, step: 0.5, def: 3.5 },
      { key: 'cross', label: 'Dikey ışın', type: 'toggle', def: true },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'zehir' },
    ],
    init(s) { s.beams = []; s.hue = Math.random(); },
    frame({ dt, p, out, s, presses }) {
      // Her basış, tuşun sırasında sola ve sağa (istenirse sütununda yukarı ve aşağı) giden bir ışın
      // başlatır: baş tam parlak, arkası "Işın uzunluğu" kadar kuyruk. Zemin ışığı yok, renkler toplanmaz.
      for (const k of presses) {
        s.hue = fract(s.hue + 0.381966);
        const c = pal(p.palette, s.hue), mx = Math.max(c[0], c[1], c[2], 0.001);
        s.beams.push({ x: k.cx, y: k.cy, row: k.row, r: 0, col: [c[0] / mx, c[1] / mx, c[2] / mx] });
      }
      if (s.beams.length > 32) s.beams.splice(0, s.beams.length - 32);
      for (const b of s.beams) b.r += p.speed * dt;
      s.beams = s.beams.filter((b) => b.r < WIDTH_U + p.len);
      const shape = (e, r) => (e <= r ? Math.max(0, 1 - (r - e) / p.len) : Math.max(0, 1 - (e - r) / 0.5));
      for (const k of KEYS) {
        let r = 0, g = 0, bl = 0, wsum = 0, dark = 1;
        for (const b of s.beams) {
          let v = k.row === b.row ? shape(Math.abs(k.cx - b.x), b.r) : 0;
          // dikey ışın: sıralar kaydırmalı olduğu için sütun, yatay yakınlıkla (0,75u) belirlenir
          if (p.cross && k.row !== b.row && Math.abs(k.cx - b.x) < 0.75) v = shape(Math.abs(k.cy - b.y), b.r);
          if (v < 0.004) continue;
          const wt = Math.pow(v, 6);
          r += b.col[0] * wt; g += b.col[1] * wt; bl += b.col[2] * wt; wsum += wt; dark *= 1 - v;
        }
        put(out, k.i, [r, g, bl], wsum ? (1 - dark) / wsum : 0);
      }
    },
  },
  {
    id: 'heat', name: 'Isı haritası', hint: 'Bastığın tuşlar ısınır, çok kullandığın bölge renk değiştirir; bırakınca soğur.',
    needsKeys: true,
    params: [
      { key: 'gain', label: 'Isınma', type: 'range', min: 10, max: 100, step: 1, def: 35, unit: '%' },
      { key: 'cool', label: 'Soğuma süresi', type: 'range', min: 1, max: 15, step: 0.5, def: 5, unit: ' sn' },
      { key: 'spread', label: 'Yayılma', type: 'range', min: 0, max: 100, step: 1, def: 50, unit: '%' },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'lav' },
    ],
    init(s) { s.h = new Float32Array(N); },
    frame({ dt, p, out, s, presses }) {
      // Tuşun "ısısı" her basışta artar (komşularınınki daha az), zamanla doğrusal düşer.
      // Renk ısıya göre paletin başından sonuna yürür; ısı sıfırken tuş karanlıktır (zemin ışığı yok).
      const gain = p.gain / 100, spread = p.spread / 100;
      for (const k of presses) {
        s.h[k.i] = Math.min(1, s.h[k.i] + gain);
        if (spread > 0) for (const n of KEYS) {
          const d = Math.hypot(n.cx - k.cx, (n.cy - k.cy) * 1.15);
          if (n !== k && d < 2.2) s.h[n.i] = Math.min(1, s.h[n.i] + gain * spread * (1 - d / 2.2));
        }
      }
      const step = dt / p.cool;
      for (const k of KEYS) {
        const h = (s.h[k.i] = Math.max(0, s.h[k.i] - step));
        // paletler döngüseldir: 0..0,75 aralığı ilk renkten son renge gider, başa sarmaz
        const c = pal(p.palette, h * 0.75), mx = Math.max(c[0], c[1], c[2], 0.001);
        put(out, k.i, c, clamp(h * 2.5) / mx);
      }
    },
  },
  {
    id: 'constellation', name: 'Takımyıldız', hint: 'Art arda bastığın tuşlar ışık çizgisiyle birleşir. Hangi programda yazarsan yaz çalışır.',
    needsKeys: true,
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 5, max: 60, step: 1, def: 28 },
      { key: 'fade', label: 'Solma süresi', type: 'range', min: 0.3, max: 4, step: 0.1, def: 1.4, unit: ' sn' },
      { key: 'width', label: 'Çizgi kalınlığı', type: 'range', min: 0.3, max: 1.2, step: 0.05, def: 0.6 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'nebula' },
    ],
    init(s) { s.segs = []; s.last = null; s.idle = 0; s.hue = Math.random(); },
    frame({ dt, p, out, s, presses }) {
      // Her basış, bir önceki basılan tuştan yenisine bir çizgi çeker: ışık çizgi boyunca ilerler,
      // geçtiği yer "Solma süresi" içinde söner. Basılan tuş beklemeden yanar. Zemin ışığı yok, renkler toplanmaz.
      // Her tuşun palette bir yeri vardır; çizginin rengi baştaki tuşun renginden sondakine palet
      // üzerinden yürür. Böylece iki çizginin birleştiği tuşta renkler aynıdır, karışıp grileşmez.
      s.idle += dt;
      for (const k of presses) {
        const h0 = fract(s.hue), h1 = h0 + 0.381966;
        s.hue = h1;
        // uzun bir aradan sonraki ilk basış çizgi çekmez: yalnızca kendi tuşu yanar
        const from = s.last && s.idle < 3 ? s.last : k;
        s.segs.push({ x0: from.cx, y0: from.cy, x1: k.cx, y1: k.cy, len: Math.hypot(k.cx - from.cx, k.cy - from.cy), end: k.i, age: 0, h0: from === k ? h1 : h0, h1 });
        s.last = k; s.idle = 0;
      }
      if (s.segs.length > 24) s.segs.splice(0, s.segs.length - 24);
      for (const g of s.segs) g.age += dt;
      s.segs = s.segs.filter((g) => g.age < g.len / p.speed + p.fade);
      for (const k of KEYS) {
        let r = 0, gr = 0, b = 0, wsum = 0, dark = 1;
        for (const g of s.segs) {
          // tuşun çizgiye izdüşümü: u = çizgi boyunca yol (0..len), d = çizgiye uzaklık
          const u = g.len > 0.01 ? clamp(((k.cx - g.x0) * (g.x1 - g.x0) + (k.cy - g.y0) * (g.y1 - g.y0)) / g.len, 0, g.len) : 0;
          const f = g.len > 0.01 ? u / g.len : 0;
          const d = Math.hypot(k.cx - mix(g.x0, g.x1, f), k.cy - mix(g.y0, g.y1, f));
          const since = g.age - u / p.speed; // ışık bu noktadan geçeli ne kadar oldu
          let v = since >= 0 ? Math.exp(-((d / p.width) ** 2)) * Math.max(0, 1 - since / p.fade) : 0;
          if (k.i === g.end) v = Math.max(v, 1 - g.age / p.fade);
          if (v < 0.004) continue;
          const wt = Math.pow(v, 6), c = vivid(pal(p.palette, mix(g.h0, g.h1, f)));
          r += c[0] * wt; gr += c[1] * wt; b += c[2] * wt; wsum += wt; dark *= 1 - Math.min(1, v);
        }
        put(out, k.i, [r, gr, b], wsum ? (1 - dark) / wsum : 0);
      }
    },
  },
  {
    id: 'arc', name: 'Yıldırım', hint: 'Bastığın tuştan, tuştan tuşa atlayan elektrik arkları çıkar. Hangi programda yazarsan yaz çalışır.',
    needsKeys: true,
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 10, max: 80, step: 1, def: 38 },
      { key: 'len', label: 'Uzunluk', type: 'range', min: 3, max: 14, step: 1, def: 8 },
      { key: 'fork', label: 'Dallanma', type: 'range', min: 0, max: 100, step: 1, def: 45, unit: '%' },
      { key: 'fade', label: 'Solma süresi', type: 'range', min: 0.2, max: 2, step: 0.05, def: 0.7, unit: ' sn' },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'mavikizil' },
    ],
    init(s) { s.v = new Float32Array(N); s.c = Array.from({ length: N }, () => [0, 0, 0]); s.arcs = []; s.hue = Math.random(); },
    frame({ dt, p, out, s, presses }) {
      // Her basış zıt yönlere iki kol çıkarır. Kol, komşu tuştan komşu tuşa zikzak çizerek ilerler
      // ve yolda dallanabilir; değdiği tuş yanar, sonra doğrusal söner. Tuşun rengini ona en son
      // değen ark belirler (renkler toplanmaz). Zemin ışığı yok.
      const walk = (from, ang, hops, t0, seen, nodes, depth) => {
        let cur = from;
        const dx = Math.cos(ang), dy = Math.sin(ang) * 0.6; // yatay ağırlıklı: klavye 5 sıra
        for (let h = 1; h <= hops; h++) {
          let best = null, bs = 0.1; // geriye ya da yana sapan komşu seçilmez: kol incelir, yumak olmaz
          for (const n of NEIGH[cur.i]) {
            if (seen.has(n.i)) continue;
            const ex = n.cx - cur.cx, ey = n.cy - cur.cy;
            const sc = (ex * dx + ey * dy) / Math.hypot(ex, ey) + (Math.random() - 0.5) * 0.7;
            if (sc > bs) { bs = sc; best = n; }
          }
          if (!best) break;
          seen.add(best.i); nodes.push({ i: best.i, t: t0 + h / p.speed });
          // dal: ana koldan belirgin bir açıyla ayrılır, daha kısadır ve kendisi dallanmaz
          if (depth < 1 && h > 1 && Math.random() < (p.fork / 100) * 0.3)
            walk(best, ang + (Math.random() < 0.5 ? 1 : -1) * (0.8 + Math.random() * 0.5), Math.ceil((hops - h) * 0.6), t0 + h / p.speed, seen, nodes, depth + 1);
          cur = best;
        }
      };
      for (const k of presses) {
        s.hue = fract(s.hue + 0.381966);
        const col = vivid(pal(p.palette, s.hue)), seen = new Set([k.i]), nodes = [{ i: k.i, t: 0 }];
        const a0 = Math.random() * Math.PI * 2;
        walk(k, a0, p.len, 0, seen, nodes, 0);
        walk(k, a0 + Math.PI, p.len, 0, seen, nodes, 0);
        nodes.sort((a, b) => a.t - b.t);
        s.arcs.push({ nodes, at: 0, age: 0, col });
      }
      if (s.arcs.length > 48) s.arcs.splice(0, s.arcs.length - 48);
      const step = dt / p.fade;
      for (let i = 0; i < N; i++) s.v[i] = Math.max(0, s.v[i] - step);
      for (const a of s.arcs) {
        a.age += dt;
        while (a.at < a.nodes.length && a.nodes[a.at].t <= a.age) { const n = a.nodes[a.at++]; s.v[n.i] = 1; s.c[n.i] = a.col; }
      }
      s.arcs = s.arcs.filter((a) => a.at < a.nodes.length);
      for (let i = 0; i < N; i++) put(out, i, s.c[i], s.v[i]);
    },
  },
  {
    id: 'lava', name: 'Lav lambası', hint: 'Yavaşça birleşip ayrılan renk damlaları.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0.05, max: 2, step: 0.01, def: 0.4 },
      { key: 'size', label: 'Damla boyutu', type: 'range', min: 0.6, max: 2.5, step: 0.05, def: 1.4 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'lav' },
    ],
    init(s) { s.ph = 0; },
    frame({ dt, p, out, s }) {
      s.ph += dt * p.speed;
      const blobs = [0, 1, 2, 3].map((i) => [CX + Math.sin(s.ph * (0.7 + i * 0.23) + i * 2.1) * 7, CY + Math.cos(s.ph * (0.9 + i * 0.17) + i * 4.2) * 2.2]);
      const r2 = p.size * p.size;
      for (const k of KEYS) {
        let f = 0;
        for (const [bx, by] of blobs) f += r2 / ((k.cx - bx) ** 2 + ((k.cy - by) * 1.6) ** 2 + 0.3);
        put(out, k.i, pal(p.palette, clamp(f * 0.22) * 0.85), 0.12 + 0.88 * clamp((f - 0.5) / 1.2));
      }
    },
  },
  {
    id: 'vortex', name: 'Girdap', hint: 'Merkezin etrafında dönen renk sarmalı.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0, max: 2, step: 0.01, def: 0.5 },
      { key: 'arms', label: 'Kol sayısı', type: 'range', min: 1, max: 4, step: 1, def: 2 },
      { key: 'twist', label: 'Kıvrım', type: 'range', min: 0, max: 1, step: 0.01, def: 0.35 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'gokkusagi' },
    ],
    init(s) { s.ph = 0; },
    frame({ dt, p, out, s }) {
      s.ph += dt * p.speed;
      for (const k of KEYS) {
        const dx = k.cx - CX, dy = (k.cy - CY) * 2.2;
        put(out, k.i, pal(p.palette, (Math.atan2(dy, dx) / (Math.PI * 2)) * p.arms + Math.hypot(dx, dy) * p.twist * 0.2 - s.ph));
      }
    },
  },
  {
    id: 'kaleido', name: 'Kaleydoskop', hint: 'Ortadan dört yana aynalanan, sürekli değişen renk deseni.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0, max: 2, step: 0.01, def: 0.5 },
      { key: 'zoom', label: 'Doku', type: 'range', min: 0.1, max: 0.8, step: 0.01, def: 0.3 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'siber' },
    ],
    frame({ t, p, out }) {
      for (const k of KEYS) {
        // merkeze göre mutlak uzaklık: desen sol-sağ ve üst-alt simetrik olur
        const x = Math.abs(k.cx - CX) * p.zoom, y = Math.abs(k.cy - CY) * p.zoom * 2;
        const n = noise3(x, y, t * p.speed * 0.4);
        const m = noise3(x * 0.6 + 40, y * 0.6 + 9, t * p.speed * 0.25);
        put(out, k.i, pal(p.palette, n * 1.5 + t * p.speed * 0.04), 0.3 + 0.7 * clamp(m * 1.5 - 0.1));
      }
    },
  },
  {
    id: 'mosaic', name: 'Mozaik', hint: 'Yavaşça yer değiştiren renkli camlar; aralarında koyu derzler.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0, max: 2, step: 0.01, def: 0.4 },
      { key: 'count', label: 'Parça sayısı', type: 'range', min: 3, max: 10, step: 1, def: 6 },
      { key: 'edge', label: 'Derz kalınlığı', type: 'range', min: 0, max: 2, step: 0.05, def: 0.8 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'gunbatimi' },
    ],
    init(s) { s.ph = Math.random() * 50; },
    frame({ dt, p, out, s }) {
      // Voronoi: her tuş en yakın "merkez"in rengini alır. İki merkeze eşit uzaklıktaki tuşlar
      // (parça sınırı) kararır; merkezler kayarken renk bu koyu derzden geçerek değişir, sıçramaz.
      s.ph += dt * p.speed;
      const n = p.count, sx = [], sy = [];
      for (let i = 0; i < n; i++) {
        sx.push(CX + Math.sin(s.ph * (0.31 + i * 0.07) + i * 2.4) * CX * 0.95);
        sy.push(CY + Math.cos(s.ph * (0.43 + i * 0.05) + i * 1.7) * CY * 0.9);
      }
      for (const k of KEYS) {
        let d1 = 1e9, d2 = 1e9, idx = 0;
        for (let i = 0; i < n; i++) {
          const d = Math.hypot(k.cx - sx[i], (k.cy - sy[i]) * 1.6);
          if (d < d1) { d2 = d1; d1 = d; idx = i; } else if (d < d2) d2 = d;
        }
        const e = p.edge > 0 ? sm(clamp((d2 - d1) / p.edge)) : 1;
        put(out, k.i, pal(p.palette, idx / n + s.ph * 0.015), 0.12 + 0.88 * e);
      }
    },
  },
  {
    id: 'helix', name: 'Sarmal', hint: 'Birbirine dolanarak akan iki ışık şeridi.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0, max: 2, step: 0.01, def: 0.5 },
      { key: 'wave', label: 'Dalga boyu', type: 'range', min: 5, max: 18, step: 0.5, def: 11 },
      { key: 'thick', label: 'Kalınlık', type: 'range', min: 0.5, max: 1.6, step: 0.05, def: 0.8 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'aurora' },
    ],
    init(s) { s.ph = 0; },
    frame({ dt, p, out, s }) {
      // İki sinüs şeridi zıt fazda akar; cos(a) "öndeki / arkadaki" şeridi belirler (arkadaki loş).
      // Kesiştikleri yerde renkler toplanmaz: güçlü olan şeridin rengi kazanır.
      s.ph += dt * p.speed;
      const amp = HEIGHT_U / 2 - 0.5;
      for (const k of KEYS) {
        const a = (k.cx / p.wave - s.ph) * Math.PI * 2, sn = Math.sin(a), cs = Math.cos(a);
        // Şerit dikleştikçe dikey kalınlık artırılır: eğriye dik genişlik sabit kalır, yoksa
        // dik kısımlar sıra başına tek tuşa düşüp noktalı görünür.
        const th = p.thick * Math.hypot(1, (amp * cs * Math.PI * 2) / p.wave);
        const eA = (k.cy - (CY + sn * amp)) / th, eB = (k.cy - (CY - sn * amp)) / th;
        const vA = Math.exp(-eA * eA) * (0.6 + 0.4 * cs), vB = Math.exp(-eB * eB) * (0.6 - 0.4 * cs);
        const u = (k.cx / WIDTH_U) * 0.35 + s.ph * 0.05;
        const cA = pal(p.palette, u), cB = pal(p.palette, u + 0.5);
        const wA = vA ** 4, wB = vB ** 4, ws = wA + wB || 1, lum = 1 - (1 - vA) * (1 - vB);
        put(out, k.i, [(cA[0] * wA + cB[0] * wB) / ws, (cA[1] * wA + cB[1] * wB) / ws, (cA[2] * wA + cB[2] * wB) / ws], lum);
      }
    },
  },
  {
    id: 'tunnel', name: 'Tünel', hint: 'Merkezden dışarı (ya da içeri) akan renk halkaları.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0, max: 2, step: 0.01, def: 0.4 },
      { key: 'scale', label: 'Halka genişliği', type: 'range', min: 0.3, max: 3, step: 0.05, def: 1 },
      { key: 'inward', label: 'İçeri doğru', type: 'toggle', def: false },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'nebula' },
    ],
    init(s) { s.ph = 0; },
    frame({ dt, p, out, s }) {
      s.ph += dt * p.speed * (p.inward ? -1 : 1);
      for (const k of KEYS) put(out, k.i, pal(p.palette, Math.hypot(k.cx - CX, (k.cy - CY) * 2.2) / CX / p.scale - s.ph));
    },
  },
  {
    id: 'lanes', name: 'Şeritler', hint: 'Her sıra kendi yönünde ve hızında akar.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0, max: 2, step: 0.01, def: 0.4 },
      { key: 'scale', label: 'Bant genişliği', type: 'range', min: 0.3, max: 3, step: 0.05, def: 1 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'vapor' },
    ],
    init(s) { s.ph = 0; },
    frame({ dt, p, out, s }) {
      s.ph += dt * p.speed;
      for (const k of KEYS) {
        // tek sıralar sola, çift sıralar sağa; her sıranın hızı biraz farklı
        const dir = k.row % 2 ? -1 : 1, rate = 0.7 + 0.15 * ((k.row * 3) % 5);
        put(out, k.i, pal(p.palette, k.cx / WIDTH_U / p.scale - dir * s.ph * rate + k.row * 0.13));
      }
    },
  },
  {
    id: 'tide', name: 'Gelgit', hint: 'Klavyenin altını dolduran, yüzeyi dalgalanan su.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0.05, max: 2, step: 0.01, def: 0.5 },
      { key: 'level', label: 'Su seviyesi', type: 'range', min: 20, max: 80, step: 1, def: 50, unit: '%' },
      { key: 'wave', label: 'Dalga yüksekliği', type: 'range', min: 0, max: 1.5, step: 0.05, def: 0.8 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'okyanus' },
    ],
    init(s) { s.ph = 0; },
    frame({ dt, p, out, s }) {
      // Yüzey iki sinüsün toplamıdır. Yüzeyin üstü karanlık, yüzey parlak (köpük), derin su daha loş.
      s.ph += dt * p.speed;
      for (const k of KEYS) {
        const surf = HEIGHT_U * (1 - p.level / 100) + p.wave * (Math.sin(k.cx * 0.55 + s.ph * 2.1) * 0.6 + Math.sin(k.cx * 0.23 - s.ph * 1.3 + 1.7) * 0.4);
        const depth = k.cy - surf; // > 0: su altında
        const a = sm(clamp(depth / 0.8 + 0.5)), crest = Math.exp(-((depth / 0.7) ** 2));
        put(out, k.i, pal(p.palette, 0.15 + clamp(depth / HEIGHT_U) * 0.6 + (k.cx / WIDTH_U) * 0.15), a * (0.45 + 0.55 * crest));
      }
    },
  },
  {
    id: 'bounce', name: 'Sektirme', hint: 'Kenarlardan seken, arkasında iz bırakan ışık topları.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 2, max: 20, step: 0.5, def: 8 },
      { key: 'count', label: 'Top sayısı', type: 'range', min: 1, max: 6, step: 1, def: 3 },
      { key: 'trail', label: 'İz uzunluğu', type: 'range', min: 0.1, max: 2, step: 0.05, def: 0.7 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'seker' },
    ],
    init(s) { s.v = new Float32Array(N); s.c = Array.from({ length: N }, () => [0, 0, 0]); s.balls = []; },
    frame({ dt, p, out, s }) {
      while (s.balls.length < p.count) {
        // dikey bileşen küçük tutulur: klavye 5 sıra, yoksa top sürekli alt-üst kenara çarpar
        const a = (Math.random() - 0.5) * 1.0 + (Math.random() < 0.5 ? 0 : Math.PI);
        s.balls.push({ x: Math.random() * WIDTH_U, y: Math.random() * HEIGHT_U, vx: Math.cos(a), vy: Math.sin(a) });
      }
      s.balls.length = Math.min(s.balls.length, p.count);
      const kf = Math.pow(0.02, dt / p.trail);
      for (let i = 0; i < N; i++) s.v[i] *= kf;
      // 0..max aralığında ileri geri katlama: uzun bir karede bile top dışarı çıkmaz
      const fold = (v, max) => { v %= 2 * max; if (v < 0) v += 2 * max; return v > max ? 2 * max - v : v; };
      s.balls.forEach((b, i) => {
        const nx = b.x + b.vx * p.speed * dt, ny = b.y + b.vy * p.speed * dt;
        if (nx < 0 || nx > WIDTH_U) b.vx = -b.vx;
        if (ny < 0 || ny > HEIGHT_U) b.vy = -b.vy;
        b.x = fold(nx, WIDTH_U); b.y = fold(ny, HEIGHT_U);
        const col = pal(p.palette, i / p.count);
        for (const k of KEYS) {
          const g = Math.exp(-((k.cx - b.x) ** 2 + (k.cy - b.y) ** 2) / 0.45);
          if (g > s.v[k.i]) { s.v[k.i] = g; s.c[k.i] = col; }
        }
      });
      for (let i = 0; i < N; i++) put(out, i, s.c[i], s.v[i]);
    },
  },
  {
    id: 'warp', name: 'Işık hızı', hint: 'Merkezden dışarı hızlanarak akan yıldızlar.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0.2, max: 3, step: 0.05, def: 1 },
      { key: 'count', label: 'Yıldız sayısı', type: 'range', min: 4, max: 30, step: 1, def: 12 },
      { key: 'trail', label: 'İz uzunluğu', type: 'range', min: 0.1, max: 1.5, step: 0.05, def: 0.5 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'buzul' },
    ],
    init(s) { s.v = new Float32Array(N); s.c = Array.from({ length: N }, () => [0, 0, 0]); s.stars = []; },
    frame({ dt, p, out, s }) {
      // Yıldız merkezin yakınında doğar, uzaklaştıkça hızlanır ve parlar (yaklaşan yıldız hissi).
      // Dikey bileşen kısılır: klavye 5 sıra, yoksa yıldızların çoğu hemen üstten/alttan çıkar.
      const spawn = (r) => { const a = Math.random() * Math.PI * 2; return { ca: Math.cos(a), sa: Math.sin(a) * 0.42, r, k: 0.6 + Math.random() * 0.8, col: randVivid(p.palette) }; };
      while (s.stars.length < p.count) s.stars.push(spawn(Math.random() * 7));
      s.stars.length = Math.min(s.stars.length, p.count);
      const kf = Math.pow(0.02, dt / p.trail);
      for (let i = 0; i < N; i++) s.v[i] *= kf;
      for (const q of s.stars) {
        q.r += (1.2 + q.r * 1.8) * q.k * p.speed * dt;
        const x = CX + q.ca * q.r, y = CY + q.sa * q.r;
        if (x < -1 || x > WIDTH_U + 1 || y < -0.8 || y > HEIGHT_U + 0.8) { Object.assign(q, spawn(0.2 + Math.random() * 0.8)); continue; }
        const b = clamp(0.1 + q.r / 3.5);
        for (const k of KEYS) {
          const g = b * Math.exp(-((k.cx - x) ** 2 + (k.cy - y) ** 2) / 0.4);
          if (g > s.v[k.i]) { s.v[k.i] = g; s.c[k.i] = q.col; }
        }
      }
      for (let i = 0; i < N; i++) put(out, i, s.c[i], s.v[i]);
    },
  },
  {
    id: 'orbit', name: 'Yörünge', hint: 'Ortadaki güneşin çevresinde dönen, arkasında iz bırakan gezegenler.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0.05, max: 1.5, step: 0.01, def: 0.4 },
      { key: 'count', label: 'Gezegen sayısı', type: 'range', min: 1, max: 6, step: 1, def: 4 },
      { key: 'trail', label: 'İz uzunluğu', type: 'range', min: 0.1, max: 2, step: 0.05, def: 0.8 },
      { key: 'sun', label: 'Güneş', type: 'toggle', def: true },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'atesbuz' },
    ],
    init(s) { s.v = new Float32Array(N); s.c = Array.from({ length: N }, () => [0, 0, 0]); s.ph = Math.random() * 100; },
    frame({ dt, p, out, s }) {
      // Yörüngeler yatay elipstir (klavye geniş ve basık). İçteki gezegen daha hızlı döner.
      // Elipsin üst yarısı "arkada" sayılır ve biraz loş çizilir: derinlik hissi verir.
      const kf = Math.pow(0.02, dt / p.trail);
      for (let i = 0; i < N; i++) s.v[i] *= kf;
      const n = p.count, SUB = 3; // kare içi ara adımlar: hızlı gezegen tuş atlamaz
      for (let j = 1; j <= SUB; j++) {
        const ph = s.ph + dt * p.speed * (j / SUB);
        for (let i = 0; i < n; i++) {
          const a = n > 1 ? 2.4 + (i * 5) / (n - 1) : 5;
          const th = ph * Math.PI * 2 * 1.6 * Math.pow(2.4 / a, 1.2) + i * 2.4;
          const x = CX + Math.cos(th) * a, y = CY + Math.sin(th) * a * 0.3;
          const col = vivid(pal(p.palette, i / n)), depth = 0.8 + 0.2 * Math.sin(th);
          for (const k of KEYS) {
            const g = depth * Math.exp(-((k.cx - x) ** 2 + (k.cy - y) ** 2) / 0.4);
            if (g > s.v[k.i]) { s.v[k.i] = g; s.c[k.i] = col; }
          }
        }
      }
      s.ph += dt * p.speed;
      if (p.sun) {
        const col = vivid(pal(p.palette, s.ph * 0.02 + 0.5));
        for (const k of KEYS) {
          const g = Math.exp(-((k.cx - CX) ** 2 + ((k.cy - CY) * 1.3) ** 2) / 1.5);
          if (g > s.v[k.i]) { s.v[k.i] = g; s.c[k.i] = col; }
        }
      }
      for (let i = 0; i < N; i++) put(out, i, s.c[i], s.v[i]);
    },
  },
  {
    id: 'circuit', name: 'Devre', hint: 'Devre yollarında ilerleyen, köşelerden dönerek sıra değiştiren sinyaller.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 2, max: 30, step: 0.5, def: 10 },
      { key: 'count', label: 'Sinyal sayısı', type: 'range', min: 1, max: 10, step: 1, def: 5 },
      { key: 'trail', label: 'İz uzunluğu', type: 'range', min: 0.1, max: 2.5, step: 0.05, def: 1 },
      { key: 'turn', label: 'Dönüş sıklığı', type: 'range', min: 0, max: 100, step: 1, def: 50, unit: '%' },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'yesilkod' },
    ],
    init(s) { s.v = new Float32Array(N); s.c = Array.from({ length: N }, () => [0, 0, 0]); s.sig = []; },
    frame({ dt, p, out, s }) {
      // Sinyal bir sıra boyunca ilerler; ara sıra dik dönüp bir iki sıra yukarı ya da aşağı geçer
      // ve aynı yönde sürer (baskı devre yolları gibi). Kenardan çıkınca yenisi girer.
      const gap = () => (p.turn > 0 ? (1.5 + Math.random() * 5) * (50 / p.turn) : Infinity); // sonraki dönüşe kadar yol (u)
      const spawn = () => {
        const dir = Math.random() < 0.5 ? 1 : -1;
        return { x: dir > 0 ? -0.5 : WIDTH_U + 0.5, y: ((Math.random() * HEIGHT_U) | 0) + 0.5, dir, ty: null, next: gap(), col: randVivid(p.palette) };
      };
      while (s.sig.length < p.count) { const q = spawn(); q.x = Math.random() * WIDTH_U; s.sig.push(q); }
      s.sig.length = Math.min(s.sig.length, p.count);
      const kf = Math.pow(0.02, dt / p.trail);
      for (let i = 0; i < N; i++) s.v[i] *= kf;
      const steps = Math.min(40, Math.max(1, Math.ceil((p.speed * dt) / 0.4))), ds = (p.speed * dt) / steps; // küçük adımlar: tuş atlanmaz
      for (const q of s.sig) for (let j = 0; j < steps; j++) {
        if (q.ty === null) {
          q.x += q.dir * ds; q.next -= ds;
          if (q.next <= 0 && q.x > 1 && q.x < WIDTH_U - 1) {
            const row = Math.floor(q.y), opts = [-2, -1, 1, 2].filter((d) => row + d >= 0 && row + d < HEIGHT_U);
            q.ty = row + opts[(Math.random() * opts.length) | 0] + 0.5;
          }
        } else {
          const d = Math.sign(q.ty - q.y);
          q.y += d * ds;
          if ((q.ty - q.y) * d <= 0) { q.y = q.ty; q.ty = null; q.next = gap(); }
        }
        if (q.x < -1 || q.x > WIDTH_U + 1) { Object.assign(q, spawn()); break; }
        const row = ROW_KEYS[clamp(Math.floor(q.y), 0, HEIGHT_U - 1)];
        for (const k of row) if (q.x >= k.x && q.x < k.x + k.w) { s.v[k.i] = 1; s.c[k.i] = q.col; break; }
      }
      for (let i = 0; i < N; i++) put(out, i, s.c[i], s.v[i]);
    },
  },
  {
    id: 'stack', name: 'Yığın', hint: 'Renkli bloklar kayarak gelir ve sıraları doldurur; klavye dolunca süpürülür, yeniden başlar.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 4, max: 50, step: 0.5, def: 20 },
      { key: 'alt', label: 'Dönüşümlü yön', type: 'toggle', def: true },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'saripembe' },
    ],
    init(s) { s.rows = null; },
    frame({ dt, p, out, s }) {
      // Her sırada bloklar karşı kenardan art arda kayarak gelir, dolu kısmın ucuna oturur. Bütün
      // sıralar dolunca kısa bir bekleme, sonra soldan sağa yumuşak kenarlı bir süpürme ile boşalır.
      if (!s.rows || s.alt !== p.alt) {
        s.alt = p.alt; s.hue = s.hue ?? Math.random(); s.wipe = -1; s.hold = 0;
        s.col = Array.from({ length: N }, () => [0, 0, 0]);
        s.rows = ROW_KEYS.map((keys, r) => {
          const sgn = p.alt && r % 2 ? -1 : 1; // +1: sola yığılır (bloklar sağdan gelir), -1: tersi
          return { sgn, order: sgn > 0 ? keys : [...keys].reverse(), fill: 0, sent: 0, blks: [], wait: Math.random() * 0.5, k: 0.85 + Math.random() * 0.3 };
        });
      }
      let full = true;
      for (const R of s.rows) {
        if (R.fill < R.order.length) full = false;
        if (R.sent < R.order.length && (R.wait -= dt) <= 0) {
          s.hue = fract(s.hue + 0.045); // art arda gelen bloklar palette komşu renkler alır
          R.blks.push({ x: R.sgn > 0 ? WIDTH_U + 1 : -1, col: pal(p.palette, s.hue), tgt: R.order[R.sent++] });
          R.wait = (3 + Math.random() * 6) / p.speed; // bloklar arası en az 3u: sıradaki öndekine yetişmez
        }
        for (const b of R.blks) b.x -= R.sgn * p.speed * R.k * dt;
        while (R.blks.length && (R.blks[0].x - R.blks[0].tgt.cx) * R.sgn <= 0) { const b = R.blks.shift(); s.col[b.tgt.i] = b.col; R.fill++; }
      }
      if (full) { if (s.wipe < 0) { if ((s.hold += dt) > 1) s.wipe = 0; } else s.wipe += (dt * p.speed) / 22; }
      const wx = s.wipe < 0 ? -1e9 : -2.5 + s.wipe * (WIDTH_U + 5);
      for (const R of s.rows) R.order.forEach((k, j) => {
        if (j < R.fill) return put(out, k.i, s.col[k.i], sm(clamp((k.cx - wx) / 2.5)));
        let v = 0, col = s.col[k.i];
        for (const b of R.blks) {
          const e = (k.cx - b.x) * R.sgn; // > 0: bloğun arkası (geldiği taraf)
          const bv = Math.max(Math.max(0, 1 - Math.abs(e) / 0.9), e > 0 ? 0.5 * Math.max(0, 1 - e / 2.5) : 0);
          if (bv > v) { v = bv; col = b.col; }
        }
        put(out, k.i, col, v);
      });
      if (s.wipe >= 1) s.rows = null; // boşaldı: sonraki karede baştan
    },
  },
  {
    id: 'chevron', name: 'Şevron', hint: 'Klavye boyunca akan ok başı biçimli renk bantları.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0, max: 2, step: 0.01, def: 0.4 },
      { key: 'scale', label: 'Bant genişliği', type: 'range', min: 0.2, max: 3, step: 0.01, def: 0.8 },
      { key: 'sharp', label: 'Ok açısı', type: 'range', min: 0, max: 3, step: 0.05, def: 1.3 },
      { key: 'reverse', label: 'Ters yön', type: 'toggle', def: false },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'tropik' },
    ],
    init(s) { s.ph = 0; },
    frame({ dt, p, out, s }) {
      // Orta sıra önde, üst ve alt sıralar geride: bantlar ">" biçimini alır ve o yöne akar.
      s.ph += dt * p.speed;
      const dir = p.reverse ? -1 : 1;
      for (const k of KEYS) put(out, k.i, pal(p.palette, (dir * k.cx + Math.abs(k.cy - CY) * p.sharp) / WIDTH_U / p.scale - s.ph));
    },
  },
  {
    id: 'storm', name: 'Fırtına', hint: 'Koyu bulutlar ve ara sıra çakan şimşekler.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0.2, max: 3, step: 0.05, def: 1 },
      { key: 'rate', label: 'Şimşek sıklığı', type: 'range', min: 0.05, max: 2, step: 0.05, def: 0.4 },
      { key: 'color', label: 'Şimşek', type: 'color', def: '#dfe9ff' },
      { key: 'base', label: 'Bulut', type: 'color', def: '#0a1a5c' },
    ],
    init(s) { s.ph = 0; s.flash = 0; s.fx = CX; s.w = 4; },
    frame({ t, dt, p, out, s }) {
      s.ph += dt * p.speed;
      if (Math.random() < p.rate * p.speed * dt) { s.flash = 1; s.fx = Math.random() * WIDTH_U; s.w = 2 + Math.random() * 6; }
      s.flash *= Math.pow(0.003, dt / 0.45);
      const flick = s.flash * (0.6 + 0.4 * Math.sin(t * 70));
      const L = hexToRgb(p.color), B = hexToRgb(p.base);
      for (const k of KEYS) {
        const cloud = 0.2 + 0.8 * noise3(k.cx * 0.25 + s.ph * 0.6, k.cy * 0.5, s.ph * 0.2);
        const l = clamp(flick * Math.max(0.25, 1 - Math.abs(k.cx - s.fx) / s.w));
        put(out, k.i, [mix(B[0] * cloud, L[0], l), mix(B[1] * cloud, L[1], l), mix(B[2] * cloud, L[2], l)]);
      }
    },
  },
  {
    id: 'heartbeat', name: 'Kalp atışı', hint: 'Merkezden çift vuruşla yayılan nabız.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 30, max: 160, step: 1, def: 70 },
      { key: 'color', label: 'Renk', type: 'color', def: '#ff1744' },
      { key: 'base', label: 'Zemin', type: 'color', def: '#1a0006' },
    ],
    init(s) { s.ph = 0; },
    frame({ dt, p, out, s }) {
      s.ph += (dt * p.speed) / 60;
      const ph = fract(s.ph), C = hexToRgb(p.color), B = hexToRgb(p.base);
      for (const k of KEYS) {
        const d = Math.hypot(k.cx - CX, (k.cy - CY) * 1.8);
        let v = 0;
        for (const [t0, amp] of [[0, 1], [0.22, 0.7]]) {
          const age = ph - t0;
          if (age < 0) continue;
          const life = Math.max(0, 1 - age / 0.5);
          v += amp * life * (Math.exp(-((d - age * 26) ** 2) / 5) + Math.exp(-age * 14) * Math.exp(-(d * d) / 10));
        }
        v = clamp(v);
        put(out, k.i, [mix(B[0], C[0], v), mix(B[1], C[1], v), mix(B[2], C[2], v)]);
      }
    },
  },
  {
    id: 'scanner', name: 'Tarayıcı', hint: 'Bir uçtan diğerine gidip gelen ışık çubuğu.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0.2, max: 3, step: 0.05, def: 0.8 },
      { key: 'width', label: 'Genişlik', type: 'range', min: 0.5, max: 4, step: 0.1, def: 1.4 },
      { key: 'rainbow', label: 'Renk değiştir', type: 'toggle', def: false },
      { key: 'color', label: 'Renk', type: 'color', def: '#ff2a2a' },
      { key: 'base', label: 'Zemin', type: 'color', def: '#140000' },
    ],
    init(s) { s.ph = 0; s.trail = new Float32Array(N); },
    frame({ dt, p, out, s }) {
      s.ph += dt * p.speed;
      const x = (1 - Math.abs(fract(s.ph) * 2 - 1)) * WIDTH_U;
      const kf = Math.pow(0.02, dt / 0.5);
      const C = p.rainbow ? hsv(s.ph * 0.1, 1, 1) : hexToRgb(p.color), B = hexToRgb(p.base);
      for (const k of KEYS) {
        const v = s.trail[k.i] = Math.max(s.trail[k.i] * kf, Math.max(0, 1 - Math.abs(k.cx - x) / p.width));
        put(out, k.i, [mix(B[0], C[0], v), mix(B[1], C[1], v), mix(B[2], C[2], v)]);
      }
    },
  },
  {
    id: 'fireflies', name: 'Ateş böcekleri', hint: 'Karanlıkta süzülen, yanıp sönen yumuşak ışık noktaları.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0.1, max: 3, step: 0.05, def: 0.6 },
      { key: 'count', label: 'Sayı', type: 'range', min: 2, max: 12, step: 1, def: 6 },
      { key: 'size', label: 'Parıltı', type: 'range', min: 0.6, max: 3, step: 0.05, def: 1.5 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'limonbuz' },
    ],
    init(s) { s.ph = 0; },
    frame({ dt, p, out, s }) {
      s.ph += dt * p.speed;
      const flies = [];
      for (let i = 0; i < p.count; i++) {
        const seed = i * 17.3 + 3.1;
        flies.push({
          x: ((noise3(seed, s.ph * 0.25, 0) - 0.5) * 1.9 + 0.5) * WIDTH_U,
          y: ((noise3(seed + 50, s.ph * 0.25, 7) - 0.5) * 1.9 + 0.5) * HEIGHT_U,
          glow: 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(s.ph * 2 + seed)),
          col: pal(p.palette, i / p.count),
        });
      }
      const s2 = p.size * p.size;
      for (const k of KEYS) {
        let r = 0, g = 0, b = 0.02;
        for (const f of flies) {
          const v = f.glow * Math.exp(-((k.cx - f.x) ** 2 + ((k.cy - f.y) * 1.3) ** 2) / s2);
          r += f.col[0] * v; g += f.col[1] * v; b += f.col[2] * v;
        }
        put(out, k.i, [clamp(r), clamp(g), clamp(b)]);
      }
    },
  },
  {
    id: 'equalizer', name: 'Ekolayzer', hint: 'Müzik çalıyormuş gibi zıplayan çubuklar (ses dinlemez, canlandırmadır).',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 0.2, max: 4, step: 0.05, def: 1.5 },
      { key: 'peak', label: 'Tepe noktaları', type: 'toggle', def: true },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'gokkusagi' },
    ],
    init(s) { s.ph = 0; s.h = new Float32Array(WIDTH_U); s.peak = new Float32Array(WIDTH_U); },
    frame({ dt, p, out, s }) {
      s.ph += dt * p.speed;
      for (let c = 0; c < WIDTH_U; c++) {
        s.h[c] = clamp(noise3(c * 0.35, s.ph * 1.6, 0) * 1.6 - 0.25 + 0.2 * Math.sin(s.ph * 3 + c)) * HEIGHT_U;
        s.peak[c] = Math.max(s.h[c], s.peak[c] - dt * 2.5);
      }
      for (const k of KEYS) {
        const c = colOf(k), fromBottom = HEIGHT_U - 1 - k.row;
        const col = pal(p.palette, (c / WIDTH_U) * 0.85);
        const v = clamp(s.h[c] - fromBottom);
        if (p.peak && v < 0.5 && Math.abs(s.peak[c] - 0.5 - fromBottom) < 0.5) put(out, k.i, [1, 1, 1], 0.9);
        else put(out, k.i, col, v);
      }
    },
  },
  {
    id: 'snake', name: 'Yılan', hint: 'Tuşların arasında kıvrılarak dolaşan ışıklı yılan.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 2, max: 40, step: 0.5, def: 14 },
      { key: 'length', label: 'Uzunluk', type: 'range', min: 3, max: 40, step: 1, def: 14 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'gokkusagi' },
    ],
    init(s) {
      s.pos = 0;
      // yılan yolu: sıralar dönüşümlü olarak soldan sağa, sağdan sola
      s.path = [];
      for (let r = 0; r < HEIGHT_U; r++) { const row = KEYS.filter((k) => k.row === r); s.path.push(...(r % 2 ? row.reverse() : row)); }
    },
    frame({ dt, p, out, s }) {
      s.pos = (s.pos + dt * p.speed) % N;
      s.path.forEach((k, j) => {
        const dist = (s.pos - j + N) % N;
        const v = dist < p.length ? Math.pow(1 - dist / p.length, 1.4) : 0;
        put(out, k.i, dist < 1 ? [1, 1, 1] : pal(p.palette, (dist / p.length) * 0.8), v);
      });
    },
  },
  {
    id: 'reactive', name: 'Tuş dalgası',
    shelved: true, // rafa kaldırıldı: kod duruyor, arayüzde gösterilmiyor
    hint: 'Bastığın tuştan renk yayılır. Klavyenin kendi efektidir: hangi programda yazarsan yaz çalışır. Klavyenin halkası birkaç tuş ötede söner; hız bunu değiştirmez (firmware sınırı). Önizlemeyi görmek için bu sayfadayken bir tuşa bas.',
    onboardOnly: true,
    params: [
      { key: 'style', label: 'Stil', type: 'select', options: [['ring', 'Halka: basılan tuştan dalga yayılır'], ['key', 'Tek tuş: yalnızca basılan tuş yanar']], def: 'ring' },
      { key: 'speed', label: 'Yayılma hızı', type: 'range', min: 1, max: 10, step: 1, def: 5 },
      { key: 'random', label: 'Her basışta rastgele renk', type: 'toggle', def: false },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'gokkusagi' },
    ],
    init(s) { s.waves = []; s.v = new Float32Array(N); s.c = Array.from({ length: N }, () => [0, 0, 0]); },
    frame({ t, dt, p, out, s, presses }) {
      const keyCol = (k) => pal(p.palette, (k.cx / WIDTH_U) * 0.85);
      for (const k of presses) {
        const col = p.random ? hsv(Math.random(), 1, 1) : null;
        s.waves.push({ x: k.cx, y: k.cy, t0: t, col });
        s.v[k.i] = 1; s.c[k.i] = col || keyCol(k);
      }
      const kf = Math.pow(0.02, dt / 0.7);
      for (let i = 0; i < N; i++) s.v[i] *= kf;
      if (p.style === 'ring') {
        s.waves = s.waves.filter((w) => t - w.t0 < 1.6);
        for (const w of s.waves) {
          const r = (t - w.t0) * (4 + p.speed * 1.6), life = Math.max(0, 1 - (t - w.t0) / 1.6);
          for (const k of KEYS) {
            const v = Math.max(0, 1 - Math.abs(Math.hypot(k.cx - w.x, (k.cy - w.y) * 1.2) - r) / 1.1) * life;
            if (v > s.v[k.i]) { s.v[k.i] = v; s.c[k.i] = w.col || keyCol(k); }
          }
        }
      } else s.waves.length = 0;
      for (const k of KEYS) put(out, k.i, s.c[k.i], s.v[k.i]);
    },
  },
];

// Her efektte, Hız'ın hemen altında kendi parlaklık ayarı. Efektin frame() koduna dokunmaz:
// motor (engine.js) ve servis çıktıyı bu değerle ölçekler; her efekt kendi değerini hatırlar.
for (const fx of EFFECTS) {
  if (fx.params.some((q) => q.key === 'brightness')) continue;
  const at = fx.params.findIndex((q) => q.key === 'speed') + 1;
  fx.params.splice(at, 0, { key: 'brightness', label: 'Parlaklık', type: 'range', min: 5, max: 100, step: 1, def: 100, unit: '%' });
}
export const brightnessOf = (p) => (typeof p?.brightness === 'number' ? p.brightness / 100 : 1);

// Canlı efektin klavyede kalıcı karşılığı: firmware özel animasyon saklayamadığı için
// en yakın yerleşik hareket modu (2 Geçişli, 3 Nefes, 4 Dalga, 5 Halka, 6 Tepki, 7 Rastgele)
// + efektin o anki ayarlarından üretilen tuş renkleri.
const solid = (hex) => { const c = hexToRgb(hex); return KEYS.map(() => c); };
// Hive'ın arayüzü ve cihaz testleri: Geçişli (2) ve Dalga (4) firmware'in kendi gökkuşağını
// oynatır, tuş renklerini yok sayar. Nefes (3), Halka (5), Tepki (6), Rastgele (7) ve
// Statik (1) yazılan tuş renklerini kullanır.
// Özel renkli akış klavyede saklanamıyor. Bu durumda renkler yanıp sönmeden, sabit (Statik, 1)
// olarak kaydedilir; Nefes (3) yalnızca kendisi nefes efekti olan "İki renkli nefes"te kullanılır.
const BUILTIN_RAINBOW = 'Dalga ve Geçişli hareketleri yalnızca klavyenin kendi gökkuşağını gösterebiliyor';
const ONBOARD = {
  // Gökkuşağı dahil hiçbir palet firmware'in Dalga/Geçişli moduna gönderilmez: o modlar
  // parlaklığı da oynatıyor (nefes gibi görünüyor). Kayıt her zaman sabit renktir; akış servisle oynar.
  rainbow(p) {
    const a = (p.angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    return { mode: 1, why: BUILTIN_RAINBOW, rgb: KEYS.map((k) => pal(p.palette, ((k.cx * ca + k.cy * sa) / WIDTH_U) / p.scale)) };
  },
  spectrum: (p) => ({ mode: 1, why: BUILTIN_RAINBOW, rgb: KEYS.map((k) => pal(p.palette, (k.cx / WIDTH_U) * 0.85)) }),
  aurora: (p) => ({ mode: 1, why: BUILTIN_RAINBOW, rgb: KEYS.map((k) => pal(p.palette, noise3(k.cx * p.zoom, k.cy * p.zoom * 1.6, 0) * 1.3)) }),
  fire(p) {
    const ramp = p.blue ? [[0.8, 1, 1], [0, 0.6, 1], [0, 0.05, 0.6]] : [[1, 0.8, 0.15], [1, 0.35, 0], [0.8, 0, 0]];
    return { mode: 7, rgb: KEYS.map((k) => rampPalette(ramp, 1 - k.row / (HEIGHT_U - 1))) };
  },
  matrix: (p) => ({ mode: 7, rgb: solid(p.color) }),
  twinkle: (p) => (p.rainbow ? { mode: 7, rgb: null, random: true } : { mode: 7, rgb: solid(p.star) }),
  breathe(p) {
    const A = hexToRgb(p.a), B = hexToRgb(p.b);
    return { mode: 3, rgb: KEYS.map((k) => { const m = k.cx / WIDTH_U; return [mix(A[0], B[0], m), mix(A[1], B[1], m), mix(A[2], B[2], m)]; }) };
  },
  plasma(p) {
    const z = p.zoom;
    return { mode: 1, why: BUILTIN_RAINBOW, rgb: KEYS.map((k) => {
      const x = k.cx * z, y = k.cy * z * 1.5;
      const v = Math.sin(x) + Math.sin(y * 0.8) + Math.sin((x + y) * 0.7) + Math.sin(Math.hypot(x - 3, y - 1));
      return pal(p.palette, v / 8 + 0.5);
    }) };
  },
  radar: (p) => ({ mode: 1, why: BUILTIN_RAINBOW, rgb: solid(p.color) }),
  gradient(p) {
    const stops = [hexToRgb(p.c1), hexToRgb(p.c2), hexToRgb(p.c3)];
    return { mode: 1, why: BUILTIN_RAINBOW, rgb: KEYS.map((k) => samplePalette(stops, (p.vertical ? k.cy / HEIGHT_U : k.cx / WIDTH_U) * 0.67)) };
  },
  reactive: (p) => ({
    mode: p.style === 'ring' ? 5 : 6,
    rgb: p.random ? null : KEYS.map((k) => pal(p.palette, (k.cx / WIDTH_U) * 0.85)),
    random: !!p.random,
    speed: Math.min(1, Math.max(0, (p.speed - 1) / 9)),
  }),
};
export const onboardFor = (fx, p) => ONBOARD[fx.id]?.(p) ?? null;

export const defaultsFor = (fx) => Object.fromEntries(fx.params.map((q) => [q.key, q.def]));
