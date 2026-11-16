// Real67 Studio: ışık akışı klavyenin 8000 Hz raporlamasını / rapid trigger'ı etkiliyor mu?
//
//   node service/klavye-testi.mjs          (proje klasöründen)
//
// Ne yapar: servisi durdurur, sen ~40 sn tuşlara hızlı hızlı basarken dört bölüm ölçer:
// ışık akışı KAPALI / AÇIK / AÇIK / KAPALI. "Açık" bölümde klavyeye servisin en ağır hali
// gönderilir (60 kare/sn, her karede 67 tuşun tamamı = 6 paket). Sonra iki durumu karşılaştırır:
//   1) Tuş raporları hâlâ 1 ms'den sık geliyor mu (8K çalışıyor mu)?
//   2) Işık paketi yazılırken gelen basışlar gecikiyor mu (klavye o sırada tuş taramayı bırakıyor mu)?
//   3) Tuş / tetik ayarları testten önce ve sonra aynı mı (salt-okunur sorgularla)?
// Bitince klavyeyi eski ışığına döndürür ve servisi kaldığı efektle yeniden başlatır.
//
// Ölçüm kanca kurmaz: Windows'a tuş durumu sorulur (GetAsyncKeyState), boş bir çekirdekte sıkı döngüyle.
import { fork, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Real67, VID, PID, USAGE_PAGE, KEY_COUNT, buildFrame, decodeParams, keyBrightCap } from '../web-app/js/protocol.js';
import { hsv } from '../web-app/js/effects.js';

const require = createRequire(import.meta.url);
const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const RESULT_FILE = path.join(path.dirname(SELF), 'klavye-testi-sonuc.json');
const PORT = 8667, LIVE_SLOT = 6;
const now = () => Number(process.hrtime.bigint()) / 1e6; // ms; süreçler arasında aynı saat
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, def) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? Number(a.split('=')[1]) : def; };

