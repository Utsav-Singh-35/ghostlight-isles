import type { CueName } from './cues';

/** Sounds that are not tied to a place in a battle. */
export type Effect = 'click' | 'turn' | 'lit' | 'solved' | 'win' | 'loss' | 'coin' | 'build' | 'bell' | 'order' | 'heartbeat' | 'bubble';

interface Out {
  readonly gain: number;
  readonly pan: number;
  /** Share sent to the reverb, 0 to 1. */
  readonly wet?: number;
}

interface NoiseVoice {
  readonly filter: BiquadFilterType;
  /** Filter frequency at the start and the end, hertz. */
  readonly from: number;
  readonly to: number;
  readonly q?: number;
  readonly peak: number;
  readonly attack?: number;
  readonly decay: number;
  /** Chops the sound on and off this many times a second (wings, crackling fire). */
  readonly flutter?: number;
}

interface ToneVoice {
  readonly wave: OscillatorType;
  /** Pitch at the start and the end, hertz. */
  readonly from: number;
  readonly to: number;
  readonly peak: number;
  readonly attack?: number;
  readonly decay: number;
  readonly vibrato?: { readonly rate: number; readonly depth: number };
  readonly lowpass?: number;
}

/** Sources playing at once; beyond this, new sounds are skipped. */
const MAX_VOICES = 48;
const MASTER_VOLUME = 0.55;
/** The muffle filter wide open, hertz. */
const OPEN = 18000;
/** The muffle filter in Davy Jones' Locker, hertz. */
const UNDERWATER = 420;
const BELL_PARTIALS = [
  { ratio: 1, gain: 0.22, decay: 2.6 },
  { ratio: 2, gain: 0.12, decay: 1.8 },
  { ratio: 2.76, gain: 0.1, decay: 1.3 },
  { ratio: 5.4, gain: 0.05, decay: 0.7 },
  { ratio: 8.9, gain: 0.025, decay: 0.35 },
] as const;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** A rising-then-falling loudness curve. Exponential ramps can't touch zero, so it starts and ends just above it. */
function envelope(param: AudioParam, t: number, peak: number, attack: number, decay: number): void {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** Mono noise. Brown noise (for the sea) has its ends matched so the loop never clicks. */
function noiseBuffer(ctx: BaseAudioContext, seconds: number, brown: boolean): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else data[i] = white;
  }
  if (brown) {
    const drift = (data[length - 1]! - data[0]!) / (length - 1);
    for (let i = 0; i < length; i++) data[i] = data[i]! - drift * i;
  }
  return buffer;
}

/** A reverb tail: stereo noise fading away. */
function impulse(ctx: BaseAudioContext, seconds: number, fade: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** fade;
  }
  return buffer;
}

