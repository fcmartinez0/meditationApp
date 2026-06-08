/**
 * Native generative music — offline-render hybrid.
 *
 * The web build (generative.web.ts) synthesizes live with the Web Audio API.
 * On phones, live JS-scheduled synthesis hits a glitch ceiling (pops and
 * dropouts under thread load), so here we take a different, rock-solid path:
 *
 *   1. Render a unique piece *offline* (faster than realtime) with
 *      react-native-audio-api's OfflineAudioContext — all events scheduled on
 *      the audio clock, no wall-clock timers.
 *   2. Crossfade-fold the result into a seamless loop.
 *   3. Play that single AudioBuffer back on the realtime context.
 *
 * During playback there is no node churn and no JS scheduling, so it cannot
 * pop or drop out. Variety is preserved: every session renders a fresh piece
 * from the spec's seed. The cost is a short "composing" wait at the start.
 *
 * Requires a native build (`npx expo run:ios` / `run:android`).
 */

import { AudioContext, AudioManager, OfflineAudioContext } from 'react-native-audio-api';
import type {
  AudioBuffer,
  AudioBufferSourceNode,
  BiquadFilterNode,
  GainNode,
  OscillatorNode,
  OscillatorType,
  PeriodicWave,
  StereoPannerNode,
} from 'react-native-audio-api';

import { loadRatings, nextSpec } from './preferences';
import type { PieceSpec, Section } from './types';

const SCALES: Record<string, number[]> = {
  major_pentatonic: [0, 2, 4, 7, 9],
  minor_pentatonic: [0, 3, 5, 7, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
};

const VOICINGS = [
  [0, 2, 4, 6], // 7th
  [0, 1, 4, 6], // sus2
  [0, 3, 4, 6], // sus4
  [0, 2, 4, 8], // add9
  [0, 4, 6, 8], // open / quartal
];

const ARP_PATTERNS = [
  [0, 2, 1, 3, 2, 4, 1, 2],
  [0, 1, 2, 3, 4, 3, 2, 1],
  [0, 2, 4, 2, 1, 3, 1, 0],
  [0, 3, 1, 4, 2, 0, 3, 1],
  [4, 3, 2, 1, 0, 1, 2, 3],
];

const PROGRESSIONS = [
  [0, 0, 0, 0],
  [0, 3, 4, 0],
  [0, 5, 3, 4],
  [0, 4, 5, 3],
  [0, 2, 4, 5],
  [0, 5, 1, 4],
  [0, 6, 4, 5],
  [0, 3, 0, 4],
];

// Loop length and seamless-crossfade window.
const LOOP_SECONDS = 40;
const XFADE_SECONDS = 4;
const RENDER_SECONDS = LOOP_SECONDS + XFADE_SECONDS;
const IMPULSE_SECONDS = 1.2;
// Render at a reduced rate — ambient content has little above ~10 kHz, and
// halving the rate roughly halves render time. Playback resamples to device.
const RENDER_SR = 24000;
// The offline mix is baked at this level; the player's master scales on top.
const MIX_GAIN = 0.5;

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function makeWave(ctx: OfflineAudioContext, kind: string): PeriodicWave | null {
  if (kind === 'bell') {
    const imag = new Float32Array([0, 1, 0.6, 0.25, 0.0, 0.12, 0, 0.05]);
    return ctx.createPeriodicWave(new Float32Array(imag.length), imag);
  }
  if (kind === 'glass') {
    const imag = new Float32Array([0, 1, 0, 0.5, 0, 0.33, 0, 0.2, 0, 0.14]);
    return ctx.createPeriodicWave(new Float32Array(imag.length), imag);
  }
  return null;
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

let sharedCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    if (!sharedCtx) sharedCtx = new AudioContext();
    return sharedCtx;
  } catch {
    return null;
  }
}

