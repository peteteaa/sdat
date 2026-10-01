import { SYNTH_TRACKS, type SynthSpec, type Track } from './tracks';

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL16 = Array.from({ length: 16 }, (_, i) => i);
const DRUMS: Record<SynthSpec['drums'], { kick: number[]; snare: number[]; hat: number[] }> = {
  none: { kick: [], snare: [], hat: [] },
  soft: { kick: [0, 10], snare: [12], hat: [2, 6, 10, 14] },
  beat: { kick: [0, 6, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  heavy: { kick: [0, 3, 8, 11], snare: [4, 12], hat: ALL16 },
};

interface Session {
  start(): void;
  pause(): void;
  resume(): void;
  dispose(): void;
  readonly time: number;
}

/** Generative music for one cassette, scheduled ahead on the audio clock. */
class SynthSession implements Session {
  private ctx: AudioContext;
  private spec: SynthSpec;
  private noise: AudioBuffer;
  private bus: GainNode;
  private send: GainNode;
  private wow: GainNode;
  private rng: () => number;
  private stepDur: number;
  private step = 0;
  private nextTime = 0;
  private startAt = 0;
  private timer = 0;
  private sustained: AudioScheduledSourceNode[] = [];

  constructor(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, spec: SynthSpec) {
    this.ctx = ctx;
    this.spec = spec;
    this.noise = noise;
    this.rng = mulberry32(spec.seed);
    this.stepDur = 60 / spec.bpm / 4;

    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(out);

    // Dotted-eighth tape echo.
    const delay = ctx.createDelay(2);
    delay.delayTime.value = this.stepDur * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    this.send = ctx.createGain();
    this.send.gain.value = 0.35;
    this.send.connect(delay).connect(tone).connect(fb).connect(delay);
    tone.connect(this.bus);

    // Wow & flutter shared by every pitched voice.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.55;
    this.wow = ctx.createGain();
    this.wow.gain.value = 7;
    lfo.connect(this.wow);
    lfo.start();
    this.sustained.push(lfo);
  }

  get time() {
    return Math.max(0, this.ctx.currentTime - this.startAt);
  }

  start() {
    const now = this.ctx.currentTime;
    this.startAt = now + 0.05;
    this.nextTime = this.startAt;
    this.bus.gain.setValueAtTime(0, now);
    this.bus.gain.linearRampToValueAtTime(1, now + 0.4);
    if (this.spec.cicadas) this.cicadas();
    if (this.spec.drone) this.drone();
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  pause() {
    void this.ctx.suspend();
  }

  resume() {
    void this.ctx.resume();
  }

  dispose() {
    clearInterval(this.timer);
    const now = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setTargetAtTime(0, now, 0.03);
    setTimeout(() => {
      for (const s of this.sustained) s.stop();
      this.bus.disconnect();
    }, 300);
  }

  private tick() {
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      const st = this.step % 16;
      const swing = st % 2 === 1 ? (this.spec.swing ?? 0) * this.stepDur : 0;
      this.playStep(this.step, this.nextTime + swing);
      this.nextTime += this.stepDur;
      this.step++;
    }
  }

  private note(degree: number, octave = 0) {
    const s = this.spec.scale;
    const oct = Math.floor(degree / s.length);
    return this.spec.root + 12 * (oct + octave) + s[((degree % s.length) + s.length) % s.length];
  }

  private playStep(n: number, t: number) {
    const s = this.spec;
    const bar = Math.floor(n / 16);
    const st = n % 16;
    const deg = s.progression[bar % s.progression.length];
    const chord = [0, 2, 4, 6].map((k) => this.note(deg + k));

    if (st === 0) this.pad(chord.slice(0, s.sevenths ? 4 : 3), t, this.stepDur * 16);
    if (s.bass[st]) this.bass(this.note(deg, -1), t, this.stepDur * 1.8);

    const a = s.arp[st];
    if (a !== null && a !== undefined && this.rng() < s.density) {
      let m = chord[a % 4] + 12 * (1 + Math.floor(a / 4));
      if (this.rng() < 0.12) m = this.note(deg + 1, 1);
      this.lead(m, t, this.stepDur * 2);
    }

    if (s.bells && (st === 0 ? bar % 2 === 1 : st === 8 && this.rng() < 0.3)) {
      this.bell(chord[Math.floor(this.rng() * 3)] + 24, t);
    }

    if (bar >= 2) {
      const d = DRUMS[s.drums];
      if (d.kick.includes(st)) this.kick(t);
      if (d.snare.includes(st)) this.snare(t);
      if (d.hat.includes(st)) this.hat(t, st % 4 === 2 ? 0.05 : 0.03);
    }
  }

  private osc(type: OscillatorType, freq: number, t: number, end: number, dest: AudioNode, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    this.wow.connect(o.detune);
    o.connect(dest);
    o.start(t);
    o.stop(end);
    return o;
  }

  private pad(notes: number[], t: number, dur: number) {
    const ctx = this.ctx;
    const level = this.spec.padLevel ?? 0.035;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = this.spec.brightness;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.8);
    g.gain.setValueAtTime(level, t + dur - 0.1);
    g.gain.linearRampToValueAtTime(0, t + dur + 1);
    f.connect(g).connect(this.bus);
    for (const m of notes) {
      this.osc(this.spec.pad, midiHz(m), t, t + dur + 1.1, f, -7);
      this.osc(this.spec.pad, midiHz(m), t, t + dur + 1.1, f, 7);
    }
  }

  private bass(m: number, t: number, dur: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    f.connect(g).connect(this.bus);
    this.osc('sine', midiHz(m), t, t + dur, f);
    this.osc('triangle', midiHz(m + 12), t, t + dur, f);
  }

  private lead(m: number, t: number, dur: number) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(700, t + dur);
    const g = ctx.createGain();
    const peak = this.spec.lead === 'sine' || this.spec.lead === 'triangle' ? 0.09 : 0.045;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    f.connect(g);
    g.connect(this.bus);
    g.connect(this.send);
    this.osc(this.spec.lead, midiHz(m), t, t + dur + 0.05, f);
  }

  private bell(m: number, t: number) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.connect(this.bus);
    g.connect(this.send);
    for (const [ratio, amp] of [[1, 0.07], [2.76, 0.025], [5.4, 0.012]]) {
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(amp, t);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 3 / ratio);
      pg.connect(g);
      this.osc('sine', midiHz(m) * ratio, t, t + 3, pg);
    }
  }

  private kick(t: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.4);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, level: number, decay: number) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + decay + 0.02);
  }

  private snare(t: number) {
    this.noiseHit(t, 'bandpass', 1800, 0.28, 0.16);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    g.connect(this.bus);
    this.osc('triangle', 190, t, t + 0.1, g);
  }

  private hat(t: number, level: number) {
    this.noiseHit(t, 'highpass', 7500, level, 0.045);
  }

  private cicadas() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4800;
    bp.Q.value = 5;
    const trill = ctx.createGain();
    trill.gain.value = 0.5;
    const trillLfo = ctx.createOscillator();
    trillLfo.type = 'square';
    trillLfo.frequency.value = 23;
    const trillDepth = ctx.createGain();
    trillDepth.gain.value = 0.5;
    trillLfo.connect(trillDepth).connect(trill.gain);
    const swell = ctx.createGain();
    swell.gain.value = 0.04;
    const swellLfo = ctx.createOscillator();
    swellLfo.frequency.value = 0.09;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.03;
    swellLfo.connect(swellDepth).connect(swell.gain);
    src.connect(bp).connect(trill).connect(swell).connect(this.bus);
    for (const n of [src, trillLfo, swellLfo]) {
      n.start();
      this.sustained.push(n);
    }
  }

  private drone() {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    f.Q.value = 4;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const depth = ctx.createGain();
    depth.gain.value = 180;
    lfo.connect(depth).connect(f.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.05;
    f.connect(g).connect(this.bus);
    const root = this.spec.root - 12;
    const a = this.osc('sawtooth', midiHz(root), ctx.currentTime, 1e6, f, -5);
    const b = this.osc('sawtooth', midiHz(root + 7), ctx.currentTime, 1e6, f, 5);
    lfo.start();
    this.sustained.push(a, b, lfo);
  }
}

