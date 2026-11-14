import {
  Real67, KEY_COUNT, DYNAMIC_SLOT, KEY_MODES, MOOD_MODES, MOOD_COLORS,
  keySpeedRange, MOOD_SPEED, keyBrightCap, moodBrightCap, decodeParams,
} from './protocol.js';
import { KEYS, KEY_BY_CODE, WIDTH_U, HEIGHT_U } from './layout.js';
import { EFFECTS, defaultsFor, hsv, pal, PALETTE_OPTS, hexToRgb, paletteCss, brightnessOf } from './effects.js';
import { Engine } from './engine.js';
import { colorControl, enhanceColorInput, closeColorPicker } from './colorpicker.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
// Sayfadaki renk alanları tarayıcının renk penceresi yerine uygulamanın kendi seçicisini kullanır
$$('input[type="color"]').forEach(enhanceColorInput);
const LIVE_SLOT = 6; // Özel 7

// ------------------------------------------------------------ durum
const store = loadStore();
// Rafa kaldırılanlar: kodları duruyor, arayüzde gösterilmiyor.
// Tuş dalgası efekti ve klavyenin Halka (5) / Tepki (6) modları.
const VISIBLE_EFFECTS = EFFECTS.filter((f) => !f.shelved);
const SHELVED_KEY_MODES = new Set([5, 6]);
const app = {
  kb: null,
  tab: 'live',
  live: false,
  liveBusy: false,
  liveSaved: null,
  liveX: new Array(KEY_COUNT).fill(0x33),
  lastSent: null,
  sending: false,
  resyncAt: 0,
  fx: VISIBLE_EFFECTS.find((f) => f.id === store.fxId) || VISIBLE_EFFECTS[0],
  source: null,
  paint: { slot: 0, slots: {}, undo: [], tool: 'brush', color: '#ff3df2', dirty: new Set(), timer: null, down: false },
  keyMode: null, keyParams: null,
  mood: null, moodParams: null,
};

function loadStore() {
  try { return JSON.parse(localStorage.getItem('real67-studio') || '{}'); } catch { return {}; }
}
function saveStore() {
  try { localStorage.setItem('real67-studio', JSON.stringify(store)); } catch { /* gizli pencere */ }
}
store.params ??= {};
const merged = new Set();
// Kayıtlı ayarları efektin şu anki parametrelerine göre süz: eski sürümden kalan anahtarlar
// atılır, aralık dışına düşen değerler (ör. ölçeği değişen hız) varsayılana döner.
function cleanParams(fx, saved = {}) {
  const out = defaultsFor(fx);
  for (const q of fx.params) {
    const v = saved[q.key];
    if (v === undefined) continue;
    if (q.type === 'range' && (typeof v !== 'number' || v < q.min || v > q.max)) continue;
    if (q.type === 'select' && !q.options.some((o) => o[0] === v)) continue;
    out[q.key] = v;
  }
  return out;
}
function paramsFor(fx) {
  if (!merged.has(fx.id) || !store.params[fx.id]) {
    store.params[fx.id] = cleanParams(fx, store.params[fx.id]);
    merged.add(fx.id);
  }
  return store.params[fx.id];
}

// ------------------------------------------------------------ yardımcılar
let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg; t.classList.toggle('err', err); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), err ? 5000 : 2600);
}
async function guard(fn) {
  try { return await fn(); } catch (e) { console.error(e); toast(e.message || String(e), true); }
}
const to255 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('');
const fromHex = (h, x = 0x33) => { const n = parseInt(h.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, x }; };
const blank = () => Array.from({ length: KEY_COUNT }, () => ({ r: 255, g: 255, b: 255, x: 0x33 }));

// ------------------------------------------------------------ klavye görseli
const board = $('#board');
const keyEls = KEYS.map((k) => {
  const el = document.createElement('div');
  el.className = 'key';
  el.style.left = (k.x / WIDTH_U) * 100 + '%';
  el.style.top = (k.y / HEIGHT_U) * 100 + '%';
  el.style.width = (k.w / WIDTH_U) * 100 + '%';
  el.style.height = (1 / HEIGHT_U) * 100 + '%';
  el.dataset.i = k.i;
  const cap = document.createElement('span');
  cap.textContent = k.label;
  el.append(cap);
  board.append(el);
  return cap;
});
function showRGB(arr255) { // [{r,g,b}] ya da Float32Array (0..1)
  for (let i = 0; i < KEY_COUNT; i++) {
    let r, g, b;
    if (arr255 instanceof Float32Array) { r = to255(arr255[i * 3]); g = to255(arr255[i * 3 + 1]); b = to255(arr255[i * 3 + 2]); }
    else ({ r, g, b } = arr255[i]);
    keyEls[i].style.setProperty('--c', `${r}, ${g}, ${b}`);
  }
}

// Vurgu rengi, ekrandaki ışığın baskın tonundan gelir
// Sitenin renkleri klavyede oynayan ışıktan gelir: arka plandaki üç ışık alanı efektin sol,
// orta ve sağ bölgelerinin rengini; vurgu rengi (kaydırıcılar, seçimler) en doygun tonunu alır.
// Cam yüzeyler bu ışıkları bulanıklaştırdığı için tüm arayüz efektin rengine bürünür.
const REGIONS = [
  { varName: '--blob-b', test: (k) => k.cx < WIDTH_U / 3 },                                 // sol
  { varName: '--glow', test: (k) => k.cx >= WIDTH_U / 3 && k.cx <= (WIDTH_U * 2) / 3 },   // orta / üst
  { varName: '--blob-c', test: (k) => k.cx > (WIDTH_U * 2) / 3 },                           // sağ
];
let accentT = 0;
function vivid(sum, weight, fallback) {
  if (weight < 0.02) return fallback;
  let [r, g, b] = sum.map((v) => v / weight);
  const mx = Math.max(r, g, b);
  if (mx < 0.02) return fallback;
  // parlaklığı tam yap ki koyu efektlerde de renk görünsün; tonu korur
  return [r / mx, g / mx, b / mx];
}
function updateAccent(rgbFloat) {
  const now = performance.now();
  if (now - accentT < 300) return;
  accentT = now;
  const root = document.documentElement.style;

  for (const reg of REGIONS) {
    const sum = [0, 0, 0]; let w = 0;
    for (const k of KEYS) {
      if (!reg.test(k)) continue;
      const o = k.i * 3, r = rgbFloat[o], g = rgbFloat[o + 1], b = rgbFloat[o + 2];
      const wt = Math.max(r, g, b); // parlak tuşlar daha çok sayılır
      sum[0] += r * wt; sum[1] += g * wt; sum[2] += b * wt; w += wt;
    }
    const prev = reg.last || [0.36, 0.3, 0.94];
    const c = vivid(sum, w, prev);
    reg.last = c;
    root.setProperty(reg.varName, c.map(to255).join(', '));
  }

  let best = null, bestS = 0.2;
  for (let i = 0; i < KEY_COUNT; i++) {
    const r = rgbFloat[i * 3], g = rgbFloat[i * 3 + 1], b = rgbFloat[i * 3 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const s = mx ? (mx - mn) / mx : 0;
    if (s * mx > bestS) { bestS = s * mx; best = [r, g, b]; }
  }
  if (!best) return;
  const [r, g, b] = best, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = Math.round(((h * 60) + 360) % 360);
  root.setProperty('--accent', `hsl(${h} 82% 56%)`);
  // sarı-yeşil-camgöbeği tonları açık: üzerindeki yazı koyu olmalı
  root.setProperty('--accent-ink', h > 38 && h < 200 ? '#101114' : '#ffffff');
}

// ------------------------------------------------------------ motor
const engine = new Engine();
engine.master = (store.master ?? 100) / 100;
engine.gamma = store.gamma ?? true;
engine.setEffect(app.fx, paramsFor(app.fx));
engine.start(store.fps ?? 30);

engine.onFrame((final, raw) => {
  // önizleme: gama uygulanmamış renk, genel parlaklıkla. Arayüz renkleri her sekmede efekti izler.
  const m = engine.master * brightnessOf(engine.params); // önizleme de efektin parlaklığını gösterir
  const view = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) view[i] = Math.min(1, Math.max(0, raw[i])) * m;
  if (app.tab !== 'paint' && app.tab !== 'modes') showRGB(view);
  updateAccent(raw);
  if (app.live && app.kb && !app.sending) sendFrame(final);
});

async function sendFrame(final) {
  app.sending = true;
  try {
    const colors = new Array(KEY_COUNT);
    const changed = [];
    const now = performance.now();
    const full = !app.lastSent || now > app.resyncAt;
    for (let i = 0; i < KEY_COUNT; i++) {
      const c = { r: to255(final[i * 3]), g: to255(final[i * 3 + 1]), b: to255(final[i * 3 + 2]), x: app.liveX[i] };
      colors[i] = c;
      const p = app.lastSent?.[i];
      if (full || !p || p.r !== c.r || p.g !== c.g || p.b !== c.b) changed.push(i);
    }
    if (full) app.resyncAt = now + 2000;
    if (changed.length) await app.kb.writeSlot(LIVE_SLOT, colors, full ? null : changed);
    app.lastSent = colors;
  } catch (e) {
    console.error(e);
    if (app.live) { toast('Canlı efekt durdu: ' + e.message, true); stopLive(false); }
  } finally { app.sending = false; }
}