function configureSession(): void {
  try {
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playback',
      iosMode: 'default',
      iosOptions: ['mixWithOthers'],
    });
  } catch {
    /* platform defaults */
  }
}

export const GENERATIVE_SUPPORTED = true;

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  pan: StereoPannerNode;
  side: number;
}

/**
 * Builds the full audio graph on an OfflineAudioContext and schedules every
 * event deterministically across the render window, then renders to a buffer.
 */
class Composer {
  private master: GainNode | null = null;
  private pulseGain: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private delaySend: GainNode | null = null;
  private voices: Voice[] = [];
  private bass: { osc: OscillatorNode; gain: GainNode } | null = null;
  private noise: AudioBuffer | null = null;
  private rng: () => number;
  private chordTones: number[] = [];
  private chordEvents: { time: number; tones: number[] }[] = [];
  private chordStep = 0;
  private arpIdx = 0;
  private arpPattern: number[] = ARP_PATTERNS[0];
  private arpEvery = 2;
  private voicing: number[] = VOICINGS[0];

  constructor(
    private ctx: OfflineAudioContext,
    private spec: PieceSpec,
  ) {
    this.rng = makeRng(spec.seed);
  }

  async render(): Promise<AudioBuffer> {
    this.build();
    this.scheduleAll(RENDER_SECONDS);
    return this.ctx.startRendering();
  }

