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
};
export const PALETTE_OPTS = [
  ['gokkusagi', 'Gökkuşağı'], ['aurora', 'Aurora'], ['okyanus', 'Okyanus'], ['gunbatimi', 'Gün batımı'],
  ['orman', 'Orman'], ['lav', 'Lav'], ['siber', 'Siber'],
  ['kizil', 'Kızıl gece'], ['mavikizil', 'Mavi kızıl'], ['gece', 'Gece yarısı'], ['seftali', 'Şeftali'],
  ['limonbuz', 'Limon buz'], ['saripembe', 'Sarı pembe'], ['morotesi', 'Mor ötesi'], ['tamspektrum', 'Tam spektrum'],
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
    id: 'ripples', name: 'Halkalar', hint: 'Rastgele noktalardan suya düşen damla gibi yayılan halkalar.',
    params: [
      { key: 'speed', label: 'Hız', type: 'range', min: 2, max: 20, step: 0.5, def: 8 },
      { key: 'rate', label: 'Sıklık', type: 'range', min: 0.2, max: 5, step: 0.1, def: 1.4 },
      { key: 'palette', label: 'Palet', type: 'select', options: PALETTE_OPTS, def: 'okyanus' },
    ],
    init(s) { s.drops = []; },
    frame({ dt, p, out, s }) {
      if (Math.random() < p.rate * dt && s.drops.length < 12) s.drops.push({ x: Math.random() * WIDTH_U, y: Math.random() * HEIGHT_U, r: 0, col: pal(p.palette, Math.random()) });
      for (const d of s.drops) d.r += p.speed * dt;
      s.drops = s.drops.filter((d) => d.r < 15);
      for (const k of KEYS) {
        let r = 0, g = 0, b = 0;
        for (const d of s.drops) {
          const v = Math.max(0, 1 - Math.abs(Math.hypot(k.cx - d.x, k.cy - d.y) - d.r) / 1.1) * (1 - d.r / 15);
          r += d.col[0] * v; g += d.col[1] * v; b += d.col[2] * v;
        }
        put(out, k.i, [clamp(r), clamp(g), clamp(b)]);
      }
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