/** Makes every sound in the game from oscillators, noise and filters. No sound files. */
export class Synth {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly muffle: BiquadFilterNode;
  private readonly bus: GainNode;
  private readonly send: GainNode;
  private readonly white: AudioBuffer;
  private readonly brown: AudioBuffer;
  private readonly wash: GainNode;
  private readonly wind: GainNode;
  private readonly drone: GainNode;
  private readonly targets = new Map<AudioParam, number>();
  private voices = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.3;
    compressor.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = MASTER_VOLUME;
    this.master.connect(compressor);
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = OPEN;
    this.muffle.Q.value = 0.7;
    this.muffle.connect(this.master);
    this.bus = this.gain(1, this.muffle);
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 2.6, 2.8);
    reverb.connect(this.gain(0.6, this.muffle));
    this.send = this.gain(1, reverb);
    this.white = noiseBuffer(ctx, 2, false);
    this.brown = noiseBuffer(ctx, 6, true);

    const ambience = this.gain(0, this.muffle);
    ambience.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
    // The sea: two slow swells of brown noise, one in each ear.
    for (const [pan, swell, rate, offset] of [
      [-0.55, 0.09, 1, 0],
      [0.55, 0.13, 0.85, 2.7],
    ] as const) {
      const level = this.gain(0.5, this.pan(pan, ambience));
      this.lfo(swell, 0.26, level.gain);
      this.loop(this.brown, rate, offset).connect(this.filter('lowpass', 620, 0.4)).connect(level);
    }
    // The rush of water along the hull, louder with speed.
    this.wash = this.gain(0.02, ambience);
    this.loop(this.white, 1, 0.3).connect(this.filter('bandpass', 1000, 0.6)).connect(this.wash);
    // A thin wind whistling through the rigging.
    this.wind = this.gain(0.03, ambience);
    const whistle = this.filter('bandpass', 520, 9);
    this.lfo(0.05, 220, whistle.frequency);
    this.loop(this.white, 0.7, 1.1).connect(whistle).connect(this.wind);
    // The Blood Moon's drone.
    this.drone = this.gain(0, ambience);
    const dark = this.filter('lowpass', 190, 1);
    dark.connect(this.drone);
    for (const [wave, frequency] of [
      ['sawtooth', 49],
      ['sawtooth', 49.6],
      ['sine', 98],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.frequency.value = frequency;
      osc.connect(dark);
      osc.start();
    }
  }

  /** 0 for silence, 1 for full volume. */
  setVolume(volume: number): void {
    this.master.gain.setTargetAtTime(MASTER_VOLUME * clamp01(volume), this.ctx.currentTime, 0.05);
  }

  /** Follows the ship's speed (0 to 1), the Blood Moon (0 to 1) and whether the ship is under water. */
  setAmbience(speed: number, blood: number, underwater: boolean): void {
    this.approach(this.wash.gain, 0.02 + 0.14 * clamp01(speed), 0.4);
    this.approach(this.wind.gain, 0.03 + 0.05 * clamp01(blood), 1);
    this.approach(this.drone.gain, 0.12 * clamp01(blood), 0.8);
    this.approach(this.muffle.frequency, underwater ? UNDERWATER : OPEN, underwater ? 0.35 : 0.2);
  }

  /** One battle sound at a loudness and a stereo position. */
  battle(name: CueName, gain: number, pan: number): void {
    const t = this.ctx.currentTime + 0.005 + Math.random() * 0.01;
    const out: Out = { gain, pan };
    const spectral: Out = { gain, pan, wet: 0.5 };
    switch (name) {
      case 'cannon':
        this.noise(t, { filter: 'lowpass', from: 2200, to: 160, q: 0.7, peak: 0.9, decay: 0.6 }, out);
        this.tone(t, { wave: 'sine', from: 95, to: 38, peak: 0.85, decay: 0.34 }, out);
        break;
      case 'salt':
        this.noise(t, { filter: 'lowpass', from: 2000, to: 180, q: 0.7, peak: 0.75, decay: 0.5 }, out);
        this.tone(t, { wave: 'sine', from: 90, to: 40, peak: 0.7, decay: 0.3 }, out);
        this.noise(t + 0.03, { filter: 'highpass', from: 6000, to: 9000, q: 0.5, peak: 0.12, decay: 0.35 }, { gain, pan, wet: 0.4 });
        break;
      case 'tower':
        this.noise(t, { filter: 'lowpass', from: 1500, to: 140, q: 0.7, peak: 0.7, decay: 0.55 }, out);
        this.tone(t, { wave: 'sine', from: 80, to: 34, peak: 0.7, decay: 0.32 }, out);
        break;
      case 'zap':
        this.tone(t, { wave: 'triangle', from: 1300, to: 240, peak: 0.32, attack: 0.01, decay: 0.32 }, spectral);
        this.tone(t, { wave: 'sine', from: 1950, to: 360, peak: 0.14, attack: 0.01, decay: 0.3 }, spectral);
        break;
      case 'catapult':
        this.noise(t, { filter: 'bandpass', from: 520, to: 300, q: 2, peak: 0.6, decay: 0.16 }, out);
        this.tone(t, { wave: 'triangle', from: 150, to: 70, peak: 0.4, decay: 0.22 }, out);
        break;
      case 'barrel':
        this.noise(t, { filter: 'bandpass', from: 300, to: 1800, q: 1.2, peak: 0.45, attack: 0.08, decay: 0.45 }, out);
        break;
      case 'hit':
        this.noise(t, { filter: 'bandpass', from: 1200, to: 450, q: 1.1, peak: 0.75, decay: 0.24 }, out);
        this.tone(t, { wave: 'sine', from: 140, to: 60, peak: 0.45, decay: 0.16 }, out);
        break;
      case 'spiritHit':
        this.noise(t, { filter: 'highpass', from: 2500, to: 5000, q: 0.6, peak: 0.25, decay: 0.25 }, spectral);
        this.tone(t, { wave: 'sine', from: 620, to: 1250, peak: 0.2, attack: 0.01, decay: 0.2 }, spectral);
        break;
      case 'fireball':
        this.noise(t, { filter: 'lowpass', from: 1000, to: 200, q: 0.8, peak: 0.8, attack: 0.02, decay: 0.8 }, out);
        this.noise(t + 0.05, { filter: 'highpass', from: 2600, to: 3200, q: 0.5, peak: 0.18, decay: 1, flutter: 13 }, out);
        break;
      case 'splash':
        this.noise(t, { filter: 'bandpass', from: 1700, to: 500, q: 0.7, peak: 0.5, attack: 0.012, decay: 0.5 }, out);
        break;
      case 'thud':
        this.noise(t, { filter: 'lowpass', from: 700, to: 150, q: 0.7, peak: 0.45, decay: 0.22 }, out);
        break;
      case 'explosion':
        this.explosion(t, out, 1);
        break;
      case 'keepFalls':
        this.explosion(t, out, 1.15);
        for (const p of BELL_PARTIALS.slice(0, 3)) this.tone(t + 0.05, { wave: 'sine', from: 98 * p.ratio, to: 98 * p.ratio, peak: p.gain * 1.6, decay: p.decay }, { gain, pan, wet: 0.6 });
        break;
      case 'shipSinks':
        this.explosion(t, out, 0.9);
        this.tone(t + 0.2, { wave: 'sawtooth', from: 70, to: 38, peak: 0.2, attack: 0.2, decay: 1.8, lowpass: 320 }, out);
        for (let i = 0; i < 6; i++) this.bubble(t + 0.4 + i * 0.25 + Math.random() * 0.1, gain, pan);
        break;
      case 'ghostWail':
        this.tone(t, { wave: 'sine', from: 660, to: 170, peak: 0.42, attack: 0.12, decay: 1.6, vibrato: { rate: 5.5, depth: 16 } }, { gain, pan, wet: 0.7 });
        this.tone(t, { wave: 'sine', from: 990, to: 255, peak: 0.16, attack: 0.12, decay: 1.4, vibrato: { rate: 6, depth: 20 } }, { gain, pan, wet: 0.7 });
        this.noise(t, { filter: 'highpass', from: 1500, to: 600, q: 0.5, peak: 0.14, attack: 0.1, decay: 1.1 }, { gain, pan, wet: 0.6 });
        break;
      case 'mine':
        this.explosion(t, out, 0.9);
        this.noise(t + 0.05, { filter: 'bandpass', from: 1500, to: 400, q: 0.7, peak: 0.8, attack: 0.02, decay: 0.9 }, out);
        break;
      case 'bats':
        this.noise(t, { filter: 'bandpass', from: 2600, to: 3000, q: 2.5, peak: 0.35, attack: 0.05, decay: 1.3, flutter: 22 }, out);
        for (let i = 0; i < 6; i++) {
          const f = 5200 + Math.random() * 2200;
          this.tone(t + i * 0.18 + Math.random() * 0.08, { wave: 'sine', from: f, to: f * 0.8, peak: 0.1, attack: 0.004, decay: 0.05 }, { gain, pan: Math.random() * 1.2 - 0.6 });
        }
        break;
    }
  }

  /** A sound that isn't tied to a place in a battle. `strength` scales it, 0 to 1. */
  effect(effect: Effect, strength = 1): void {
    const t = this.ctx.currentTime + 0.005;
    const centre: Out = { gain: strength, pan: 0 };
    const airy: Out = { gain: strength, pan: 0, wet: 0.45 };
    switch (effect) {
      case 'click':
        this.tone(t, { wave: 'sine', from: 1250, to: 900, peak: 0.07, attack: 0.002, decay: 0.05 }, centre);
        break;
      case 'turn':
        this.noise(t, { filter: 'bandpass', from: 2300, to: 1800, q: 4, peak: 0.22, attack: 0.002, decay: 0.05 }, centre);
        this.tone(t, { wave: 'sine', from: 420, to: 300, peak: 0.1, attack: 0.002, decay: 0.06 }, centre);
        break;
      case 'lit':
        this.tone(t, { wave: 'sine', from: 880, to: 880, peak: 0.13, decay: 0.9 }, airy);
        this.tone(t, { wave: 'sine', from: 1320, to: 1320, peak: 0.07, decay: 0.7 }, airy);
        break;
      case 'solved':
        [440, 523.25, 659.25, 880].forEach((f, i) => {
          this.tone(t + i * 0.11, { wave: 'sine', from: f, to: f, peak: 0.16, decay: 1.3 }, airy);
          this.tone(t + i * 0.11, { wave: 'sine', from: f * 2.76, to: f * 2.76, peak: 0.03, decay: 0.5 }, airy);
        });
        break;
      case 'win':
        [293.66, 440, 587.33].forEach((f, i) => this.tone(t + i * 0.14, { wave: 'triangle', from: f, to: f, peak: 0.16, decay: 1.1, lowpass: 2400 }, airy));
        for (const f of [587.33, 739.99, 880]) this.tone(t + 0.42, { wave: 'triangle', from: f, to: f, peak: 0.1, decay: 1.6, lowpass: 2400 }, airy);
        break;
      case 'loss':
        [220, 174.61, 146.83].forEach((f, i) => {
          this.tone(t + i * 0.3, { wave: 'triangle', from: f, to: f, peak: 0.16, decay: 1.2, lowpass: 1200 }, airy);
          this.tone(t + i * 0.3, { wave: 'sine', from: f / 2, to: f / 2, peak: 0.1, decay: 1.2 }, centre);
        });
        break;
      case 'coin':
        this.tone(t, { wave: 'sine', from: 1975, to: 1975, peak: 0.09, attack: 0.002, decay: 0.3 }, centre);
        this.tone(t + 0.07, { wave: 'sine', from: 2637, to: 2637, peak: 0.08, attack: 0.002, decay: 0.35 }, centre);
        break;
      case 'build':
        for (const at of [0, 0.17]) {
          this.noise(t + at, { filter: 'bandpass', from: 360, to: 280, q: 3, peak: 0.5, attack: 0.002, decay: 0.09 }, centre);
          this.tone(t + at, { wave: 'sine', from: 170, to: 95, peak: 0.32, attack: 0.002, decay: 0.1 }, centre);
        }
        break;
      case 'bell':
        for (const at of [0, 0.5, 1.7]) {
          for (const p of BELL_PARTIALS) this.tone(t + at, { wave: 'sine', from: 520 * p.ratio, to: 520 * p.ratio, peak: p.gain, attack: 0.002, decay: p.decay }, { gain: strength, pan: 0, wet: 0.5 });
        }
        break;
      case 'order':
        this.tone(t, { wave: 'sine', from: 660, to: 660, peak: 0.1, decay: 0.6 }, airy);
        this.tone(t + 0.09, { wave: 'sine', from: 990, to: 990, peak: 0.08, decay: 0.6 }, airy);
        break;
      case 'heartbeat':
        this.tone(t, { wave: 'sine', from: 62, to: 42, peak: 0.5, attack: 0.01, decay: 0.16 }, centre);
        this.tone(t + 0.24, { wave: 'sine', from: 58, to: 40, peak: 0.35, attack: 0.01, decay: 0.18 }, centre);
        break;
      case 'bubble':
        this.bubble(t, strength, Math.random() - 0.5);
        break;
    }
  }

  private explosion(t: number, out: Out, size: number): void {
    this.noise(t, { filter: 'lowpass', from: 2400, to: 90, q: 0.6, peak: 1 * size, decay: 1.4 * size }, out);
    this.tone(t, { wave: 'sine', from: 72, to: 28, peak: 0.9 * size, decay: 0.8 * size }, out);
    this.noise(t + 0.18, { filter: 'bandpass', from: 900, to: 400, q: 1.2, peak: 0.35, decay: 0.25 }, out);
    this.noise(t + 0.4, { filter: 'bandpass', from: 700, to: 300, q: 1.2, peak: 0.25, decay: 0.25 }, out);
  }

  private bubble(t: number, gain: number, pan: number): void {
    const f = 300 + Math.random() * 500;
    this.tone(t, { wave: 'sine', from: f, to: f * 1.9, peak: 0.07, attack: 0.003, decay: 0.07 }, { gain, pan, wet: 0.3 });
  }

  /** Filtered noise with a moving filter. */
  private noise(t: number, v: NoiseVoice, out: Out): void {
    if (this.voices >= MAX_VOICES || out.gain <= 0) return;
    const ctx = this.ctx;
    const attack = v.attack ?? 0.004;
    const end = t + attack + v.decay;
    const source = ctx.createBufferSource();
    source.buffer = this.white;
    source.loop = true;
    const filter = this.filter(v.filter, v.from, v.q ?? 0.8);
    filter.frequency.setValueAtTime(v.from, t);
    filter.frequency.exponentialRampToValueAtTime(v.to, end);
    const amp = ctx.createGain();
    envelope(amp.gain, t, v.peak * out.gain, attack, v.decay);
    source.connect(filter).connect(amp);
    const nodes: AudioNode[] = [source, filter, amp];
    let last: AudioNode = amp;
    if (v.flutter) {
      const chop = this.gain(0.5);
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = v.flutter;
      const depth = this.gain(0.5);
      lfo.connect(depth).connect(chop.gain);
      lfo.start(t);
      lfo.stop(end + 0.05);
      amp.connect(chop);
      nodes.push(chop, lfo, depth);
      last = chop;
    }
    this.finish(source, last, nodes, out, t, end, Math.random() * 1.5);
  }

  /** An oscillator gliding between two pitches. */
  private tone(t: number, v: ToneVoice, out: Out): void {
    if (this.voices >= MAX_VOICES || out.gain <= 0) return;
    const ctx = this.ctx;
    const attack = v.attack ?? 0.004;
    const end = t + attack + v.decay;
    const osc = ctx.createOscillator();
    osc.type = v.wave;
    osc.frequency.setValueAtTime(v.from, t);
    if (v.to !== v.from) osc.frequency.exponentialRampToValueAtTime(v.to, end);
    const amp = ctx.createGain();
    envelope(amp.gain, t, v.peak * out.gain, attack, v.decay);
    const nodes: AudioNode[] = [osc, amp];
    if (v.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = v.vibrato.rate;
      const depth = this.gain(v.vibrato.depth);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(end + 0.05);
      nodes.push(lfo, depth);
    }
    if (v.lowpass) {
      const filter = this.filter('lowpass', v.lowpass, 0.7);
      osc.connect(filter).connect(amp);
      nodes.push(filter);
    } else osc.connect(amp);
    this.finish(osc, amp, nodes, out, t, end, 0);
  }

  /** Pans a voice, sends some to the reverb, starts it and cleans up when it ends. */
  private finish(source: AudioScheduledSourceNode, last: AudioNode, nodes: AudioNode[], out: Out, t: number, end: number, offset: number): void {
    const panner = this.pan(Math.max(-1, Math.min(1, out.pan)), this.bus);
    last.connect(panner);
    nodes.push(panner);
    if (out.wet) {
      const wet = this.gain(out.wet, this.send);
      panner.connect(wet);
      nodes.push(wet);
    }
    this.voices++;
    source.onended = () => {
      this.voices--;
      for (const node of nodes) node.disconnect();
    };
    if (source instanceof AudioBufferSourceNode) source.start(t, offset);
    else source.start(t);
    source.stop(end + 0.05);
  }

  /** Eases an ambience setting toward a value, skipping the change when it is already close. */
  private approach(param: AudioParam, value: number, seconds: number): void {
    const previous = this.targets.get(param);
    if (previous !== undefined && Math.abs(previous - value) <= Math.max(0.002, Math.abs(value) * 0.01)) return;
    this.targets.set(param, value);
    param.setTargetAtTime(value, this.ctx.currentTime, seconds);
  }

  private gain(value: number, to?: AudioNode): GainNode {
    const node = this.ctx.createGain();
    node.gain.value = value;
    if (to) node.connect(to);
    return node;
  }

  private pan(value: number, to: AudioNode): StereoPannerNode {
    const node = this.ctx.createStereoPanner();
    node.pan.value = value;
    node.connect(to);
    return node;
  }

  private filter(type: BiquadFilterType, frequency: number, q: number): BiquadFilterNode {
    const node = this.ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  }

  /** A looping buffer, started at once. */
  private loop(buffer: AudioBuffer, rate: number, offset: number): AudioBufferSourceNode {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = rate;
    source.start(0, offset % buffer.duration);
    return source;
  }

  /** A slow wobble added to a setting. */
  private lfo(rate: number, depth: number, param: AudioParam): void {
    const osc = this.ctx.createOscillator();
    osc.frequency.value = rate;
    const amount = this.gain(depth);
    osc.connect(amount).connect(param);
    osc.start();
  }
}