  private build(): void {
    const { ctx, spec } = this;
    const sustained = spec.instrument === 'pad' || spec.instrument === 'choir';

    const master = ctx.createGain();
    master.gain.value = MIX_GAIN;
    master.connect(ctx.destination);

    // Tempo-synced feedback delay.
    const delay = ctx.createDelay(2);
    delay.delayTime.value = (60 / spec.tempo) * 0.75;
    const delayFb = ctx.createGain();
    delayFb.gain.value = 0.34;
    const delayLp = ctx.createBiquadFilter();
    delayLp.type = 'lowpass';
    delayLp.frequency.value = 2600;
    delay.connect(delayLp).connect(delayFb).connect(delay);
    const delayWet = ctx.createGain();
    delayWet.gain.value = 0.3;
    delay.connect(delayWet).connect(master);
    const delaySend = ctx.createGain();
    delaySend.gain.value = 1;
    delaySend.connect(delay);
    this.delaySend = delaySend;

    // Reverb send.
    const convolver = ctx.createConvolver();
    convolver.buffer = this.makeImpulse(IMPULSE_SECONDS, 2.4);
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = spec.section === 'rest' ? 0.4 : 0.28;
    convolver.connect(reverbWet).connect(master);
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 1;
    reverbSend.connect(convolver);
    this.reverbSend = reverbSend;

    const pulse = ctx.createGain();
    pulse.gain.value = 1;
    pulse.connect(master);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const baseCut = 500 + spec.brightness * 3800;
    filter.frequency.value = baseCut;
    filter.Q.value = 0.4;
    filter.connect(pulse);

    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(filter);
    bus.connect(reverbSend);

    // Chorus.
    const chorus = ctx.createDelay(0.05);
    chorus.delayTime.value = 0.022;
    const chorusLfo = ctx.createOscillator();
    chorusLfo.frequency.value = 0.22;
    const chorusDepth = ctx.createGain();
    chorusDepth.gain.value = 0.004;
    chorusLfo.connect(chorusDepth).connect(chorus.delayTime);
    chorusLfo.start();
    const chorusWet = ctx.createGain();
    chorusWet.gain.value = 0.5;
    bus.connect(chorus);
    chorus.connect(chorusWet).connect(filter);

    this.master = master;
    this.pulseGain = pulse;

    // Noise for shakers.
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = new Float32Array(noise.length);
    for (let i = 0; i < nd.length; i++) nd[i] = this.rng() * 2 - 1;
    noise.copyToChannel(nd, 0);
    this.noise = noise;

    // Slow filter movement.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.02 + this.rng() * 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = baseCut * 0.35;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    // Amplitude pump.
    if (spec.pulseDepth > 0) {
      const pumpLfo = ctx.createOscillator();
      pumpLfo.type = 'sine';
      pumpLfo.frequency.value = spec.tempo / 60;
      const depth = ctx.createGain();
      depth.gain.value = spec.pulseDepth / 2;
      pulse.gain.value = 1 - spec.pulseDepth / 2;
      pumpLfo.connect(depth).connect(pulse.gain);
      pumpLfo.start();
    }

    this.voicing = VOICINGS[Math.floor(this.rng() * VOICINGS.length)];
    this.arpPattern = ARP_PATTERNS[Math.floor(this.rng() * ARP_PATTERNS.length)];
    this.arpEvery = [2, 2, 2, 1, 4][Math.floor(this.rng() * 5)];

    if (sustained) {
      const choir = spec.instrument === 'choir';
      const periodicWave = choir ? null : makeWave(ctx, spec.wave);
      const oscType: OscillatorType = choir
        ? 'sawtooth'
        : spec.wave === 'warm'
          ? 'sawtooth'
          : spec.wave === 'triangle'
            ? 'triangle'
            : 'sine';
      const voiceCount = spec.section === 'chill' ? 5 : 4;
      const drift = ctx.createOscillator();
      drift.type = 'sine';
      drift.frequency.value = 0.05 + this.rng() * 0.08;
      const driftGain = ctx.createGain();
      driftGain.gain.value = (choir ? 7 : 4) + this.rng() * 4;
      drift.connect(driftGain);
      drift.start();
      for (let i = 0; i < voiceCount; i++) {
        const osc = ctx.createOscillator();
        if (periodicWave) osc.setPeriodicWave(periodicWave);
        else osc.type = oscType;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const pan = ctx.createStereoPanner();
        const side = i % 2 === 0 ? -1 : 1;
        pan.pan.value = side * (0.3 + this.rng() * 0.5);
        driftGain.connect(osc.detune);
        osc.connect(gain).connect(pan).connect(bus);
        osc.start();
        this.voices.push({ osc, gain, pan, side });
      }
    }

    // Sub-bass at a constant level (no per-loop fade); frequency tracks chords.
    if (spec.bass) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = midiToFreq(spec.root - 12);
      const gain = ctx.createGain();
      gain.gain.value = 0.16;
      osc.connect(gain).connect(pulse);
      osc.start();
      this.bass = { osc, gain };
    }
  }

  private scheduleAll(renderLen: number): void {
    const { spec, ctx } = this;
    const sustained = spec.instrument === 'pad' || spec.instrument === 'choir';

    // Chord progression across the whole render (also feeds chordAt lookups).
    this.chordStep = Math.floor(this.rng() * PROGRESSIONS[spec.progression % PROGRESSIONS.length].length);
    const interval = Math.max(4, spec.chordChangeSec);
    for (let when = 0, first = true; when < renderLen + interval; when += interval, first = false) {
      this.applyChord(when, first);
    }

    // Plucked archetypes re-strum the active chord on a slow grid.
    if (!sustained) {
      const beat = 60 / spec.tempo;
      const every = [beat * 2, beat * 3, beat * 4][Math.floor(this.rng() * 3)];
      const bellWave = spec.instrument === 'bells' ? makeWave(ctx, 'bell') : null;
      for (let when = 0.3; when < renderLen; when += every) {
        const tones = this.chordAt(when);
        const order = this.rng() < 0.5 ? tones : [...tones].reverse();
        order.forEach((m, i) =>
          this.compNote(when + i * 0.05, midiToFreq(m), spec.instrument, bellWave, i % 2 ? 0.4 : -0.4),
        );
      }
    }

    // Sparse chimes.
    if (spec.chimeDensity > 0.02) {
      let when = 3 + this.rng() * 16;
      while (when < renderLen) {
        this.playChime(when);
        when += (5 + this.rng() * 12) / Math.max(0.05, spec.chimeDensity);
      }
    }

    // Steady arp + percussion grid.
    if (spec.arp || spec.percussion !== 'none') {
      const stepDur = 60 / spec.tempo / 4;
      let s = 0;
      for (let when = 0; when < renderLen; when += stepDur, s++) {
        this.chordTones = this.chordAt(when);
        const st = s % 16;
        if (spec.percussion !== 'none') this.triggerPercussion(st, when);
        if (spec.arp) this.triggerArp(st, when);
      }
    }

    // Melodic lead phrases.
    if (spec.melody) {
      let when = 4 + this.rng() * 18;
      while (when < renderLen) when = this.schedulePhrase(when);
    }
  }

  private chordAt(t: number): number[] {
    let tones = this.chordEvents.length ? this.chordEvents[0].tones : [];
    for (const e of this.chordEvents) {
      if (e.time <= t) tones = e.tones;
      else break;
    }
    return tones;
  }

  private applyChord(when: number, initial: boolean): void {
    const { ctx, spec } = this;
    const scale = SCALES[spec.scale] ?? SCALES.major_pentatonic;
    const L = scale.length;
    const deg = (x: number) => 12 * Math.floor(x / L) + scale[((x % L) + L) % L];
    const prog = PROGRESSIONS[spec.progression % PROGRESSIONS.length];
    const base = prog[this.chordStep % prog.length];
    this.chordStep++;
    const chord = this.voicing.map((o) => deg(base + o));
    const tones = chord.map((c) => spec.root + c);
    this.chordEvents.push({ time: when, tones });

    const glide = initial ? 2 : 6;
    if (this.voices.length) {
      const notes: number[] = [spec.root + chord[0], spec.root + chord[0] + 12];
      for (let i = 0; i < this.voices.length - 2; i++) {
        notes.push(spec.root + chord[i % 4] + (i >= 4 ? 12 : 0));
      }
      this.voices.forEach((v, idx) => {
        const midi = notes[idx % notes.length];
        const freq = midiToFreq(midi) + (spec.binauralHz / 2) * v.side;
        const target = (0.7 / this.voices.length) * (0.7 + 0.6 * this.rng());
        if (initial) {
          v.osc.frequency.setValueAtTime(freq, when);
          v.gain.gain.setValueAtTime(target, when);
        } else {
          v.osc.frequency.setTargetAtTime(freq, when, glide / 3);
          v.gain.gain.setTargetAtTime(target, when, glide / 3);
        }
      });
    }
    if (this.bass) {
      const bf = midiToFreq(spec.root + chord[0] - 12);
      if (initial) this.bass.osc.frequency.setValueAtTime(bf, when);
      else this.bass.osc.frequency.setTargetAtTime(bf, when, glide / 3);
    }
  }

  private triggerPercussion(s: number, when: number): void {
    const rest = this.spec.section === 'rest';
    const kg = rest ? 0.16 : 0.3;
    const sg = rest ? 0.05 : 0.09;
    switch (this.spec.percussion) {
      case 'heartbeat':
        if (s === 0) this.softKick(when, kg);
        if (s === 2) this.softKick(when, kg * 0.6);
        if (s === 8) this.softKick(when, kg * 0.8);
        if (s === 10) this.softKick(when, kg * 0.5);
        break;
      case 'pulse':
        if (s % 4 === 0) this.softKick(when, kg);
        break;
      case 'shaker':
        if (s === 0 || s === 8) this.softKick(when, kg * 0.8);
        if (s % 4 === 2) this.shaker(when, sg);
        break;
      case 'broken':
        if (s === 0 || s === 6 || s === 10) this.softKick(when, kg);
        if (s === 4 || s === 12 || s === 14) this.shaker(when, sg);
        break;
      case 'offbeat':
        if (s === 0 || s === 8) this.softKick(when, kg * 0.85);
        if (s % 4 === 2) this.shaker(when, sg * 1.2);
        else if (s % 2 === 1) this.shaker(when, sg * 0.5);
        break;
      case 'tribal':
        if (s === 0 || s === 3 || s === 6 || s === 10 || s === 13) this.softKick(when, kg * 0.7);
        if (s === 4 || s === 12) this.shaker(when, sg);
        break;
      default:
        break;
    }
  }

  private triggerArp(s: number, when: number): void {
    if (s % this.arpEvery !== 0 || this.chordTones.length === 0) return;
    const deg = this.arpPattern[this.arpIdx % this.arpPattern.length] % this.chordTones.length;
    const midi = this.chordTones[deg] + 12;
    const pan = this.arpIdx % 2 === 0 ? -0.6 : 0.6;
    this.arpIdx++;
    this.arpNote(when, midiToFreq(midi), pan, this.spec.section === 'rest' ? 0.05 : 0.08);
  }

  private softKick(when: number, gain: number): void {
    const { ctx, master } = this;
    if (!master) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(78, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.28);
    osc.connect(g).connect(master);
    osc.start(when);
    osc.stop(when + 0.32);
  }

  private shaker(when: number, gain: number): void {
    const { ctx, noise, master } = this;
    if (!noise || !master) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    const pan = ctx.createStereoPanner();
    pan.pan.value = this.rng() * 0.6 - 0.3;
    src.connect(hp).connect(g).connect(pan).connect(master);
    src.start(when, this.rng() * 0.5);
    src.stop(when + 0.1);
  }

  private leadNote(when: number, freq: number, dur: number, pan: number, gain: number): void {
    const { ctx, pulseGain } = this;
    if (!pulseGain) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, when);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vibGain = ctx.createGain();
    vibGain.gain.value = freq * 0.006;
    vib.connect(vibGain).connect(osc.frequency);
    vib.start(when);
    vib.stop(when + dur + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    osc.connect(g).connect(p);
    p.connect(pulseGain);
    if (this.reverbSend) p.connect(this.reverbSend);
    if (this.delaySend) p.connect(this.delaySend);
    osc.start(when);
    osc.stop(when + dur + 0.06);
  }

  private schedulePhrase(t0: number): number {
    const { spec } = this;
    const scale = SCALES[spec.scale] ?? SCALES.major_pentatonic;
    const L = scale.length;
    const deg = (x: number) => 12 * Math.floor(x / L) + scale[((x % L) + L) % L];
    const beat = 60 / spec.tempo;
    const noteLen = beat * (this.rng() < 0.5 ? 1 : 0.5);
    const notes = 3 + Math.floor(this.rng() * 4);
    const gain = spec.section === 'rest' ? 0.1 : 0.13;
    let t = t0;
    let degIdx = L + Math.floor(this.rng() * L);
    for (let i = 0; i < notes; i++) {
      if (this.rng() < 0.18) {
        t += noteLen;
      } else {
        const midi = spec.root + deg(degIdx) + 12;
        this.leadNote(t, midiToFreq(midi), noteLen * (0.8 + this.rng() * 0.7), this.rng() * 0.4 - 0.2, gain);
        t += noteLen;
      }
      degIdx += this.rng() < 0.7 ? (this.rng() < 0.5 ? 1 : -1) : this.rng() < 0.5 ? 2 : -2;
      degIdx = Math.max(L - 1, Math.min(2 * L + 2, degIdx));
    }
    return t + 2 + this.rng() * 4;
  }

  private arpNote(when: number, freq: number, pan: number, gain: number): void {
    const { ctx, pulseGain } = this;
    if (!pulseGain) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    osc.connect(g).connect(p);
    p.connect(pulseGain);
    if (this.reverbSend) p.connect(this.reverbSend);
    if (this.delaySend) p.connect(this.delaySend);
    osc.start(when);
    osc.stop(when + 0.55);
  }

  private compNote(
    when: number,
    freq: number,
    instrument: string,
    bellWave: PeriodicWave | null,
    pan: number,
  ): void {
    const { ctx, pulseGain } = this;
    if (!pulseGain) return;
    const osc = ctx.createOscillator();
    let dur: number;
    if (instrument === 'keys') {
      osc.type = 'sine';
      osc.frequency.value = freq;
      const mod = ctx.createOscillator();
      mod.type = 'sine';
      mod.frequency.value = freq * 14;
      const modG = ctx.createGain();
      modG.gain.setValueAtTime(freq * 2.2, when);
      modG.gain.exponentialRampToValueAtTime(freq * 0.1, when + 0.4);
      mod.connect(modG).connect(osc.frequency);
      mod.start(when);
      mod.stop(when + 1.6);
      dur = 1.4;
    } else if (instrument === 'bells' && bellWave) {
      osc.setPeriodicWave(bellWave);
      osc.frequency.value = freq;
      dur = 2.6;
    } else {
      osc.type = 'triangle';
      osc.frequency.value = freq;
      dur = 1.2;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.1, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    osc.connect(g).connect(p);
    p.connect(pulseGain);
    if (this.reverbSend) p.connect(this.reverbSend);
    if (this.delaySend) p.connect(this.delaySend);
    osc.start(when);
    osc.stop(when + dur + 0.1);
  }

  private playChime(when: number): void {
    const { ctx, spec, master } = this;
    if (!master) return;
    const scale = SCALES[spec.scale] ?? SCALES.major_pentatonic;
    const d = scale[Math.floor(this.rng() * scale.length)];
    const midi = spec.root + 12 + d + (this.rng() < 0.4 ? 12 : 0);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = midiToFreq(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.09, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 3);
    const pan = ctx.createStereoPanner();
    pan.pan.value = this.rng() * 2 - 1;
    osc.connect(g).connect(pan);
    pan.connect(master);
    if (this.reverbSend) pan.connect(this.reverbSend);
    osc.start(when);
    osc.stop(when + 3.2);
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const { ctx } = this;
    const len = Math.floor(seconds * ctx.sampleRate);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = new Float32Array(len);
      for (let i = 0; i < len; i++) d[i] = (this.rng() * 2 - 1) * Math.pow(1 - i / len, decay);
      buf.copyToChannel(d, ch);
    }
    return buf;
  }
}

