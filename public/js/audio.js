// Звуки синтезируются прямо в браузере (без файлов): гром, вихрь портала, рык, огонь, «победный» звон.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; }
  unlock() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    this.master = this.ctx.createGain(); this.master.gain.value = .9;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // iOS: «разбудить» звук пустым сигналом в момент нажатия
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); g.gain.value = 0; o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + .05);
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : .9; }
  get ok() { return this.ctx && !this.muted; }
  noise(t) { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; s.start(t); return s; }
  env(g, t, a, peak, d, end = .0001) { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); }

  thunder(power = 1) {
    if (!this.ok) return; const c = this.ctx, t = c.currentTime;
    // треск
    const n1 = this.noise(t), hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    const g1 = c.createGain(); this.env(g1, t, .005, .7 * power, .18); n1.connect(hp); hp.connect(g1); g1.connect(this.master); n1.stop(t + .3);
    // раскат
    const n2 = this.noise(t), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.8);
    const g2 = c.createGain(); this.env(g2, t + .02, .04, 1.0 * power, 2.2); n2.connect(lp); lp.connect(g2); g2.connect(this.master); n2.stop(t + 2.5);
  }
  whoosh(dur = 1.2) {
    if (!this.ok) return; const c = this.ctx, t = c.currentTime;
    const n = this.noise(t), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(1600, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.55, t + dur * .7); g.gain.exponentialRampToValueAtTime(.0001, t + dur * 1.15);
    n.connect(bp); bp.connect(g); g.connect(this.master); n.stop(t + dur * 1.2);
  }
  roar() {
    if (!this.ok) return; const c = this.ctx, t = c.currentTime, D = 1.5;
    const shaper = c.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 4); }
    shaper.curve = curve;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(1300, t + .25); lp.frequency.exponentialRampToValueAtTime(300, t + D);
    const g = c.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.6, t + .12); g.gain.setValueAtTime(.6, t + D * .55); g.gain.exponentialRampToValueAtTime(.0001, t + D);
    for (const [f, det] of [[95, 0], [101, 7], [190, -5]]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.detune.value = det;
      o.frequency.setValueAtTime(f * 1.25, t); o.frequency.exponentialRampToValueAtTime(f * .7, t + D);
      // «рычание» — быстрая модуляция
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 28; lg.gain.value = f * .08; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + D);
      o.connect(shaper); o.start(t); o.stop(t + D);
    }
    const n = this.noise(t), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = .7;
    const ng = c.createGain(); ng.gain.value = .5; n.connect(bp); bp.connect(ng); ng.connect(shaper); n.stop(t + D);
    shaper.connect(lp); lp.connect(g); g.connect(this.master);
  }
  fire(dur = 1.4) {
    if (!this.ok) return; const c = this.ctx, t = c.currentTime;
    const n = this.noise(t), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = .4;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500;
    const g = c.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.8, t + .1); g.gain.setValueAtTime(.8, t + dur - .3); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 13; lg.gain.value = .25; lfo.connect(lg); lg.connect(g.gain); lfo.start(t); lfo.stop(t + dur);
    n.connect(bp); bp.connect(lp); lp.connect(g); g.connect(this.master); n.stop(t + dur + .1);
  }
  chime() {
    if (!this.ok) return; const c = this.ctx, t = c.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = f;
      this.env(g, t + i * .09, .01, .28, 1.2); o.connect(g); g.connect(this.master); o.start(t + i * .09); o.stop(t + i * .09 + 1.4);
    });
  }
}