// "Şu an oynuyor" satırı: hangi efekt klavyede, kaç kare/sn
function renderNowPlaying() {
  const box = $('#nowPlaying'), text = $('#nowText');
  const on = svc.playing || app.live;
  box.dataset.on = String(on && (svc.playing ? svc.connected : true));
  text.replaceChildren();
  if (svc.paused) {
    // Hive açıldığında servis kendini duraklatır; kapatınca buradan sürdürülür
    text.append('Hive açık olduğu için duraklatıldı');
    const resumeBtn = Object.assign(document.createElement('button'), { className: 'btn', textContent: 'Devam et' });
    resumeBtn.style.marginLeft = 'auto';
    resumeBtn.addEventListener('click', () => guard(async () => { await svcCall('resume', {}); await svcPoll(); renderNowPlaying(); }));
    text.append(resumeBtn);
    return;
  }
  if (on) {
    const fx = VISIBLE_EFFECTS.find((f) => f.id === (svc.playing ? svc.fxId : app.fx.id)) || app.fx;
    const waiting = svc.playing && !svc.connected;
    text.append(waiting ? 'Klavye bekleniyor: ' : 'Klavyede oynuyor: ', Object.assign(document.createElement('b'), { textContent: fx.name }));
    const fps = svc.playing ? svc.fps : Math.round(engine.fpsMeasured);
    if (!waiting && fps) text.append(Object.assign(document.createElement('small'), { textContent: `${fps} kare/sn` }));
  } else {
    text.textContent = app.kb || svc.present ? 'Bir efekte tıkla; klavyede hemen oynar.' : 'Klavye bağlı değil. Önizleme çalışıyor.';
  }
}
// Duraklatılmışken satırı her 500 ms'de yeniden kurmak "Devam et" düğmesini tıklanamaz yapar;
// yalnızca durum değişince yeniden çiz.
let nowKey = '';
setInterval(() => {
  const k = `${svc.paused}|${svc.playing}|${svc.connected}|${svc.fxId}|${svc.fps}|${app.live}|${Math.round(engine.fpsMeasured)}`;
  if (k !== nowKey) { nowKey = k; renderNowPlaying(); }
}, 500);

// Efekt kartına tıklamak = o efekti klavyede oynatmak
async function playEffect(fx) {
  selectEffect(fx);
  if (svc.ok) {
    if (app.live) await stopLive(false);
    if (await otherTabLive()) throw new Error('Başka bir sekmede canlı efekt oynuyor. Önce o sekmeyi kapat.');
    clearTimeout(svcT);
    await svcCall('play', svcConfig());
    await svcPoll();
  } else if (app.kb && !app.live) {
    await startLive(); // servis yoksa bu sekme oynatır (sekme açık kaldıkça)
  }
  renderNowPlaying();
}

// ------------------------------------------------------------ efekt listesi
const fxList = $('#fxList');
const minis = [];
for (const fx of VISIBLE_EFFECTS) {
  const b = document.createElement('button');
  b.className = 'fx'; b.setAttribute('role', 'option'); b.dataset.id = fx.id;
  const cv = document.createElement('canvas'); cv.width = 224; cv.height = 72;
  const label = document.createElement('b'); label.textContent = fx.name;
  b.append(cv, label);
  b.addEventListener('click', () => guard(() => playEffect(fx)));
  fxList.append(b);
  const st = {}; fx.init?.(st);
  minis.push({ fx, cv, ctx: cv.getContext('2d'), st, out: new Float32Array(KEY_COUNT * 3) });
}
let miniT = 0;
function drawMinis(ts) {
  requestAnimationFrame(drawMinis);
  if (app.tab !== 'live' || ts - miniT < 66) return;
  const dt = (ts - (miniT || ts)) / 1000; miniT = ts;
  const t = ts / 1000;
  for (const m of minis.concat(favMinis)) {
    const p = m.params ?? paramsFor(m.fx); // favoriler kendi kayıtlı ayarlarıyla oynar
    // küçük önizlemede basışa tepki veren efektler için örnek basışlar
    const presses = (m.fx.needsKeys || m.fx.id === 'reactive') && Math.random() < 0.08 ? [KEYS[(Math.random() * KEY_COUNT) | 0]] : [];
    m.fx.frame({ t, dt, p, out: m.out, s: m.st, presses, audio: null, screen: null });
    const { ctx, cv } = m;
    ctx.fillStyle = '#0b0c0f'; ctx.fillRect(0, 0, cv.width, cv.height);
    const sx = cv.width / WIDTH_U, sy = cv.height / HEIGHT_U;
    for (const k of KEYS) {
      const o = k.i * 3;
      ctx.fillStyle = `rgb(${to255(m.out[o])},${to255(m.out[o + 1])},${to255(m.out[o + 2])})`;
      ctx.fillRect(k.x * sx + 0.5, k.y * sy + 0.5, k.w * sx - 1, sy - 1);
    }
  }
}
requestAnimationFrame(drawMinis);

// ------------------------------------------------------------ favoriler
// Bir efekt, o anki ayarlarıyla (palet, hız, renkler…) kaydedilir; kartına tıklamak onu aynen oynatır.
// Bu tarayıcıda saklanır (efekt ayarları gibi). Liste boşken bölüm hiç görünmez.
const FAV_MAX = 12;
store.favs = Array.isArray(store.favs) ? store.favs.filter((f) => VISIBLE_EFFECTS.some((x) => x.id === f.fxId)) : [];
const favMinis = [];
const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function favName(fx, p) {
  const pal = fx.params.find((q) => q.options === PALETTE_OPTS);
  const base = pal ? `${fx.name} · ${PALETTE_OPTS.find((o) => o[0] === p[pal.key])?.[1] ?? ''}` : fx.name;
  let name = base;
  for (let n = 2; store.favs.some((f) => f.name === name); n++) name = `${base} ${n}`;
  return name;
}
function addFavorite(fx) {
  const params = { ...paramsFor(fx) };
  if (store.favs.some((f) => f.fxId === fx.id && sameParams(f.params, params))) return toast('Bu ayar zaten favorilerde');
  if (store.favs.length >= FAV_MAX) return toast(`En çok ${FAV_MAX} favori olabilir; önce birini sil`, true);
  const fav = { id: Date.now().toString(36), fxId: fx.id, name: favName(fx, params), params };
  store.favs.push(fav); saveStore(); renderFavs();
  toast(`Favorilere eklendi: ${fav.name}`);
}
function removeFavorite(id) {
  store.favs = store.favs.filter((f) => f.id !== id); saveStore(); renderFavs();
}
async function playFavorite(fav) {
  const fx = VISIBLE_EFFECTS.find((f) => f.id === fav.fxId);
  if (!fx) return;
  store.params[fx.id] = cleanParams(fx, fav.params); merged.add(fx.id); saveStore();
  await playEffect(fx);
}
function renderFavs() {
  const list = $('#favList');
  list.replaceChildren(); favMinis.length = 0;
  $('#favBox').hidden = !store.favs.length;
  for (const fav of store.favs) {
    const fx = VISIBLE_EFFECTS.find((f) => f.id === fav.fxId);
    const wrap = document.createElement('div'); wrap.className = 'fav';
    const b = document.createElement('button');
    b.className = 'fx'; b.type = 'button'; b.title = fav.name;
    const cv = document.createElement('canvas'); cv.width = 224; cv.height = 72;
    b.append(cv, Object.assign(document.createElement('b'), { textContent: fav.name }));
    b.addEventListener('click', () => guard(() => playFavorite(fav)));
    const del = Object.assign(document.createElement('button'), { className: 'fav-del', type: 'button', textContent: '×', title: 'Favorilerden çıkar' });
    del.setAttribute('aria-label', `${fav.name} favorisini sil`);
    del.addEventListener('click', () => removeFavorite(fav.id));
    wrap.append(b, del);
    list.append(wrap);
    const st = {}; fx.init?.(st);
    favMinis.push({ fx, params: cleanParams(fx, fav.params), cv, ctx: cv.getContext('2d'), st, out: new Float32Array(KEY_COUNT * 3) });
  }
}
renderFavs();

function selectEffect(fx) {
  app.fx = fx; store.fxId = fx.id; saveStore();
  engine.setEffect(fx, paramsFor(fx));
  $$('.fx', fxList).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === fx.id)));
  $('#fxTitle').textContent = fx.name;
  $('#fxHint').textContent = fx.hint;
  renderParams(fx);
  setLiveBtn();
  svcPush();
}

function paletteStrip(id, name) {
  const b = document.createElement('button');
  b.className = 'strip'; b.type = 'button'; b.dataset.pal = id;
  const bar = document.createElement('i'); bar.style.background = paletteCss(id);
  b.append(bar, Object.assign(document.createElement('span'), { textContent: name }));
  return b;
}

