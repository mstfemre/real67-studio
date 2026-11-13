// Efekt motoru: zamanlama Web Worker'da (arka plan sekmesinde kısılmasın diye),
// render ana iş parçacığında, çıktı bir "sink" fonksiyonuna gider.
import { KEYS } from './layout.js';

const N = KEYS.length;
const WORKER_SRC = `let id=null;onmessage=(e)=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(performance.now()),1000/e.data)}`;

export class Engine {
  constructor() {
    this.fx = null;
    this.params = {};
    this.state = {};
    this.out = new Float32Array(N * 3);
    this.final = new Float32Array(N * 3);
    this.master = 1;
    this.gamma = true;
    this.fps = 30;
    this.running = false;
    this.presses = [];
    this.audio = null;     // AnalyserNode
    this.screen = null;    // (u,v) => [r,g,b]
    this.listeners = new Set();
    this.t0 = performance.now();
    this.last = this.t0;
    this.fpsMeasured = 0;
    this._frames = 0; this._fpsT = this.t0;
    this.worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })));
    this.worker.onmessage = () => this.tick();
  }

  setEffect(fx, params) {
    this.fx = fx;
    this.params = params;
    this.state = {};
    fx.init?.(this.state);
  }

  onFrame(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  start(fps = this.fps) {
    this.fps = fps;
    this.running = true;
    this.last = performance.now();
    this.worker.postMessage(fps);
  }
  stop() { this.running = false; this.worker.postMessage(0); }
  setFps(fps) { this.fps = fps; if (this.running) this.worker.postMessage(fps); }

  press(key) { this.presses.push(key); }

  tick() {
    if (!this.fx) return;
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const presses = this.presses; this.presses = [];
    this.fx.frame({ t: (now - this.t0) / 1000, dt, p: this.params, out: this.out, s: this.state, presses, audio: this.audio, screen: this.screen });
    // genel parlaklık × efektin kendi parlaklık ayarı
    const g = this.gamma ? 2.2 : 1, m = this.master * (typeof this.params.brightness === 'number' ? this.params.brightness / 100 : 1);
    for (let i = 0; i < N * 3; i++) {
      const v = Math.min(1, Math.max(0, this.out[i]));
      this.final[i] = Math.pow(v, g) * m;
    }
    this._frames++;
    if (now - this._fpsT > 1000) { this.fpsMeasured = (this._frames * 1000) / (now - this._fpsT); this._frames = 0; this._fpsT = now; }
    for (const fn of this.listeners) fn(this.final, this.out);
  }
}

// ---- Ses kaynağı
export async function openAudio(kind) {
  let stream;
  if (kind === 'mic') {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } else {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('Paylaşımda ses yok. Paylaşım penceresinde “Sesi de paylaş” kutusunu işaretle.');
    }
    stream.getVideoTracks().forEach((t) => t.stop());
  }
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  an.smoothingTimeConstant = 0.55;
  src.connect(an);
  return {
    analyser: an,
    close() { stream.getTracks().forEach((t) => t.stop()); ctx.close(); },
    stream,
  };
}

// ---- Ekran kaynağı
export async function openScreen() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
  const video = document.createElement('video');
  video.srcObject = stream; video.muted = true; video.playsInline = true;
  await video.play();
  const W = 32, H = 12;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  let data = null, stamp = 0;
  const grab = () => {
    const now = performance.now();
    if (now - stamp < 25) return;
    stamp = now;
    try { cx.drawImage(video, 0, 0, W, H); data = cx.getImageData(0, 0, W, H).data; } catch { /* henüz kare yok */ }
  };
  const sampler = (u, v) => {
    grab();
    if (!data) return [0, 0, 0];
    const x = Math.min(W - 1, Math.floor(u * W)), y = Math.min(H - 1, Math.floor(v * H));
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = Math.min(W - 1, Math.max(0, x + dx)), yy = Math.min(H - 1, Math.max(0, y + dy));
      const o = (yy * W + xx) * 4; r += data[o]; g += data[o + 1]; b += data[o + 2]; n++;
    }
    return [r / n / 255, g / n / 255, b / n / 255];
  };
  return {
    sampler,
    stream,
    close() { stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; },
  };
}
