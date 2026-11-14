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
export const LAPTOP_DEFAULT = { on: true, effect: 'static', color: '#ff2a3a', speed: 'med', direction: 'right', level: 'med' };

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
  const fx = LAPTOP_EFFECTS.find((e) => e.id === c.effect);
  const a = ['aura', 'effect', fx.id];
  if (fx.color) a.push('-c', c.color.slice(1));
  if (fx.speed) a.push('--speed', c.speed);
  if (fx.direction) a.push('--direction', c.direction);
  await run(a);
  await run(['leds', 'set', c.level === 'off' ? 'low' : c.level]);
}