function renderParams(fx) {
  closeColorPicker();
  const box = $('#fxParams'); box.innerHTML = '';
  const p = paramsFor(fx);
  for (const q of fx.params) {
    const lab = document.createElement('label');
    lab.className = 'field' + (q.type === 'toggle' ? ' check' : '');
    let input;
    if (q.type === 'range') {
      input = Object.assign(document.createElement('input'), { type: 'range', min: q.min, max: q.max, step: q.step, value: p[q.key] });
      const out = document.createElement('output');
      const fmt = () => (out.textContent = (+input.value).toFixed(q.step < 1 ? (q.step < 0.1 ? 2 : 1) : 0) + (q.unit || ''));
      fmt();
      input.addEventListener('input', () => { p[q.key] = +input.value; fmt(); saveStore(); });
      lab.append(Object.assign(document.createElement('span'), { textContent: q.label }), input, out);
    } else if (q.type === 'color') {
      // 'input' olayı #fxParams'taki dinleyiciye ulaşır: oynarken renk servise de gider
      const ctl = colorControl(p[q.key], (hex) => { p[q.key] = hex; saveStore(); ctl.el.dispatchEvent(new Event('input', { bubbles: true })); });
      lab.append(Object.assign(document.createElement('span'), { textContent: q.label }), ctl.el);
    } else if (q.type === 'select' && q.options === PALETTE_OPTS) {
      // Palet: isim listesi yerine renk şeritleri
      const wrap = document.createElement('div'); wrap.className = 'pal-field';
      const strips = document.createElement('div'); strips.className = 'strips';
      for (const [v, t] of q.options) {
        const s = paletteStrip(v, t);
        s.setAttribute('aria-pressed', String(v === p[q.key]));
        s.addEventListener('click', () => {
          p[q.key] = v; saveStore();
          $$('.strip', strips).forEach((x) => x.setAttribute('aria-pressed', String(x === s)));
        });
        strips.append(s);
      }
      wrap.append(Object.assign(document.createElement('span'), { textContent: q.label }), strips);
      box.append(wrap);
      continue;
    } else if (q.type === 'select') {
      input = document.createElement('select');
      for (const [v, t] of q.options) input.append(new Option(t, v, false, v === p[q.key]));
      input.addEventListener('change', () => { p[q.key] = input.value; saveStore(); });
      lab.append(Object.assign(document.createElement('span'), { textContent: q.label }), input);
    } else if (q.type === 'toggle') {
      input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!p[q.key] });
      input.addEventListener('change', () => { p[q.key] = input.checked; saveStore(); });
      lab.append(input, Object.assign(document.createElement('span'), { textContent: q.label }));
    }
    box.append(lab);
  }
  const reset = Object.assign(document.createElement('button'), { className: 'btn', textContent: 'Varsayılanlara dön' });
  reset.addEventListener('click', () => { store.params[fx.id] = defaultsFor(fx); merged.add(fx.id); saveStore(); engine.setEffect(fx, paramsFor(fx)); renderParams(fx); });
  const fav = Object.assign(document.createElement('button'), { className: 'btn', type: 'button', textContent: '★ Favorilere ekle' });
  fav.addEventListener('click', () => addFavorite(fx));
  const row = document.createElement('div'); row.className = 'row param-actions';
  row.append(fav, reset);
  box.append(row);
}

// genel ayarlar
$('#master').value = store.master ?? 100;
$('#masterOut').textContent = $('#master').value + '%';
$('#master').addEventListener('input', (e) => { store.master = +e.target.value; engine.master = store.master / 100; $('#masterOut').textContent = store.master + '%'; saveStore(); svcPush(); });
$('#fps').value = String(store.fps ?? 30);
$('#fps').addEventListener('change', (e) => { store.fps = +e.target.value; engine.setFps(store.fps); saveStore(); svcPush(); });
$('#gamma').checked = engine.gamma;
$('#gamma').addEventListener('change', (e) => { store.gamma = engine.gamma = e.target.checked; saveStore(); svcPush(); });

// tuş basışları (sayfa odaktayken)
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.target.closest?.('input, select, textarea')) return;
  const k = KEY_BY_CODE.get(e.code);
  if (k) engine.press(k);
});

// ------------------------------------------------------------ canlı mod
// ------------------------------------------------------------ arka plan servisi
// Sayfa service/service.mjs tarafından sunuluyorsa canlı efekti o oynatır: aynı efekt kodu
// Node'da çalışır ve tarayıcı kapalıyken de sürer. Servis yoksa (ör. serve.py) eski yol:
// kareleri bu sekme gönderir.
const svc = { ok: false, playing: false, connected: false, present: false, fps: 0, fxId: null, cfg: null, error: null, synced: false, quiet: false, mood: null, moodSynced: false };
async function svcCall(path, body) {
  const r = await fetch('/api/' + path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { cache: 'no-store' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.service && path === 'status') throw new Error(data.error || 'Arka plan servisi yanıt vermedi');
  return data;
}
const svcConfig = () => ({ fxId: app.fx.id, params: paramsFor(app.fx), master: engine.master, gamma: engine.gamma, fps: engine.fps });
async function svcPoll() {
  const before = `${svc.ok}|${svc.playing}|${svc.connected}`;
  try { Object.assign(svc, await svcCall('status'), { ok: true }); }
  catch { Object.assign(svc, { ok: false, playing: false, connected: false, fps: 0 }); }
  if (before !== `${svc.ok}|${svc.playing}|${svc.connected}`) { setLiveBtn(); setStageNote(); }
  if (svc.ok) syncMoodFromService();
  renderConn();
  // Servis ilk kez görüldüğünde (ya da yeniden açıldığında) ortam ışığı ayarlarını ondan oku
  if (svc.ok && !svc.moodLoaded) {
    svc.moodLoaded = true;
    loadMood().catch(() => { svc.moodLoaded = false; }); // klavye henüz yoksa sonraki yoklamada tekrar dene
  }
  if (!svc.ok) svc.moodLoaded = false;
  // Sayfa açıldığında servis zaten oynatıyorsa arayüz onun efektini ve ayarlarını gösterir.
  // Tersi yapılmaz: yeni açılan bir sekme kendi eski ayarlarını servise dayatmamalı.
  if (svc.ok && !svc.synced) {
    svc.synced = true;
    svc.seenRev = svc.rev;
    const fx = svc.playing && svc.cfg && VISIBLE_EFFECTS.find((f) => f.id === svc.cfg.fxId);
    if (fx) {
      store.master = Math.round(svc.cfg.master * 100); engine.master = svc.cfg.master;
      store.gamma = engine.gamma = svc.cfg.gamma;
      store.fps = svc.cfg.fps; engine.setFps(svc.cfg.fps);
      $('#master').value = store.master; $('#masterOut').textContent = store.master + '%';
      $('#gamma').checked = engine.gamma; $('#fps').value = String(store.fps);
      adoptServiceEffect(fx);
    }
  }
  // Kısayolla (Ctrl+Alt+ok) değişen efekt / parlaklık ekrana da yansısın.
  // Arayüzün kendi gönderdikleri (source 'ui') yeniden uygulanmaz: kaydırıcıyı sürüklerken ekran sıçramasın.
  if (svc.ok && svc.rev !== svc.seenRev) {
    svc.seenRev = svc.rev;
    const fx = svc.revSource === 'hotkey' && svc.playing && svc.cfg && VISIBLE_EFFECTS.find((f) => f.id === svc.cfg.fxId);
    if (fx) adoptServiceEffect(fx);
  }
}
// Servisin oynattığı efekti ve ayarlarını arayüze al (servise geri gönderilmez)
function adoptServiceEffect(fx) {
  store.params[fx.id] = { ...svc.cfg.params }; merged.delete(fx.id);
  saveStore();
  svc.quiet = true;
  try { selectEffect(fx); } finally { svc.quiet = false; }
}
// Oynarken yapılan her ayar değişikliği servise iletilir
let svcT;
function svcPush() {
  if (!svc.playing || svc.quiet) return;
  clearTimeout(svcT);
  svcT = setTimeout(() => guard(() => svcCall('play', svcConfig())), 120);
}
// Klavyeye başka bir şey yazmadan önce servisin akışını durdur (yoksa üzerine yazar)
async function svcRelease() {
  if (!svc.playing) return;
  await svcCall('stop');
  await svcPoll();
}
setInterval(svcPoll, 2000);
const firstPoll = svcPoll(); // WebHID'e bağlanmadan önce servisin varlığına bakılır

// Canlı efekt aynı anda tek sekmede oynayabilir: iki sekme aynı slota yazarsa
// birbirinin ışığını bozar. Web Locks ile sekmeler arası kilit tutulur.
const LIVE_LOCK = 'real67-live';
const STASH = 'real67-live-saved';
async function otherTabLive() {
  if (!navigator.locks?.query || app.releaseLock) return false;
  const q = await navigator.locks.query();
  return q.held.some((l) => l.name === LIVE_LOCK);
}
function holdLiveLock() {
  if (!navigator.locks) return;
  navigator.locks.request(LIVE_LOCK, () => new Promise((res) => (app.releaseLock = res)));
}
function dropLiveLock() { app.releaseLock?.(); app.releaseLock = null; }
function stashLive(s) {
  try { localStorage.setItem(STASH, JSON.stringify({ mode: s.mode, slot: s.slot, colors: s.colors, params: [...s.params.raw] })); } catch { /* gizli pencere */ }
}
function clearStash() { try { localStorage.removeItem(STASH); } catch { /* */ } }
// Sekme canlı efekt oynarken kapatıldıysa klavye son karede donuk kalır; bir sonraki açılışta geri al.
async function recoverLive(kb) {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STASH) || 'null'); } catch { /* */ }
  if (!s || (await otherTabLive())) return;
  await kb.writeSlot(LIVE_SLOT, s.colors);
  await kb.setKeyParams(decodeParams(s.params));
  await kb.setSlot(s.slot);
  await kb.setKeyMode(s.mode);
  clearStash();
  toast('Yarıda kalan canlı efekt temizlendi; klavye önceki ışığına döndü');
}