/** Plays a real audio file through the same tape chain. */
class FileSession implements Session {
  private el: HTMLAudioElement;
  private gain: GainNode;

  constructor(ctx: AudioContext, out: AudioNode, src: string) {
    this.el = new Audio();
    this.el.crossOrigin = 'anonymous';
    this.el.src = src;
    this.el.loop = true;
    this.gain = ctx.createGain();
    ctx.createMediaElementSource(this.el).connect(this.gain).connect(out);
  }

  get time() {
    return this.el.currentTime;
  }
  start() {
    void this.el.play();
  }
  pause() {
    this.el.pause();
  }
  resume() {
    void this.el.play();
  }
  dispose() {
    this.el.pause();
    this.gain.disconnect();
    this.el.removeAttribute('src');
  }
}

/**
 * Mechanical sound effects. Runs on its own context so key clicks still sound
 * while the music context is suspended for pause.
 */
class Foley {
  private ctx = new AudioContext({ latencyHint: 'interactive' });
  private out: GainNode;
  private noise: AudioBuffer;

  constructor() {
    this.out = this.ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(this.ctx.destination);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate / 2, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  unlock() {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private burst(t: number, type: BiquadFilterType, freq: number, q: number, level: number, decay: number) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.4);
    src.stop(t + decay + 0.01);
  }