/** Equal-power crossfade-fold a rendered buffer into a seamless loop. */
function foldLoop(rendered: AudioBuffer, loopSamples: number, xfSamples: number): Float32Array[] {
  const out: Float32Array[] = [];
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    const src = rendered.getChannelData(c);
    const dst = new Float32Array(loopSamples);
    dst.set(src.subarray(0, loopSamples));
    // Blend the tail [loop, loop+xf) over the head [0, xf) so the wrap is seamless.
    for (let i = 0; i < xfSamples; i++) {
      const t = i / xfSamples;
      dst[i] = src[i] * Math.sqrt(t) + src[loopSamples + i] * Math.sqrt(1 - t);
    }
    out.push(dst);
  }
  return out;
}

export type LoopData = { data: Float32Array[]; length: number; sampleRate: number };

async function renderLoop(spec: PieceSpec): Promise<LoopData | null> {
  const sr = RENDER_SR;
  const offline = new OfflineAudioContext(2, Math.ceil(RENDER_SECONDS * sr), sr);
  const rendered = await new Composer(offline, spec).render();
  const loopSamples = Math.floor(LOOP_SECONDS * sr);
  const xfSamples = Math.floor(XFADE_SECONDS * sr);
  return { data: foldLoop(rendered, loopSamples, xfSamples), length: loopSamples, sampleRate: sr };
}