async function startLive() {
  const kb = app.kb; if (!kb || app.liveBusy) return;
  if (await otherTabLive()) throw new Error('Başka bir sekmede canlı efekt oynuyor. Önce o sekmeyi kapat ya da orada durdur.');
  app.liveBusy = true; setLiveBtn();
  try {
    const mode = await kb.getKeyMode();
    const slot = await kb.getSlot();
    const colors = await kb.readSlot(LIVE_SLOT);
    const params = await kb.getKeyParams(1);
    app.liveSaved = { mode, slot, colors, params };
    stashLive(app.liveSaved);
    holdLiveLock();
    app.liveX = colors.map((c) => c.x);
    await kb.setBacklight(true);
    await kb.setSlot(LIVE_SLOT);
    await kb.setKeyMode(1);
    await kb.setKeyParams({ ...params, brightness: keyBrightCap(1) });
    app.lastSent = null;
    app.live = true;
    $('#stageNote').textContent = 'Canlı efekt klavyede oynuyor. Bu sekme açık kaldığı sürece devam eder.';
  } finally { app.liveBusy = false; setLiveBtn(); }
}

async function stopLive(restore) {
  if (!app.live) return;
  app.live = false; app.liveBusy = true; setLiveBtn();
  try {
    while (app.sending) await new Promise((r) => setTimeout(r, 10));
    const s = app.liveSaved, kb = app.kb;
    if (restore && s && kb) {
      await kb.writeSlot(LIVE_SLOT, s.colors);
      await kb.setKeyParams(s.params);
      await kb.setSlot(s.slot);
      await kb.setKeyMode(s.mode);
      clearStash();
      toast('Klavye önceki ışık ayarına döndü');
    }
  } finally {
    dropLiveLock();
    app.liveBusy = false; app.liveSaved = null; setLiveBtn();
    setStageNote();
  }
}
// Oynatma durumu değişince ilgili yerleri yenile (eski adı korunuyor; artık düğme yok)
function setLiveBtn() {
  renderNowPlaying();
  renderMoodAuto(); // "tuşları takip et" açıklaması canlı efektin durumuna bağlı
}
function setStageNote() {
  if (svc.playing) {
    $('#stageNote').textContent = svc.connected
      ? 'Klavyede oynuyor. Tarayıcıyı kapatabilirsin; akış arka planda sürer.'
      : 'Klavye takılınca akış kendiliğinden başlar.';
    return;
  }
  $('#stageNote').textContent = app.live
    ? 'Klavyede oynuyor. Bu sekme açık kaldıkça sürer.'
    : app.kb || svc.present
      ? 'Bir efekte tıkla; klavyede hemen oynar.'
      : 'Klavye bağlı değil. Önizleme çalışıyor; bağlandığında aynı ışık klavyeye gider.';
}

// ------------------------------------------------------------ sekmeler
$$('.tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
function setTab(tab) {
  app.tab = tab;
  $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $$('.panel').forEach((p) => (p.hidden = p.dataset.panel !== tab));
  $('#case').classList.toggle('paint-mode', tab === 'paint');
  if (tab === 'paint') { if (app.live) toast('Canlı efekt çalışırken boyama önizlemesi gösteriliyor; klavyede efekt devam ediyor.'); openSlot(app.paint.slot); }
  if (tab === 'modes') guard(loadModes);
  $('.stage').hidden = tab === 'laptop';
  if (tab === 'laptop') guard(loadLaptop);
  if (tab === 'live') guard(loadMood); // ortam ışığı artık canlı efektler ekranında
}

// ------------------------------------------------------------ tuş boyama
const SLOT_NAMES = ['Özel 1', 'Özel 2', 'Özel 3', 'Özel 4', 'Özel 5', 'Özel 6', 'Özel 7', 'Dinamik'];
const slotChips = $('#slotChips');
SLOT_NAMES.forEach((n, i) => {
  const b = Object.assign(document.createElement('button'), { className: 'chip', textContent: n });
  b.dataset.slot = i;
  b.addEventListener('click', () => guard(() => openSlot(i)));
  slotChips.append(b);
});
const SWATCHES = ['#ffffff', '#ff1f1f', '#ff7a00', '#ffd400', '#3dff4e', '#00e1ff', '#2b5bff', '#8a2bff', '#ff3df2', '#ff5e8a', '#000000'];
for (const c of SWATCHES) {
  const b = document.createElement('button'); b.style.background = c; b.title = c; b.setAttribute('aria-label', 'Renk ' + c);
  b.addEventListener('click', () => { app.paint.color = c; $('#paintColor').value = c; });
  $('#swatches').append(b);
}
$('#paintColor').addEventListener('input', (e) => (app.paint.color = e.target.value));
$$('#toolChips .chip').forEach((b) => b.addEventListener('click', () => {
  app.paint.tool = b.dataset.tool;
  $$('#toolChips .chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
}));

async function openSlot(i) {
  app.paint.slot = i;
  $$('.chip', slotChips).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.slot === i)));
  $('#slotHint').textContent = i === DYNAMIC_SLOT
    ? 'Dinamik modların (Dalga, Halka, Tepki…) “rastgele renk” kapalıyken kullandığı renkler.'
    : i === LIVE_SLOT ? 'Canlı efektler bu slotu kullanır; efekt çalışırken burada yaptığın değişiklik üzerine yazılır.'
    : 'Statik modda gösterilen tuş renkleri.';
  $('#activateSlotBtn').disabled = !app.kb || i === DYNAMIC_SLOT;
  $('#readSlotBtn').disabled = !app.kb;
  if (!app.paint.slots[i]) app.paint.slots[i] = app.kb ? await app.kb.readSlot(i) : blank();
  if (app.tab === 'paint') showRGB(app.paint.slots[i]);
}
$('#readSlotBtn').addEventListener('click', () => guard(async () => {
  app.paint.slots[app.paint.slot] = await app.kb.readSlot(app.paint.slot);
  showRGB(app.paint.slots[app.paint.slot]); toast('Renkler klavyeden okundu');
}));
$('#activateSlotBtn').addEventListener('click', () => guard(async () => {
  await svcRelease();
  if (app.live) await stopLive(true);
  await app.kb.setBacklight(true);
  await app.kb.setSlot(app.paint.slot); await app.kb.setKeyMode(1);
  toast(`${SLOT_NAMES[app.paint.slot]} statik modda etkin`);
}));

function snapshot() {
  const cur = app.paint.slots[app.paint.slot];
  app.paint.undo.push({ slot: app.paint.slot, colors: cur.map((c) => ({ ...c })) });
  if (app.paint.undo.length > 40) app.paint.undo.shift();
}
function applyKey(i) {
  const cols = app.paint.slots[app.paint.slot];
  if (!cols) return;
  if (app.paint.tool === 'pick') {
    app.paint.color = hex(cols[i]); $('#paintColor').value = app.paint.color;
    app.paint.tool = 'brush'; $$('#toolChips .chip').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.tool === 'brush')));
    return;
  }
  const c = fromHex(app.paint.tool === 'erase' ? '#000000' : app.paint.color, cols[i].x);
  if (cols[i].r === c.r && cols[i].g === c.g && cols[i].b === c.b) return;
  cols[i] = c;
  app.paint.dirty.add(i);
  keyEls[i].style.setProperty('--c', `${c.r}, ${c.g}, ${c.b}`);
  scheduleWrite();
}
function scheduleWrite(all = false) {
  if (all) KEYS.forEach((k) => app.paint.dirty.add(k.i));
  clearTimeout(app.paint.timer);
  app.paint.timer = setTimeout(() => guard(async () => {
    if (!app.kb || !app.paint.dirty.size) { app.paint.dirty.clear(); return; }
    const idx = [...app.paint.dirty]; app.paint.dirty.clear();
    await app.kb.writeSlot(app.paint.slot, app.paint.slots[app.paint.slot], idx);
  }), 60);
}
board.addEventListener('pointerdown', (e) => {
  if (app.tab !== 'paint') return;
  const el = e.target.closest('.key'); if (!el) return;
  e.preventDefault();
  if (app.paint.tool !== 'pick') snapshot();
  app.paint.down = true; applyKey(+el.dataset.i);
});
board.addEventListener('pointermove', (e) => {
  if (!app.paint.down || app.tab !== 'paint') return;
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.key');
  if (el) applyKey(+el.dataset.i);
});
window.addEventListener('pointerup', () => (app.paint.down = false));