  private tone(t: number, from: number, to: number, level: number, decay: number, type: OscillatorType = 'sine') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + decay + 0.01);
  }

  /** Tactile switch: sharp snap on press, softer tick on release. */
  click() {
    const t = this.ctx.currentTime + 0.005;
    const p = 0.9 + Math.random() * 0.2;
    this.burst(t, 'bandpass', 4200 * p, 1.2, 0.5, 0.012);
    this.tone(t, 2300 * p, 1600 * p, 0.12, 0.018, 'triangle');
    this.tone(t, 320 * p, 180, 0.12, 0.03);
    this.burst(t + 0.085, 'bandpass', 5200 * p, 1.5, 0.2, 0.008);
    this.tone(t + 0.085, 2800 * p, 2000, 0.05, 0.012, 'triangle');
  }

  /** Latch release, spring-loaded lid pop and the cassette rattling free. */
  eject() {
    const t = this.ctx.currentTime + 0.01;
    this.burst(t, 'highpass', 3000, 0.7, 0.35, 0.01);
    this.tone(t, 1900, 1200, 0.08, 0.02, 'square');
    this.tone(t + 0.04, 150, 55, 0.5, 0.16);
    this.burst(t + 0.04, 'lowpass', 900, 0.8, 0.45, 0.07);
    this.burst(t + 0.05, 'bandpass', 2400, 3, 0.35, 0.09);
    this.tone(t + 0.05, 620, 540, 0.05, 0.25, 'triangle');
    this.burst(t + 0.13, 'bandpass', 3100, 2, 0.18, 0.05);
    this.burst(t + 0.19, 'bandpass', 2700, 2, 0.08, 0.04);
  }
}

export type SfxName = 'click' | 'eject';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private input!: GainNode;
  private analyser!: AnalyserNode;
  private hiss!: GainNode;
  private noise!: AudioBuffer;
  private session: Session | null = null;
  private buf = new Float32Array(1024);
  private paused = false;
  private foley: Foley | null = null;

  /** Must be called from a user gesture at least once. */
  unlock() {
    this.foley ??= new Foley();
    this.foley.unlock();
    if (!this.ctx) this.init();
    if (this.ctx!.state === 'suspended' && !this.paused) void this.ctx!.resume();
  }

  private init() {
    const ctx = new AudioContext({ latencyHint: 'playback' });
    this.ctx = ctx;

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.input = ctx.createGain();
    const tape = ctx.createBiquadFilter();
    tape.type = 'lowpass';
    tape.frequency.value = 9500;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    const master = ctx.createGain();
    master.gain.value = 0.85;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.input.connect(tape).connect(comp).connect(master).connect(this.analyser).connect(ctx.destination);

    const hissSrc = ctx.createBufferSource();
    hissSrc.buffer = this.noise;
    hissSrc.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4000;
    this.hiss = ctx.createGain();
    this.hiss.gain.value = 0;
    hissSrc.connect(hp).connect(this.hiss).connect(comp);
    hissSrc.start();
  }

  get time() {
    return this.session?.time ?? 0;
  }

  sfx(name: SfxName) {
    this.unlock();
    this.foley![name]();
  }

  play(track: Track) {
    this.unlock();
    const ctx = this.ctx!;
    this.session?.dispose();
    this.paused = false;
    void ctx.resume();
    this.session = track.src
      ? new FileSession(ctx, this.input, track.src)
      : new SynthSession(ctx, this.input, this.noise, track.synth ?? SYNTH_TRACKS[0].synth!);
    this.session.start();
    this.hiss.gain.setTargetAtTime(0.006, ctx.currentTime, 0.2);
  }

  pause() {
    if (!this.session) return;
    this.paused = true;
    this.session.pause();
  }

  resume() {
    if (!this.session) return;
    this.paused = false;
    this.session.resume();
  }

  stop() {
    if (!this.ctx) return;
    this.session?.dispose();
    this.session = null;
    this.paused = false;
    void this.ctx.resume();
    this.hiss.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  /** Peak-ish levels (0..1) for the L/R meters. */
  meter(): [number, number] {
    if (!this.ctx || !this.session || this.paused) return [0, 0];
    this.analyser.getFloatTimeDomainData(this.buf);
    const half = this.buf.length / 2;
    const level = (from: number) => {
      let sum = 0;
      for (let i = from; i < from + half; i++) sum += this.buf[i] * this.buf[i];
      const db = 20 * Math.log10(Math.sqrt(sum / half) + 1e-6);
      return Math.min(1, Math.max(0, (db + 42) / 38));
    };
    return [level(0), level(half)];
  }
}