// --- Background pre-render -------------------------------------------------
// Rendering takes a few seconds, so we do it ahead of time (while the user is
// still on the home) and stash the result. The session claims it for an
// instant start; if nothing is ready it just renders on demand.
let pending: { spec: PieceSpec; loop: LoopData | null } | null = null;
let prefetching = false;

/** Pre-render the next piece for a section, if not already prepared. */
export async function prefetchGenerative(section: Section): Promise<void> {
  if (prefetching) return;
  if (pending && pending.spec.section === section && pending.loop) return; // ready
  prefetching = true;
  try {
    const ratings = await loadRatings();
    const spec = nextSpec(section, ratings);
    pending = { spec, loop: null };
    const loop = await renderLoop(spec);
    if (pending && pending.spec.seed === spec.seed) pending.loop = loop;
    else pending = null;
  } catch (e) {
    console.warn('[generative] prefetch failed', e);
    pending = null;
  } finally {
    prefetching = false;
  }
}

/** Take a ready pre-rendered piece for a section, or null if none is ready. */
export function claimGenerative(section: Section): { spec: PieceSpec; loop: LoopData } | null {
  if (pending && pending.spec.section === section && pending.loop) {
    const claimed = { spec: pending.spec, loop: pending.loop };
    pending = null;
    return claimed;
  }
  return null;
}