function applyAll(fn) {
  const cols = app.paint.slots[app.paint.slot]; if (!cols) return;
  snapshot();
  for (const k of KEYS) { const [r, g, b] = fn(k); cols[k.i] = { r, g, b, x: cols[k.i].x }; }
  showRGB(cols); scheduleWrite(true);
}
$('#fillBtn').addEventListener('click', () => { const c = fromHex(app.paint.color); applyAll(() => [c.r, c.g, c.b]); });
$('#gradBtn').addEventListener('click', () => {
  const a = fromHex(app.paint.color), b = fromHex($('#gradEnd').value);
  applyAll((k) => { const t = k.cx / WIDTH_U; return [a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t].map(Math.round); });
});
$('#rainbowBtn').addEventListener('click', () => applyAll((k) => hsv(k.cx / WIDTH_U, 1, 1).map(to255)));
$('#undoBtn').addEventListener('click', () => {
  const u = app.paint.undo.pop(); if (!u) return toast('Geri alınacak bir şey yok');
  app.paint.slots[u.slot] = u.colors;
  if (u.slot !== app.paint.slot) openSlot(u.slot);
  showRGB(u.colors); scheduleWrite(true);
});
$('#exportBtn').addEventListener('click', () => {
  const cols = app.paint.slots[app.paint.slot]; if (!cols) return;
  const data = { device: 'MelGeek Real67', slot: SLOT_NAMES[app.paint.slot], keys: cols.map((c, i) => ({ key: KEYS[i].label || 'Space', color: hex(c) })) };
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: `real67-${SLOT_NAMES[app.paint.slot].replace(' ', '')}.json` });
  a.click(); URL.revokeObjectURL(a.href);
});
$('#importFile').addEventListener('change', (e) => guard(async () => {
  const f = e.target.files[0]; if (!f) return;
  const data = JSON.parse(await f.text());
  if (!Array.isArray(data.keys) || data.keys.length !== KEY_COUNT) throw new Error('Dosya 67 tuşluk bir Real67 renk düzeni değil');
  const cols = app.paint.slots[app.paint.slot];
  snapshot();
  data.keys.forEach((k, i) => (cols[i] = fromHex(k.color, cols[i].x)));
  showRGB(cols); scheduleWrite(true); e.target.value = '';
  toast('Renk düzeni içe aktarıldı');
}));

// ------------------------------------------------------------ klavye modları
const kmChips = $('#keyModeChips');
for (const m of KEY_MODES) {
  if (SHELVED_KEY_MODES.has(m.id)) continue;
  const b = Object.assign(document.createElement('button'), { className: 'chip', textContent: m.name });
  b.dataset.mode = m.id;
  b.addEventListener('click', () => { save.mode = m.id; save.touched = true; renderSave(); });
  kmChips.append(b);
}

// "Klavyeye kaydet" tarifi: yerleşik hareket modu + renk paleti
const save = { mode: 1, pal: 'keep', dir: 'x', color: '#ff3df2', slot: 0, touched: false, frame: null, ...(store.save || {}) };
if (SHELVED_KEY_MODES.has(save.mode)) save.mode = 3;
const SAVE_PALS = [['keep', 'Klavyedeki renkler'], ...PALETTE_OPTS, ['solid', 'Tek renk'], ['frame', 'Canlı efektten kare']];
const MOTION_HINTS = {
  0: 'Tuş ışıkları kapanır.',
  1: 'Renkler sabit durur.',
  2: 'Klavyenin kendi gökkuşağı renkleri yavaşça birbirine geçer. Bu harekette renk seçilemez: firmware yalnızca kendi gökkuşağını oynatıyor.',
  3: 'Tuşlar seçtiğin renklerde yavaşça yanıp söner.',
  4: 'Klavyenin kendi gökkuşağı dalgası akar. Bu harekette renk seçilemez: firmware yalnızca kendi gökkuşağını oynatıyor. Paletini göstermek için Nefes, Rastgele ya da Statik seç.',
  5: 'Bastığın tuştan halka yayılır. Halka birkaç tuş ötede söner; bu klavyenin sınırı, hız değiştirmez.',
  6: 'Bastığın tuş yanar.',
  7: 'Tuşlar rastgele yanıp söner.',
};
const palChips = $('#palChips');
const isPalette = new Set(PALETTE_OPTS.map((o) => o[0]));
for (const [id, name] of SAVE_PALS) {
  let b;
  if (isPalette.has(id)) { b = paletteStrip(id, name); $('#palStrips').append(b); }
  else { b = Object.assign(document.createElement('button'), { className: 'chip', textContent: name }); b.dataset.pal = id; palChips.append(b); }
  b.addEventListener('click', () => {
    save.pal = id;
    if (id === 'frame') save.frame = Float32Array.from(engine.final);
    renderSave();
  });
}
for (let i = 0; i < 6; i++) $('#saveSlot').append(new Option(`Özel ${i + 1}`, i));
$('#palColor').value = save.color;
$('#palDir').value = save.dir;
$('#palColor').addEventListener('input', (e) => { save.color = e.target.value; renderSave(); });
$('#palDir').addEventListener('change', (e) => { save.dir = e.target.value; renderSave(); });
$('#saveSlot').addEventListener('change', (e) => { save.slot = +e.target.value; renderSave(); });
$('#saveKbBtn').addEventListener('click', () => guard(applySave));

// Geçişli (2) ve Dalga (4) firmware'in kendi gökkuşağını oynatır, tuş renklerini yok sayar
const BUILTIN_RAINBOW_MODES = new Set([2, 4]);
const takesColors = (m) => m !== 0 && !BUILTIN_RAINBOW_MODES.has(m);
const saveTarget = () => (save.mode === 1 ? save.slot : DYNAMIC_SLOT);
function palettePos(k) {
  const u = k.cx / WIDTH_U, v = k.cy / HEIGHT_U;
  if (save.dir === 'y') return v;
  if (save.dir === 'd') return (u + v) / 2;
  if (save.dir === 'c') return Math.hypot(u - 0.5, (v - 0.5) * 0.6) / 0.58;
  return u;
}
// Tarifin renkleri (0..1, gama uygulanmamış); "klavyedeki renkler" için null
function recipeRGB() {
  if (save.pal === 'keep') return null;
  if (save.pal === 'frame') {
    const f = save.frame || engine.final;
    return KEYS.map((k) => [f[k.i * 3], f[k.i * 3 + 1], f[k.i * 3 + 2]]);
  }
  if (save.pal === 'solid') { const c = hexToRgb(save.color); return KEYS.map(() => c); }
  return KEYS.map((k) => pal(save.pal, Math.min(1, palettePos(k)) * 0.85));
}
async function previewSave() {
  if (app.tab !== 'modes') return;
  if (save.mode === 0) return showRGB(new Float32Array(KEY_COUNT * 3));
  if (!takesColors(save.mode)) return showRGB(Float32Array.from(KEYS.flatMap((k) => hsv((k.cx / WIDTH_U) * 0.85, 1, 1))));
  const rgb = recipeRGB();
  if (rgb) return showRGB(Float32Array.from(rgb.flat()));
  const slot = saveTarget();
  if (!app.paint.slots[slot] && app.kb) app.paint.slots[slot] = await app.kb.readSlot(slot);
  if (app.tab === 'modes') showRGB(app.paint.slots[slot] || blank());
}
function renderSave() {
  store.save = { mode: save.mode, pal: save.pal === 'frame' ? 'keep' : save.pal, dir: save.dir, color: save.color, slot: save.slot };
  saveStore();
  $$('.chip', kmChips).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.mode === save.mode)));
  $$('[data-pal]', $('#palBox')).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pal === save.pal)));
  $('#saveSlot').value = String(save.slot);
  $('#palBox').hidden = !takesColors(save.mode);
  $('#palColorField').hidden = save.pal !== 'solid';
  $('#palDirField').hidden = ['keep', 'solid', 'frame'].includes(save.pal);
  $('#saveSlotField').hidden = save.mode !== 1;
  $('#motionHint').textContent = MOTION_HINTS[save.mode];
  $('#saveKbNote').textContent = app.kb ? 'Önizleme yukarıda. Kaydedene kadar klavye değişmez.' : 'Kaydetmek için önce klavyeyi bağla.';
  guard(previewSave);
}
// Klavyenin belleğine yaz: yerleşik mod + (isteğe bağlı) tuş renkleri.
// rgb: 0..1 renk dizisi ya da null (klavyedeki renkler kalsın); random: modun kendi rastgele rengi
async function writeOnboard({ mode: m, rgb = null, slot = DYNAMIC_SLOT, random = false, gamma = engine.gamma, speed = null }) {
  const kb = app.kb;
  if (!kb) throw new Error('Önce klavyeyi bağla');
  if (await otherTabLive()) throw new Error('Başka bir sekmede canlı efekt oynuyor. Önce o sekmeyi kapat ya da orada durdur.');
  await svcRelease();
  if (app.live) await stopLive(true);
  if (m === 0) {
    await kb.setKeyMode(0);
  } else {
    if (rgb) {
      const g = gamma ? 2.2 : 1;
      const old = app.paint.slots[slot];
      const cols = rgb.map((c, i) => ({ r: to255(Math.pow(c[0], g)), g: to255(Math.pow(c[1], g)), b: to255(Math.pow(c[2], g)), x: old?.[i]?.x ?? 0x33 }));
      await kb.writeSlot(slot, cols);
      app.paint.slots[slot] = cols;
    }
    await kb.setBacklight(true);
    await kb.setSlot(slot);
    await kb.setKeyMode(m);
    // Firmware her tuşa yazım anındaki parlaklığı damgalıyor; statik modda parametreyi
    // yeniden göndermek tuşları modun kendi parlaklığına geri çeker.
    if (m === 1) await kb.setKeyParams(await kb.getKeyParams(1));
    if (m >= 2) {
      const p = await kb.getKeyParams(m);
      const next = { ...p };
      if (rgb || random) next.random = random;
      const sr = keySpeedRange(m);
      if (speed !== null) next.speed = Math.round(sr.min + speed * (sr.max - sr.min));
      else if (p.speed > sr.max || p.speed < sr.min) next.speed = Math.round((sr.min + sr.max) / 2);
      if (m === 5 || m === 6) next.raw = Uint8Array.from(p.raw, (v, i) => (i === 1 ? v & ~0x04 : v)); // 0x04: durmadan yayılma
      if (next.random !== p.random || next.speed !== p.speed || next.raw !== p.raw) await kb.setKeyParams(next);
    }
    $('#blOn').checked = true;
  }
  app.keyMode = m;
  save.mode = m; save.touched = true;
  await loadKeyParams();
}