// ============================================================ ışık yazıcı (ayrı süreç)
// Servisin yaptığını yapar: aynı sürücü (Real67.writeSlot), aynı zamanlama (5 ms'de bir "kare vakti mi").
// Ayrı süreçte çalışır ki ölçüm döngüsü yazmayı, yazma da ölçümü bekletmesin.
async function writer() {
  const HID = require('node-hid');
  const info = HID.devices().find((d) => d.vendorId === VID && d.productId === PID && d.usagePage === USAGE_PAGE);
  if (!info) { process.send({ error: 'Klavye bulunamadı' }); process.exit(1); }
  const listeners = new Set();
  let h = new HID.HID(info.path);
  const dev = {
    opened: true, productName: info.product,
    async open() {}, async close() { try { h.close(); } catch { /* kapalı */ } },
    addEventListener: (t, fn) => listeners.add(fn), removeEventListener: (t, fn) => listeners.delete(fn),
    async sendReport(id, data) { h.write([id, ...data]); },
  };
  h.on('data', (buf) => { const ev = { data: new DataView(buf.buffer, buf.byteOffset, buf.byteLength) }; for (const fn of listeners) fn(ev); });
  h.on('error', (e) => { process.send({ error: 'Klavye bağlantısı koptu: ' + e.message }); process.exit(1); });
  const kb = new Real67(dev);
  await kb.open();

  // Hive'ın salt-okunur sorguları (CLAUDE.md): tuş atamaları / tetik ayarları / cihaz bilgisi.
  // Hiçbir şey yazmazlar; cevaplar testten önce ve sonra karşılaştırılır.
  const QUERIES = [[0x0a, 0x97], [0x04, 0x80], [0x04, 0x81], [0x04, 0x83], [0x04, 0x85], [0x02, 0x80]];
  const ask = (g, s) => new Promise((res) => {
    const done = (v) => { clearTimeout(t); listeners.delete(on); res(v); };
    const on = (ev) => {
      const u = new Uint8Array(ev.data.buffer, ev.data.byteOffset, ev.data.byteLength);
      if (u[0] === 0xee) done('hata'); else if (u[0] === g && u[1] === (s & 0x7f)) done(Buffer.from(u).toString('hex'));
    };
    const t = setTimeout(() => done('yanıt yok'), 400);
    listeners.add(on);
    h.write([0, ...buildFrame(g, s, [])]);
  });
  const snapshot = async () => { const out = {}; for (const [g, s] of QUERIES) out[`${g.toString(16)}:${s.toString(16)}`] = await ask(g, s); return out; };

  let saved = null, writing = false, busy = false, last = 0, phase = 0, frames = [];
  const colors = new Array(KEY_COUNT);
  setInterval(async () => {
    if (!writing || busy || now() - last < 1000 / 60 - 3) return;
    busy = true;
    try {
      last = now(); phase += 0.02;
      for (let i = 0; i < KEY_COUNT; i++) { const c = hsv(phase + i / KEY_COUNT, 1, 0.5); colors[i] = { r: c[0] * 255 | 0, g: c[1] * 255 | 0, b: c[2] * 255 | 0, x: 0x33 }; }
      const t0 = now();
      await kb.writeSlot(LIVE_SLOT, colors); // tam kare: 6 paket, her biri cevabı beklenerek
      frames.push(t0, now());
    } catch (e) { process.send({ error: 'Yazılamadı: ' + e.message }); writing = false; }
    busy = false;
  }, 5);
  const idle = async () => { while (busy) await sleep(2); };

  process.on('message', async (m) => {
    try {
      if (m.cmd === 'prepare') {
        const before = await snapshot();
        const p1 = await kb.getKeyParams(1);
        saved = { mode: await kb.getKeyMode(), slot: await kb.getSlot(), colors: await kb.readSlot(LIVE_SLOT), params: [...p1.raw] };
        await kb.setBacklight(true); await kb.setSlot(LIVE_SLOT); await kb.setKeyMode(1);
        await kb.setKeyParams({ ...(await kb.getKeyParams(1)), brightness: keyBrightCap(1) });
        process.send({ ack: 'prepare', before });
      } else if (m.cmd === 'on') { writing = true; process.send({ ack: 'on' }); }
      else if (m.cmd === 'off') { writing = false; await idle(); const f = frames; frames = []; process.send({ ack: 'off', frames: f }); }
      else if (m.cmd === 'finish') {
        writing = false; await idle();
        if (saved) { await kb.writeSlot(LIVE_SLOT, saved.colors); await kb.setKeyParams(decodeParams(saved.params)); await kb.setSlot(saved.slot); await kb.setKeyMode(saved.mode); }
        const after = await snapshot();
        process.send({ ack: 'finish', after }, () => { h.close(); process.exit(0); });
      }
    } catch (e) { process.send({ error: e.message }); }
  });
  process.send({ ack: 'ready' });
}

// ============================================================ ölçüm
async function api(p, body) {
  const r = await fetch(`http://localhost:${PORT}/api/${p}`, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(4000) }
    : { signal: AbortSignal.timeout(1500) });
  return r.json();
}
const status = () => api('status').catch(() => null);

