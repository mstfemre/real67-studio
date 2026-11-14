// Laptop (ASUS Aura) klavye ışığı: asusctl üzerinden. Yalnızca Linux'ta ve asusctl varsa çalışır.
import { execFile } from 'node:child_process';

export const LAPTOP_EFFECTS = [
  { id: 'static', name: 'Sabit', color: true },
  { id: 'rainbow-cycle', name: 'Gökkuşağı', speed: true },
  { id: 'rainbow-wave', name: 'Dalga', speed: true, direction: true },
  { id: 'comet', name: 'Kuyruklu yıldız', color: true },
  { id: 'ripple', name: 'Dalgacık', color: true, speed: true },
  { id: 'rain', name: 'Yağmur', speed: true },
];
const LEVELS = ['off', 'low', 'med', 'high'];
const SPEEDS = ['low', 'med', 'high'];
const DIRS = ['left', 'right', 'up', 'down'];
export const LAPTOP_DEFAULT = { on: true, sync: false, effect: 'static', color: '#ff2a3a', speed: 'med', direction: 'right', level: 'med' };

const run = (args) => new Promise((resolve, reject) =>
  execFile('asusctl', args, { timeout: 5000 }, (err, out, errOut) => err ? reject(new Error((errOut || err.message).trim())) : resolve(out)));

let avail = null;
export async function laptopAvailable() {
  if (avail === null) avail = await run(['leds', 'get']).then(() => true, () => false);
  return avail;
}

export function sanitize(cfg = {}, base = LAPTOP_DEFAULT) {
  const c = { ...base };
  if (typeof cfg.on === 'boolean') c.on = cfg.on;
  if (typeof cfg.sync === 'boolean') c.sync = cfg.sync;
  if (LAPTOP_EFFECTS.some((e) => e.id === cfg.effect)) c.effect = cfg.effect;
  if (typeof cfg.color === 'string' && /^#[0-9a-f]{6}$/i.test(cfg.color)) c.color = cfg.color.toLowerCase();
  if (SPEEDS.includes(cfg.speed)) c.speed = cfg.speed;
  if (DIRS.includes(cfg.direction)) c.direction = cfg.direction;
  if (LEVELS.includes(cfg.level)) c.level = cfg.level;
  return c;
}

export async function laptopApply(c) {
  if (!(await laptopAvailable())) throw new Error('asusctl bulunamadı');
  if (!c.on) return void await run(['leds', 'set', 'off']);
  if (c.sync) { laptopSyncReset(); return void await run(['leds', 'set', c.level === 'off' ? 'low' : c.level]); } // renk akıştan gelir
  const fx = LAPTOP_EFFECTS.find((e) => e.id === c.effect);
  const a = ['aura', 'effect', fx.id];
  if (fx.color) a.push('-c', c.color.slice(1));
  if (fx.speed) a.push('--speed', c.speed);
  if (fx.direction) a.push('--direction', c.direction);
  await run(a);
  await run(['leds', 'set', c.level === 'off' ? 'low' : c.level]);
}

// ---- Real67 ile eşleme: klavyedeki efektin ortalama rengini laptop klavyesine "sabit" renk olarak gönderir.
let sync = { t: 0, busy: false, last: null };
export function laptopSyncReset() { sync.last = null; }
export function laptopSyncFrame(colors, now) {
  if (sync.busy || now - sync.t < 450) return;
  sync.t = now;
  let r = 0, g = 0, b = 0, w = 0;
  for (const c of colors) {
    const l = Math.max(c.r, c.g, c.b);
    if (l < 12) continue; // sönük tuşlar rengi sulandırmasın
    r += c.r * l; g += c.g * l; b += c.b * l; w += l;
  }
  let col;
  if (!w) col = [0, 0, 0];
  else { const m = Math.max(r, g, b) / w || 1; col = [r, g, b].map((v) => Math.min(255, Math.round((v / w) * (255 / m)))); }
  if (sync.last && Math.hypot(col[0] - sync.last[0], col[1] - sync.last[1], col[2] - sync.last[2]) < 22) return;
  sync.last = col; sync.busy = true;
  const hex = col.map((v) => v.toString(16).padStart(2, '0')).join('');
  run(['aura', 'effect', 'static', '-c', hex]).catch(() => {}).finally(() => { sync.busy = false; });
}