async function applySave() {
  const m = save.mode;
  const motion = KEY_MODES.find((x) => x.id === m).name;
  await writeOnboard({
    mode: m, rgb: takesColors(m) ? recipeRGB() : null, slot: saveTarget(),
    gamma: save.pal !== 'frame' && engine.gamma, // kare zaten gama düzeltmeli
  });
  const palName = !takesColors(m) || save.pal === 'keep' ? '' : ' + ' + SAVE_PALS.find((p) => p[0] === save.pal)[1];
  $('#saveKbNote').textContent = `Klavyede kayıtlı: ${motion}${palName}. Bu sekmeyi kapatabilirsin.`;
  toast(`Klavyeye kaydedildi: ${motion}${palName}`);
}

// Efekt ayarları değişince oynayan efekte anında iletilir
$('#fxParams').addEventListener('input', svcPush);
$('#fxParams').addEventListener('change', svcPush);
$('#fxParams').addEventListener('click', (e) => { if (e.target.closest('.strip, .btn')) svcPush(); });

async function loadModes() {
  const on = !!app.kb;
  for (const id of ['#saveKbBtn', '#blOn', '#kmBright', '#kmSpeed', '#kmRandom']) $(id).disabled = !on;
  if (on) {
    app.keyMode = await app.kb.getKeyMode();
    if (!save.touched && !SHELVED_KEY_MODES.has(app.keyMode)) {
      save.mode = app.keyMode;
      const s = await app.kb.getSlot();
      if (s < 6) save.slot = s;
    }
    await loadKeyParams();
  }
  renderSave();
}
async function loadKeyParams() {
  const m = app.keyMode;
  app.keyParams = m > 0 ? await app.kb.getKeyParams(m) : null;
  const p = app.keyParams;
  $('#modeParamTitle').textContent = `${KEY_MODES.find((x) => x.id === m)?.name ?? 'Mod'} ayarları`;
  for (const id of ['#kmBright', '#kmSpeed', '#kmRandom']) $(id).disabled = !p;
  if (!p) return;
  $('#kmBright').value = Math.round((p.brightness / keyBrightCap(m)) * 100);
  const sr = keySpeedRange(m);
  $('#kmSpeed').value = Math.round(Math.min(1, Math.max(0, (p.speed - sr.min) / (sr.max - sr.min))) * 100);
  $('#kmSpeed').disabled = m === 1;
  $('#kmRandom').checked = p.random;
  $('#kmRandom').disabled = m < 2;
  $('#kmBrightOut').textContent = $('#kmBright').value + '%';
  $('#kmSpeedOut').textContent = m === 1 ? '—' : $('#kmSpeed').value + '%';
}
let kmT;
function pushKeyParams() {
  clearTimeout(kmT);
  kmT = setTimeout(() => guard(async () => {
    const p = app.keyParams; if (!p) return;
    p.brightness = Math.round((+$('#kmBright').value / 100) * keyBrightCap(app.keyMode));
    const sr = keySpeedRange(app.keyMode);
    p.speed = Math.round(sr.min + (+$('#kmSpeed').value / 100) * (sr.max - sr.min));
    p.random = $('#kmRandom').checked;
    await app.kb.setKeyParams(p);
  }), 90);
}
$('#kmBright').addEventListener('input', (e) => { $('#kmBrightOut').textContent = e.target.value + '%'; pushKeyParams(); });
$('#kmSpeed').addEventListener('input', (e) => { $('#kmSpeedOut').textContent = e.target.value + '%'; pushKeyParams(); });
$('#kmRandom').addEventListener('change', pushKeyParams);
$('#blOn').addEventListener('change', (e) => guard(() => app.kb?.setBacklight(e.target.checked)));


// ------------------------------------------------------------ laptop klavyesi (asusctl, servis üzerinden; yalnızca sabit renk)
const LP = { cfg: null, ctl: null };
const LP_COLORS = [['#ff2a3a', 'Kırmızı'], ['#ff7a1a', 'Turuncu'], ['#ffd23f', 'Sarı'], ['#2bff6a', 'Yeşil'], ['#00e1ff', 'Camgöbeği'],
  ['#2a6bff', 'Mavi'], ['#9b4dff', 'Mor'], ['#ff3df2', 'Pembe'], ['#ffffff', 'Beyaz']];
const LP_LEVEL = [['low', 'Düşük'], ['med', 'Orta'], ['high', 'Yüksek']];
async function lpSet(patch) {
  try {
    const r = await svcCall('laptop/set', { effect: 'static', ...patch });
    LP.cfg = r.cfg; lpRender();
  } catch (e) { toast('Laptop ışığı: ' + e.message, true); }
}
function lpRender() {
  const c = LP.cfg;
  $('#lpOn').checked = c.on;
  $$('#lpDots .dot').forEach((d) => d.setAttribute('aria-pressed', String(d.dataset.color === c.color)));
  $$('#lpLevel .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === c.level)));
  LP.ctl?.set(c.color);
  $$('#laptopCard .dot, #laptopCard .chip, #laptopCard .color-btn').forEach((el) => (el.disabled = !c.on));
}
async function loadLaptop() {
  if (!svc.ok || LP.cfg) return;
  const r = await svcCall('laptop/get', {});
  $('#lpHint').textContent = r.available ? '' : 'Bu bilgisayarda laptop klavye ışığı (asusctl) bulunamadı.';
  if (!r.available) return;
  LP.cfg = r.cfg;
  for (const [hex, name] of LP_COLORS) {
    const b = document.createElement('button'); b.className = 'dot'; b.dataset.color = hex;
    b.style.background = hex; b.title = name; b.setAttribute('aria-label', name);
    b.addEventListener('click', () => lpSet({ color: hex }));
    $('#lpDots').append(b);
  }
  for (const [id, name] of LP_LEVEL) {
    const b = Object.assign(document.createElement('button'), { className: 'chip', textContent: name });
    b.dataset.v = id; b.addEventListener('click', () => lpSet({ level: id }));
    $('#lpLevel').append(b);
  }
  let t = null;
  LP.ctl = colorControl(r.cfg.color, (hex) => { clearTimeout(t); t = setTimeout(() => lpSet({ color: hex }), 120); });
  $('#lpColor').append(LP.ctl.el);
  $('#lpOn').addEventListener('change', (e) => lpSet({ on: e.target.checked }));
  lpRender();
}

// ------------------------------------------------------------ ortam ışığı
const mmChips = $('#moodModeChips'), mcChips = $('#moodColorChips');
for (const m of MOOD_MODES) {
  const b = Object.assign(document.createElement('button'), { className: 'chip', textContent: m.name });
  b.dataset.mode = m.id;
  b.addEventListener('click', () => guard(async () => {
    if (svc.ok) await svcCall('mood/set', { mode: m.id }); else await app.kb.setMoodMode(m.id);
    await loadMood();
  }));
  mmChips.append(b);
}
for (const c of MOOD_COLORS) {
  const b = document.createElement('button'); b.className = 'dot'; b.dataset.color = c.id;
  b.style.background = c.hex; b.title = c.name; b.setAttribute('aria-label', c.name);
  b.addEventListener('click', () => guard(async () => {
    if (moodAuto.kind !== 'off') { await setMoodAuto('off'); toast('Elle renk seçtin; otomatik renk değiştirme kapatıldı'); }
    if (svc.ok) await svcCall('mood/set', { color: c.id }); else await app.kb.setMoodColor(c.id);
    await loadMood();
  }));
  mcChips.append(b);
}
// Ortam ışığı servis üzerinden okunur/ayarlanır (tarayıcıda WebHID gerekmez: Firefox, Zen…).
// Servis yoksa ve tarayıcı WebHID destekliyorsa doğrudan klavyeyle konuşulur.
async function loadMood() {
  const on = svc.ok || !!app.kb;
  $$('.mood-card input, .mood-card button').forEach((el) => (el.disabled = !on));
  renderMoodAuto(); // otomatik bölümünü kendi kuralına göre aç/kapat
  if (!on) return;
  let st;
  if (svc.ok) st = await svcCall('mood/get', {});
  else {
    const m = await app.kb.getMood();
    const p = m.mode > 0 ? await app.kb.getMoodParams(m.mode) : null;
    app.moodParams = p;
    st = {
      on: $('#moodOn').checked, mode: m.mode, color: m.color,
      brightness: p ? Math.round((p.brightness / moodBrightCap(m.mode)) * 100) : null,
      speed: p ? Math.round(((p.speed - MOOD_SPEED.min) / (MOOD_SPEED.max - MOOD_SPEED.min)) * 100) : null,
    };
  }
  app.mood = st;
  const { mode, color } = st;
  $('#moodOn').checked = st.on;
  $$('.chip', mmChips).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.mode === mode)));
  $$('[data-color]', mcChips).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.color === color)));
  const hasParams = st.brightness !== null && st.brightness !== undefined;
  $('#mdBright').disabled = $('#mdSpeed').disabled = !hasParams;
  if (!hasParams) return;
  $('#mdBright').value = st.brightness;
  $('#mdSpeed').value = st.speed;
  $('#mdSpeed').disabled = mode === 1;
  $('#mdSpeed').closest('.field').hidden = mode === 1; // Statik harekette hız yok
  $('#mdBrightOut').textContent = $('#mdBright').value + '%';
  $('#mdSpeedOut').textContent = mode === 1 ? '—' : $('#mdSpeed').value + '%';
}
let mdT;
function pushMoodParams() {
  clearTimeout(mdT);
  mdT = setTimeout(() => guard(async () => {
    if (svc.ok) return void (await svcCall('mood/set', { brightness: +$('#mdBright').value, speed: +$('#mdSpeed').value }));
    const p = app.moodParams; if (!p) return;
    p.brightness = Math.round((+$('#mdBright').value / 100) * moodBrightCap(app.mood.mode));
    p.speed = Math.round(MOOD_SPEED.min + (+$('#mdSpeed').value / 100) * (MOOD_SPEED.max - MOOD_SPEED.min));
    await app.kb.setMoodParams(p);
  }), 90);
}
$('#mdBright').addEventListener('input', (e) => { $('#mdBrightOut').textContent = e.target.value + '%'; pushMoodParams(); });
$('#mdSpeed').addEventListener('input', (e) => { $('#mdSpeedOut').textContent = e.target.value + '%'; pushMoodParams(); });
$('#moodOn').addEventListener('change', (e) => guard(() => (svc.ok ? svcCall('mood/set', { on: e.target.checked }) : app.kb?.setMoodOn(e.target.checked))));