async function main() {
  const SEG = arg('sure', 10) * 1000;          // her bölümün süresi (sn)
  const AUTO = process.argv.includes('--auto'); // tuş beklemeden başla (kuru deneme)
  const koffi = require('koffi');
  const u32 = koffi.load('user32.dll');
  const state = u32.func('short GetAsyncKeyState(int vKey)');
  const map = u32.func('uint32_t MapVirtualKeyExW(uint32_t uCode, uint32_t uMapType, void *dwhkl)');
  const hkl = u32.func('void *GetKeyboardLayout(uint32_t idThread)')(0);
  // harf, rakam, noktalama ve boşluk tuşları (tarama koduyla: klavye düzeninden bağımsız)
  const scans = []; for (const [a, b] of [[0x02, 0x0d], [0x10, 0x1b], [0x1e, 0x28], [0x2c, 0x35], [0x39, 0x39]]) for (let s = a; s <= b; s++) scans.push(s);
  const vks = [...new Set(scans.map((s) => map(s, 3, hkl)).filter((v) => v > 0 && v < 256))];
  const down = new Uint8Array(vks.length);
  let aborted = false;

  function measure(ms) {
    for (let i = 0; i < vks.length; i++) down[i] = state(vks[i]) & 0x8000 ? 1 : 0;
    const ev = [], t0 = now(), end = t0 + ms;
    let sweeps = 0, prev = t0, gaps = 0;
    for (;;) {
      const t = now();
      if (t >= end) break;
      if (t - prev > 0.3) gaps++; // ölçüm döngüsü işletim sistemi tarafından bekletildi
      prev = t;
      for (let i = 0; i < vks.length; i++) {
        const d = state(vks[i]) & 0x8000 ? 1 : 0;
        if (d !== down[i]) { down[i] = d; ev.push(t); }
      }
      if ((++sweeps & 2047) === 0 && state(0x1b) & 0x8000) { aborted = true; break; }
    }
    return { ev, t0, t1: now(), sweeps, gaps };
  }

  const raw = process.stdin.isTTY;
  let onKey = null;
  if ((await status())?.paused) { console.log("Servis Hive için duraklatılmış görünüyor. Hive'ı kapatıp yeniden dene."); return; }
  if (raw) { process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', (d) => onKey?.(d)); } // basılan tuşlar terminale yazılmasın

  console.log('\n  Real67 Studio: 8K / gecikme testi');
  console.log('  ---------------------------------');
  console.log(`  Yaklaşık ${Math.round(SEG * 4 / 1000) + 3} saniye boyunca harf ve rakam tuşlarına İKİ ELLE, HIZLI ve SÜREKLİ bas`);
  console.log('  (avuçla ezmek de olur). Bölümler arasında durma; "BİTTİ" yazana kadar devam et.');
  console.log('  Esc: iptal. Enter, Win, Alt gibi tuşlara basma.\n');
  if (raw && !AUTO) {
    console.log('  Hazır olunca BOŞLUK tuşuna bas (bu pencere seçiliyken)...');
    await new Promise((res) => { onKey = (d) => { if (d.includes(0x20) || d.includes(0x0d)) { onKey = null; res(); } if (d.includes(0x03) || d.includes(0x1b)) { aborted = true; onKey = null; res(); } }; });
    if (aborted) { process.stdin.setRawMode(false); console.log('  İptal edildi.'); process.exit(0); }
  }
  console.log('  Hazırlanıyor (servis duruyor, klavye ışığı birkaç saniyeliğine değişecek)...');

  // ---- servis: çalışıyorsa durdur (yoksa onun ışık paketleri "kapalı" bölümleri de kirletir)
  const st = await status();
  const resumeCfg = st?.playing ? st.cfg : null;
  if (st) { await api('quit', {}).catch(() => {}); for (let i = 0; i < 30 && await status(); i++) await sleep(150); await sleep(400); }

  const child = fork(SELF, ['--writer'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  let waiter = null, childError = null;
  child.on('message', (m) => { if (m.error) childError = m.error; if (waiter) { const w = waiter; waiter = null; w(m); } });
  child.on('exit', () => { if (waiter) { const w = waiter; waiter = null; w({ error: childError || 'yazıcı süreç kapandı' }); } });
  const reply = () => new Promise((res) => { waiter = res; });
  const call = async (cmd) => { const p = reply(); child.send({ cmd }); const m = await p; if (m.error) throw new Error(m.error); return m; };

  const result = { when: new Date().toISOString(), segSeconds: SEG / 1000, keys: vks.length };
  try {
    const ready = await reply();
    if (ready.error) throw new Error(ready.error);
    const { before } = await call('prepare');
    for (const n of [3, 2, 1]) { process.stdout.write(`  ${n}... `); await sleep(700); }
    console.log('BAŞLA!\n');

    const plan = ['off', 'on', 'on', 'off']; // ABBA: yorulma / hız değişimi iki duruma eşit dağılsın
    const segs = [];
    for (let i = 0; i < plan.length && !aborted; i++) {
      await call(plan[i]);
      await sleep(250);
      console.log(`  bölüm ${i + 1}/4  (ışık akışı ${plan[i] === 'on' ? 'AÇIK ' : 'KAPALI'})  devam et...`);
      const m = measure(SEG);
      const off = await call('off');
      segs.push({ kind: plan[i], ...m, frames: off.frames });
    }
    console.log(aborted ? '\n  İptal edildi.\n' : '\n  BİTTİ. Tuşları bırakabilirsin.\n');
    const { after } = await call('finish');
    if (!aborted) Object.assign(result, analyse(segs), { settings: compareSettings(before, after) });
  } catch (e) {
    console.log('\n  Test tamamlanamadı: ' + e.message + '\n');
    try { child.kill(); } catch { /* zaten kapalı */ }
  } finally {
    if (raw) { await sleep(400); process.stdin.setRawMode(false); process.stdin.pause(); }
    // servisi eski haline getir
    if (st) {
      spawn('wscript', [path.join('windows', 'arka-planda-baslat.vbs')], { cwd: ROOT, detached: true, stdio: 'ignore' }).unref();
      let up = null; for (let i = 0; i < 40 && !(up = await status()); i++) await sleep(200);
      if (up && resumeCfg) await api('play', resumeCfg).catch(() => {});
      console.log(up ? `  Servis yeniden başlatıldı${resumeCfg ? ' (' + resumeCfg.fxId + ' sürüyor)' : ''}.` : '  Servis başlatılamadı: windows\\web-app-ac.vbs ile elle başlat.');
    }
  }
  if (result.off) { report(result); try { fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 1)); } catch { /* yazılamadı */ } }
  process.exit(0);
}

// ---- çözümleme
function analyse(segs) {
  const out = {};
  for (const kind of ['off', 'on']) {
    const list = segs.filter((s) => s.kind === kind);
    let events = 0, seconds = 0, gaps = 0, sweeps = 0, frames = 0;
    const deltas = [], writeDur = [];
    let during = 0, exposure = 0, total = 0; // yazma penceresine düşen olaylar / pencerenin süredeki payı
    for (const s of list) {
      events += s.ev.length; seconds += (s.t1 - s.t0) / 1000; gaps += s.gaps; sweeps += s.sweeps;
      for (let i = 1; i < s.ev.length; i++) deltas.push(s.ev[i] - s.ev[i - 1]);
      if (kind === 'on') {
        const f = s.frames; frames += f.length / 2;
        for (let j = 0; j < f.length; j += 2) { writeDur.push(f[j + 1] - f[j]); if (f[j] >= s.t0 && f[j + 1] <= s.t1) exposure += f[j + 1] - f[j]; }
        total += s.t1 - s.t0;
        let j = 0;
        for (const t of s.ev) { while (j + 2 < f.length && f[j + 2] <= t) j += 2; if (j < f.length && t >= f[j] && t <= f[j + 1]) during++; }
      }
    }
    // Aynı raporla gelen değişiklikler aynı turda (<~60 µs) görülür. 60 µs – 1 ms arası her aralık,
    // iki ayrı raporun 1 ms'den sık geldiğini gösterir: 1000 Hz'de bu aralık boş kalır.
    const sub = deltas.filter((d) => d > 0.06 && d < 0.9).sort((a, b) => a - b);
    const near = deltas.filter((d) => d > 0.06 && d < 5).length;
    const hist = new Array(32).fill(0); for (const d of sub) hist[Math.min(31, Math.floor(d / 0.03125))]++;
    // 125 µs'lik tarak: raporlar 125 µs'nin katlarında geliyorsa 1'e, rastgeleyse 0'a yakın
    let cs = 0, sn = 0; for (const d of sub) { const a = (2 * Math.PI * d) / 0.125; cs += Math.cos(a); sn += Math.sin(a); }
    out[kind] = {
      events, seconds: +seconds.toFixed(1), perSecond: +(events / seconds).toFixed(1),
      subMs: sub.length, subMsShare: near ? +(sub.length / near).toFixed(3) : 0,
      smallestGapUs: sub.length ? Math.round(sub[Math.floor(sub.length * 0.05)] * 1000) : null,
      comb125: sub.length ? +(Math.hypot(cs, sn) / sub.length).toFixed(2) : null,
      sweepUs: +((seconds * 1e6) / sweeps).toFixed(1), stalls: gaps, hist,
    };
    if (kind === 'on') {
      writeDur.sort((a, b) => a - b);
      const expected = events * (exposure / total);
      Object.assign(out.on, {
        frames, fps: +(frames / seconds).toFixed(1),
        writeMs: writeDur.length ? { median: +writeDur[writeDur.length >> 1].toFixed(2), p95: +writeDur[Math.floor(writeDur.length * 0.95)].toFixed(2) } : null,
        writeShare: +(exposure / total).toFixed(3),
        duringWrite: { observed: during, expected: +expected.toFixed(1), ratio: expected ? +(during / expected).toFixed(2) : null, sigma: expected ? +(1 / Math.sqrt(expected)).toFixed(2) : null },
      });
    }
  }
  return out;
}
function compareSettings(a, b) {
  const keys = Object.keys(a), answered = keys.filter((k) => !['hata', 'yanıt yok'].includes(a[k]));
  return { queries: keys.length, answered: answered.length, same: keys.every((k) => a[k] === b[k]), changed: keys.filter((k) => a[k] !== b[k]) };
}

function report(r) {
  const { off, on, settings } = r, col = (v) => String(v).padEnd(18);
  console.log('\n  SONUÇ' + ' '.repeat(34) + col('ışık KAPALI') + 'ışık AÇIK (her karede 67 tuşun tamamı)');
  console.log('  Tuş olayı (basma + bırakma)            ' + col(`${off.events} (${off.perSecond}/sn)`) + `${on.events} (${on.perSecond}/sn)`);
  console.log('  1 ms\'den sık gelen rapor çifti         ' + col(`${off.subMs} (%${Math.round(off.subMsShare * 100)})`) + `${on.subMs} (%${Math.round(on.subMsShare * 100)})`);
  console.log('  En kısa rapor aralığı (alt %5)         ' + col(off.smallestGapUs ? off.smallestGapUs + ' µs' : '-') + (on.smallestGapUs ? on.smallestGapUs + ' µs' : '-'));
  if (on.writeMs) console.log(`  Bir karenin yazılması: ortanca ${on.writeMs.median} ms (zamanın %${(on.writeShare * 100).toFixed(1)}'i), ${on.fps} kare/sn`);
  const d = on.duringWrite;
  if (d?.expected) console.log(`  Işık paketi yazılırken gelen tuş olayı: beklenen ${d.expected}, ölçülen ${d.observed}  (oran ${d.ratio} ± ${d.sigma})`);
  console.log(`  Tuş / tetik ayarları: ${settings.answered}/${settings.queries} sorgu yanıtlandı, testten önce ve sonra ${settings.same ? 'AYNI' : 'FARKLI: ' + settings.changed.join(', ')}`);
  if (Math.min(off.events, on.events) < 300) console.log('\n  Not: tuş olayı az (bölüm başına en az birkaç yüz gerekir); sonuç güvenilir değil, daha hızlı basarak yinele.');
  console.log(`\n  Ayrıntı: ${RESULT_FILE}\n`);
}

if (process.argv.includes('--writer')) await writer(); else await main();