/** Plays a pre-rendered, seamlessly-looping generative piece. */
export class GenerativeEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private targetGain = 0.85;
  private stopped = false;

  /**
   * Returns true once the loop is playing; false on any failure.
   * Pass a pre-rendered `preloaded` loop (from claimGenerative) to start instantly.
   */
  async start(spec: PieceSpec, preloaded?: LoopData | null): Promise<boolean> {
    this.stopped = false;
    try {
      configureSession();
      try {
        await AudioManager.setAudioSessionActivity(true);
      } catch (e) {
        console.warn('[generative] audio session activate failed', e);
      }

      let loop: LoopData | null = preloaded ?? null;
      if (!loop) {
        const t0 = Date.now();
        try {
          // Never hang forever — if the render stalls, fall back to a track.
          loop = await Promise.race([
            renderLoop(spec),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000)),
          ]);
        } catch (e) {
          console.warn('[generative] offline render threw', e);
          return false;
        }
        console.log('[generative] rendered in', Date.now() - t0, 'ms, samples', loop?.length);
      } else {
        console.log('[generative] using pre-rendered loop');
      }
      if (this.stopped) return false;
      if (!loop) {
        console.warn('[generative] render returned null');
        return false;
      }

      const ctx = getCtx();
      if (!ctx) {
        console.warn('[generative] no realtime AudioContext');
        return false;
      }
      this.ctx = ctx;
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          /* resumes when possible */
        }
      }

      const buffer = ctx.createBuffer(2, loop.length, loop.sampleRate);
      buffer.copyToChannel(loop.data[0], 0);
      buffer.copyToChannel(loop.data[1], 1);

      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(this.targetGain, now + 2.5);
      master.connect(ctx.destination);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(master);
      src.start();

      this.master = master;
      this.source = src;
      console.log('[generative] playing loop');
      return true;
    } catch (e) {
      console.warn('[generative] start failed', e);
      return false;
    }
  }

  setVolume(v: number): void {
    this.targetGain = Math.max(0, Math.min(1, v));
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
    master.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.targetGain), now + 0.2);
  }

  pause(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  }

  resume(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
    master.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.targetGain), now + 0.4);
  }

  stop(): void {
    this.stopped = true;
    const ctx = this.ctx;
    const master = this.master;
    const src = this.source;
    if (ctx && master) {
      const now = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      } catch {
        /* ignore */
      }
    }
    setTimeout(() => {
      try {
        src?.stop();
      } catch {}
      try {
        src?.disconnect();
      } catch {}
      try {
        master?.disconnect();
      } catch {}
    }, 1400);
    this.master = null;
    this.source = null;
    this.ctx = null;
  }
}