// ------------------------------------------------------------ ortam ışığı: otomatik renk değiştirme
// Klavye ortam ışığına yalnızca 8 hazır renk kabul ediyor; değişimi bu sekme zamanlar.
// Zamanlama motorun Worker saatine bağlı, arka plan sekmesinde de kısılmaz.
// Aynı anda tek sekme sürer (Web Locks), yoksa iki sekme birbirinin rengini ezer.
const MOOD_RGB = MOOD_COLORS.map((c) => hexToRgb(c.hex));
const moodAuto = { kind: 'off', colors: [1, 2, 3, 4, 5, 6, 7], interval: 5, shuffle: false, region: 'all', ...(store.moodAuto || {}) };
const ma = { cur: null, last: 0, idx: -1, busy: false, held: false, release: null, otherTab: false };

for (const c of MOOD_COLORS) {
  const b = document.createElement('button'); b.className = 'dot'; b.dataset.cycle = c.id;
  b.style.background = c.hex; b.title = c.name; b.setAttribute('aria-label', c.name);
  b.addEventListener('click', () => {
    const set = new Set(moodAuto.colors);
    if (set.has(c.id)) { if (set.size > 1) set.delete(c.id); else return toast('Döngüde en az bir renk olmalı'); } else set.add(c.id);
    moodAuto.colors = MOOD_COLORS.map((x) => x.id).filter((id) => set.has(id));
    ma.idx = -1; renderMoodAuto(); moodChanged();
  });
  $('#moodCycleColors').append(b);
}
$$('#moodAutoChips .chip').forEach((b) => b.addEventListener('click', () => setMoodAuto(b.dataset.auto)));
$('#moodInterval').value = moodAuto.interval;
$('#moodShuffle').checked = moodAuto.shuffle;
$('#moodRegion').value = moodAuto.region;
$('#moodRegion').addEventListener('change', (e) => { moodAuto.region = e.target.value; ma.cur = null; renderMoodAuto(); moodChanged(); });
$('#moodInterval').addEventListener('input', (e) => { moodAuto.interval = +e.target.value; renderMoodAuto(); moodChanged(); });
$('#moodShuffle').addEventListener('change', (e) => { moodAuto.shuffle = e.target.checked; renderMoodAuto(); moodChanged(); });

// Servis varsa ortam ışığı otomatiğini o yürütür (tarayıcı kapalıyken de); sayfa yalnızca ayarı gönderir.
const moodCfg = () => ({ kind: moodAuto.kind, colors: moodAuto.colors, interval: moodAuto.interval, shuffle: moodAuto.shuffle, region: moodAuto.region });
let moodT;
function moodChanged() {
  if (!svc.ok) return;
  clearTimeout(moodT);
  moodT = setTimeout(() => guard(() => svcCall('mood', moodCfg())), 150);
}
// Servisin ortam ışığı durumunu arayüze yansıt (ilk açılışta ayarları, sonra şu anki rengi)
function syncMoodFromService() {
  const m = svc.mood;
  if (!m) return;
  if (!svc.moodSynced) {
    svc.moodSynced = true;
    Object.assign(moodAuto, { kind: m.kind, colors: m.colors, interval: m.interval, shuffle: m.shuffle, region: m.region });
    $('#moodInterval').value = moodAuto.interval;
    $('#moodShuffle').checked = moodAuto.shuffle;
    $('#moodRegion').value = moodAuto.region;
    dropMoodLock(); // sekmenin kendi zamanlayıcısı devre dışı
  }
  if (m.cur !== ma.cur) {
    ma.cur = m.cur;
    if (m.kind !== 'off' && m.cur !== null) $$('[data-color]', mcChips).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.color === m.cur)));
  }
  renderMoodAuto();
}

function renderMoodAuto() {
  store.moodAuto = { kind: moodAuto.kind, colors: moodAuto.colors, interval: moodAuto.interval, shuffle: moodAuto.shuffle, region: moodAuto.region };
  saveStore();
  $$('#moodAutoChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.auto === moodAuto.kind)));
  $('#moodCycleBox').hidden = moodAuto.kind !== 'cycle';
  $('#moodFollowBox').hidden = moodAuto.kind !== 'follow';
  $$('#moodCycleColors .dot').forEach((b) => {
    b.setAttribute('aria-pressed', String(moodAuto.colors.includes(+b.dataset.cycle)));
    b.classList.toggle('now', moodAuto.kind !== 'off' && +b.dataset.cycle === ma.cur);
  });
  $('#moodIntervalOut').textContent = moodAuto.interval + ' sn';
  // Otomatik renk değişimi servisten yürüyorsa sayfanın klavyeye bağlı olması gerekmez
  const autoUsable = svc.ok || !!app.kb;
  $$('#moodAutoChips button, #moodCycleBox input, #moodCycleBox button, #moodRegion').forEach((el) => (el.disabled = !autoUsable));
  // Kısa tutulur: yalnızca kullanıcının bilmesi gereken bir koşul varsa yazılır
  let hint = '';
  if (moodAuto.kind !== 'off') {
    if (svc.ok) {
      // servis yürütüyor: tarayıcı kapalıyken de çalışır, ayrıca bir şey söylemeye gerek yok
      if (moodAuto.kind === 'follow' && !svc.playing) hint = 'Canlı efekt oynarken çalışır.';
      else if (!svc.present) hint = 'Klavye takılınca başlar.';
    } else {
      if (ma.otherTab) hint = 'Başka bir sekmede çalışıyor; orada kapat.';
      else if (moodAuto.kind === 'follow' && !app.live) hint = 'Canlı efekt oynarken çalışır.';
      else hint = 'Bu sayfa açıkken çalışır.';
      if (!ma.otherTab && !app.kb) hint += ' Klavye bağlanınca başlar.';
    }
  }
  $('#moodAutoHint').textContent = hint;
}

function holdMoodLock() {
  if (ma.held) return Promise.resolve(true);
  if (!navigator.locks) { ma.held = true; return Promise.resolve(true); }
  return new Promise((res) => {
    navigator.locks.request('real67-mood', { ifAvailable: true }, (lock) => {
      if (!lock) { res(false); return undefined; }
      ma.held = true; res(true);
      return new Promise((r) => (ma.release = r));
    });
  });
}
function dropMoodLock() { ma.release?.(); ma.release = null; ma.held = false; }

async function setMoodAuto(kind) {
  moodAuto.kind = kind;
  ma.idx = -1; ma.last = 0; ma.otherTab = false;
  if (svc.ok) { dropMoodLock(); clearTimeout(moodT); await guard(() => svcCall('mood', moodCfg())); }
  else if (kind === 'off') dropMoodLock();
  else await guard(startMoodAuto);
  renderMoodAuto();
}
async function startMoodAuto() {
  if (!app.kb || moodAuto.kind === 'off' || svc.ok) return;
  if (!(await holdMoodLock())) { ma.otherTab = true; renderMoodAuto(); return; }
  const m = await app.kb.getMood();
  ma.cur = m.color;
  if (m.mode !== 1 && m.mode !== 3) {
    // Geçişli ve Şarj döngüsü kendi renklerini oynatıyor; seçilen renk ancak Statik/Nefes'te görünür
    await app.kb.setMoodMode(1);
    toast('Ortam ışığı Statik harekete alındı; renk değişimi bu harekette görünür');
  }
  await app.kb.setMoodOn(true);
  $('#moodOn').checked = true;
  await loadMood();
}

// Tuşlardaki baskın renk → en yakın hazır ortam rengi (parlaklıkla ağırlıklı oy)
// Bölge ağırlığı: seçilen yerdeki tuşlar oy verir (layout birimi, klavye 16 birim genişliğinde)
const REGION_WEIGHT = {
  all: () => 1,
  left: (k) => (k.cx < 3 ? 1 : 0),
  center: (k) => (Math.abs(k.cx - WIDTH_U / 2) < 2.5 ? 1 : 0),
  right: (k) => (k.cx > WIDTH_U - 3 ? 1 : 0),
};
function dominantMoodColor(raw) {
  const votes = new Float32Array(MOOD_COLORS.length);
  const weight = REGION_WEIGHT[moodAuto.region] || REGION_WEIGHT.all;
  for (let i = 0; i < KEY_COUNT; i++) {
    const w = weight(KEYS[i]);
    if (!w) continue;
    const r = raw[i * 3], g = raw[i * 3 + 1], b = raw[i * 3 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < 0.08) continue;
    let best = 0;
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
  // mevcut renge küçük bir avantaj: iki renk başa baş giderken titremesin
  let win = ma.cur ?? 0, wv = (votes[win] || 0) * 1.2;
  for (let c = 0; c < votes.length; c++) if (votes[c] > wv) { wv = votes[c]; win = c; }
  return win;
}

async function setMoodColorAuto(id, now) {
  ma.busy = true; ma.last = now;
  try {
    await app.kb.setMoodColor(id);
    ma.cur = id;
    $$('[data-color]', mcChips).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.color === id)));
    $$('#moodCycleColors .dot').forEach((b) => b.classList.toggle('now', +b.dataset.cycle === id));
  } catch (e) { console.error(e); } finally { ma.busy = false; }
}

engine.onFrame((final, raw) => {
  if (svc.ok || !app.kb || moodAuto.kind === 'off' || !ma.held || ma.busy) return;
  const now = performance.now();
  if (moodAuto.kind === 'cycle') {
    if (ma.last && now - ma.last < moodAuto.interval * 1000) return;
    const list = moodAuto.colors;
    let next;
    if (moodAuto.shuffle && list.length > 1) { do next = list[(Math.random() * list.length) | 0]; while (next === ma.cur); }
    else { ma.idx = (ma.idx + 1) % list.length; next = list[ma.idx]; }
    setMoodColorAuto(next, now);
  } else if (app.live || svc.playing) {
    if (now - ma.last < 350) return;
    const best = dominantMoodColor(raw);
    if (best !== ma.cur) setMoodColorAuto(best, now);
  }
});

// ------------------------------------------------------------ günlük
const logLines = [];
let logT;
function logPacket(dir, u) {
  if (!$('#logOn').checked) return;
  const h = Array.from(u.slice(0, 8 + u[2]), (x) => x.toString(16).padStart(2, '0')).join(' ');
  logLines.push(`${dir === 'out' ? '→' : '←'} ${h}`);
  if (logLines.length > 400) logLines.splice(0, logLines.length - 400);
  clearTimeout(logT);
  logT = setTimeout(() => { const el = $('#log'); el.textContent = logLines.join('\n'); el.scrollTop = el.scrollHeight; }, 100);
}

// ------------------------------------------------------------ bağlantı
function setStatus(state, text) {
  const s = $('#status'); s.dataset.state = state; $('#statusText').textContent = text;
}
// Bağlantı göstergesi: servis çalışıyorsa klavyeyle o konuşur; tarayıcının WebHID'i
// (ve "Klavyeyi bağla" düğmesi) gerekmez. Servis yoksa eski WebHID yolu kalır.
function renderConn() {
  const btn = $('#connectBtn');
  if (svc.ok) {
    btn.hidden = true;
    const ok = svc.connected || svc.present;
    setStatus(ok ? 'on' : 'off', ok ? 'REAL67 bağlı' : 'Klavye takılı değil');
    return;
  }
  btn.hidden = false;
  if (!app.kb && !Real67.supported()) {
    setStatus('err', 'Servis kapalı: Başlat menüsünden Real67 Studio’yu aç');
    btn.disabled = true;
  }
}
async function attach(kb) {
  setStatus('busy', 'Bağlanıyor…');
  await kb.open();
  kb.onPacket = logPacket;
  const info = await kb.info();
  app.kb = kb;
  app.paint.slots = {};
  await recoverLive(kb);
  setStatus('on', `${kb.name} bağlı`);
  $('#connectBtn').textContent = 'Bağlantıyı kes';
  setLiveBtn(); setStageNote();
  if (app.tab === 'paint') await openSlot(app.paint.slot);
  if (app.tab === 'modes') await loadModes();
  await loadMood();
  if (moodAuto.kind !== 'off') await startMoodAuto();
  renderMoodAuto();
}
async function detach(msg) {
  if (app.live) { app.live = false; dropLiveLock(); }
  dropMoodLock(); ma.cur = null;
  const kb = app.kb; app.kb = null;
  if (kb) await kb.close().catch(() => {});
  setStatus('off', 'Bağlı değil');
  $('#connectBtn').textContent = 'Klavyeyi bağla';
  setLiveBtn(); setStageNote();
  loadModes(); loadMood();
  if (msg) toast(msg);
}
$('#connectBtn').addEventListener('click', () => guard(async () => {
  if (app.kb) { if (app.live) await stopLive(true); return detach('Bağlantı kesildi'); }
  if (!Real67.supported()) throw new Error('Bu tarayıcı WebHID desteklemiyor. Chrome ya da Edge kullan.');
  const kb = await Real67.request();
  if (!kb) return;
  try { await attach(kb); } catch (e) { setStatus('err', 'Bağlanamadı'); throw e; }
}));
if (Real67.supported()) {
  navigator.hid.addEventListener('disconnect', (e) => { if (app.kb && e.device === app.kb.dev) detach('Klavye çıkarıldı'); });
  // Servis çalışıyorsa sayfa klavyeye doğrudan bağlanmaz: her şey servisten gider. (Sayfanın
  // kendi sorguları da servisin Hive algılamasını tetiklemesin diye ayrıca önemli.)
  navigator.hid.addEventListener('connect', async (e) => { if (!svc.ok && !app.kb && Real67.matches(e.device)) guard(() => attach(new Real67(e.device))); });
  firstPoll.then(() => {
    if (svc.ok) return;
    Real67.findGranted().then((kb) => kb && guard(() => attach(kb)).catch(() => setStatus('err', 'Bağlanamadı')));
  });
} else {
  // Firefox / Zen vb.: WebHID yok. Servis çalışıyorsa her şey onun üzerinden çalışır (renderConn).
  setStatus('busy', 'Servise bağlanılıyor…');
  $('#connectBtn').hidden = true;
}

// ------------------------------------------------------------ kaydırıcı dolgusu
// Rayın dolu kısmı CSS'te --p ile çizilir. Değerler kodla da değiştiği için
// (klavyeden okunan ayarlar) kaydırıcılar kısa aralıklarla eşitlenir.
function syncRange(el) {
  const min = +el.min || 0, max = el.max === '' ? 100 : +el.max;
  const v = (max > min ? ((+el.value - min) / (max - min)) * 100 : 0).toFixed(1) + '%';
  if (el.dataset.p !== v) { el.dataset.p = v; el.style.setProperty('--p', v); }
}
document.addEventListener('input', (e) => { if (e.target.type === 'range') syncRange(e.target); });
setInterval(() => $$('input[type="range"]').forEach(syncRange), 200);

// ------------------------------------------------------------ başlangıç
selectEffect(app.fx);
setLiveBtn(); setStageNote();
loadModes(); loadMood();
renderMoodAuto();
window.__real67 = app; // hata ayıklama
