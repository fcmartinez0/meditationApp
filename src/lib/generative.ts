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

// Diagnostics only in development — silent in production / App Store builds.
const dlog = (...args: unknown[]) => {
  if (__DEV__) console.log(...args);
};
const dwarn = (...args: unknown[]) => {
  if (__DEV__) console.warn(...args);
};

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

// Loop length and seamless-crossfade window. Render cost scales with ALL of
// these: a longer window means more scheduled nodes AND more samples to process,
// a higher sample rate means more DSP per node, and a longer reverb impulse
// means a heavier convolution. On a slow device (notably the iOS simulator) a
// generous window pushes the render long enough to look like a freeze. Keep it
// lean — the crossfade-fold still yields a seamless, varied loop, and shorter
// here is the single biggest lever on "time to first note".
const LOOP_SECONDS = 16;
const XFADE_SECONDS = 2;
const RENDER_SECONDS = LOOP_SECONDS + XFADE_SECONDS;
const IMPULSE_SECONDS = 0.7;
// 24 kHz (Nyquist 12 kHz) still covers the air/shimmer the pads need while
// cutting per-sample DSP ~25% vs 32 kHz; playback resamples to the device rate.
const RENDER_SR = 24000;
// The offline mix is baked at this level; the player's master scales on top.
const MIX_GAIN = 0.5;

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// Nearest-neighbour voice leading: move each pad voice to the closest tone of
// the new chord, keeping voices distinct so the chord never collapses. Minimal
// motion reads as musical part-writing rather than the whole pad lurching to a
// new root. Returns one MIDI note per voice.
function leadVoices(prev: number[], chordMidi: number[], count: number, root: number): number[] {
  // First chord (or a voice was added): spread the chord tones low to high,
  // doubling up from the bottom for any extra voices.
  if (prev.length < count) {
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      out.push(chordMidi[i % chordMidi.length] + (i >= chordMidi.length ? 12 : 0));
    }
    return out;
  }
  // Candidate pitches: every chord tone placed across the pad register.
  const lo = root - 2;
  const hi = root + 26;
  const cand: number[] = [];
  for (const t of chordMidi) {
    for (let m = t - 24; m <= t + 24; m += 12) {
      if (m >= lo && m <= hi) cand.push(m);
    }
  }
  const uniq = Array.from(new Set(cand)).sort((a, b) => a - b);
  // Greedy nearest assignment, lowest voice first, each tone used at most once.
  const order = prev.map((_, i) => i).sort((a, b) => prev[a] - prev[b]);
  const used = new Set<number>();
  const out = new Array<number>(count);
  for (const i of order) {
    let best = uniq[0];
    let bestD = Infinity;
    for (const c of uniq) {
      if (used.has(c)) continue;
      const d = Math.abs(c - prev[i]);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    used.add(best);
    out[i] = best;
  }
  return out;
}

// Gentle tanh soft-clip for the crossfade-fold safety net — applied in JS only
// to stray peaks that the fold's summing can create after the render.
function softClip(x: number): number {
  return Math.tanh(1.5 * x);
}

// A gentle tanh saturation curve for the master "glue": adds subtle analog
// warmth and rounds off peaks the way a mix-bus compressor would, baked into the
// off-thread render as one WaveShaper node. Near-linear at low levels, so it
// only colours the sound as the mix gets loud, never obviously distorting.
function makeSaturationCurve(amount = 1.6, n = 1024): Float32Array {
  const curve = new Float32Array(n);
  const k = Math.tanh(amount);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / k;
  }
  return curve;
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

// A short melodic motif: scale-degree steps between consecutive notes plus a
// relative rhythm. Phrases develop this through repetition, transposition and
// inversion so the lead reads as a composed line rather than a fresh random
// walk every time. Returns [steps, rhythm].
function makeMotif(rng: () => number): [number[], number[]] {
  const len = 3 + Math.floor(rng() * 3); // 3..5 notes
  const steps: number[] = [];
  const rhythm: number[] = [];
  for (let i = 0; i < len; i++) {
    const r = rng();
    // Mostly stepwise, sometimes a held repeat, occasionally a small leap.
    const step = r < 0.55 ? (rng() < 0.5 ? 1 : -1) : r < 0.78 ? 0 : rng() < 0.5 ? 2 : -2;
    steps.push(step);
    rhythm.push(rng() < 0.7 ? 1 : rng() < 0.5 ? 0.5 : 2);
  }
  return [steps, rhythm];
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

function configureSession(mixWithMusic: boolean): void {
  try {
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playback',
      iosMode: 'default',
      // Default: take over playback. Opt-in mixing lets the piece sit over the
      // user's own music instead of pausing it.
      iosOptions: mixWithMusic ? ['mixWithOthers'] : [],
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
  private voiceMidi: number[] = [];
  private motif: number[] = [];
  private motifRhythm: number[] = [];
  private phraseCount = 0;

  constructor(
    private ctx: OfflineAudioContext,
    private spec: PieceSpec,
  ) {
    this.rng = makeRng(spec.seed);
  }

  async render(): Promise<AudioBuffer> {
    dlog('[generative] building graph');
    this.build();
    dlog('[generative] graph built, scheduling events');
    await this.scheduleAll(RENDER_SECONDS);
    dlog('[generative] startRendering…');
    return this.ctx.startRendering();
  }

  // Yield to the JS event loop periodically while creating nodes, so building
  // the (large) graph never blocks the UI. The render itself already runs on a
  // native background thread.
  private ops = 0;
  private async breathe(): Promise<void> {
    if (++this.ops % 16 === 0) await new Promise<void>((r) => setTimeout(r, 0));
  }

  // Micro-timing: nudge a scheduled event by a few ms so grid-locked layers
  // (arp, comps, melody) feel played by hand rather than quantized. Clamped at 0
  // so a nudged-early event never schedules at a negative time.
  private hum(when: number, amt: number): number {
    return Math.max(0, when + (this.rng() * 2 - 1) * amt);
  }

  // Velocity: gentle per-note level variation around a base, for a human,
  // breathing dynamic instead of every note hitting at exactly the same volume.
  private vel(base: number, range = 0.3): number {
    return base * (1 - range / 2 + this.rng() * range);
  }

  private build(): void {
    const { ctx, spec } = this;
    const sustained = spec.instrument === 'pad' || spec.instrument === 'choir';

    const master = ctx.createGain();
    master.gain.value = MIX_GAIN;
    // A gentle high-shelf adds air/shimmer (the pieces read as too dark/muffled
    // otherwise). One node, created here — no effect on UI responsiveness.
    const air = ctx.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 6500;
    air.gain.value = 4;
    // Master glue: a gentle tanh saturator on the sum for warmth and cohesion,
    // and to round off peaks (the native engine has no compressor). 2x oversample
    // keeps the added harmonics from aliasing on bright material.
    const glue = ctx.createWaveShaper();
    glue.curve = makeSaturationCurve();
    glue.oversample = '2x';
    master.connect(glue).connect(air).connect(ctx.destination);

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
    // High-pass the echo input so bass notes don't pile up into a boomy mess in
    // the feedback line; the echoes stay clear and out of the low end's way.
    const delayHp = ctx.createBiquadFilter();
    delayHp.type = 'highpass';
    delayHp.frequency.value = 200;
    delaySend.connect(delayHp).connect(delay);
    this.delaySend = delaySend;

    // Reverb send (one convolver node — cheap to create; its cost is in the
    // off-thread render, so it no longer blocks the UI). This glue is what
    // makes the overlapping layers cohere instead of sounding scattered.
    const convolver = ctx.createConvolver();
    convolver.buffer = this.makeImpulse(IMPULSE_SECONDS, 2.2);
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = spec.section === 'rest' ? 0.42 : 0.3;
    convolver.connect(reverbWet).connect(master);
    // High-pass the reverb input so sub/bass energy doesn't wash the tail into
    // mud; keeps the space airy and the low end tight (a standard mixing move).
    const reverbHp = ctx.createBiquadFilter();
    reverbHp.type = 'highpass';
    reverbHp.frequency.value = 300;
    reverbHp.connect(convolver);
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 1;
    reverbSend.connect(reverbHp);
    this.reverbSend = reverbSend;

    const pulse = ctx.createGain();
    pulse.gain.value = 1;
    pulse.connect(master);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const baseCut = 2200 + spec.brightness * 9000;
    filter.frequency.value = baseCut;
    filter.Q.value = 0.4;
    filter.connect(pulse);

    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(filter);
    bus.connect(reverbSend); // pad feeds the reverb too

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
    [this.motif, this.motifRhythm] = makeMotif(this.rng);

    if (sustained) {
      const choir = spec.instrument === 'choir';
      const periodicWave = choir ? null : makeWave(ctx, spec.wave);
      // Triangle (not pure sine) as the dark-end floor so the pad always has
      // some upper harmonics — pure sine reads as muffled.
      const oscType: OscillatorType =
        choir || spec.wave === 'warm' ? 'sawtooth' : 'triangle';
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

    // Clean binaural beat (researched frequencies) for entrainment: two pure
    // carriers — one per ear — differing by spec.binauralHz, tuned to the root
    // so they blend musically. Routed straight to master (no filter/reverb) so
    // the beat stays pure. Subtle; needs headphones to perceive.
    if (spec.binauralHz > 0) {
      const carrier = midiToFreq(spec.root);
      for (const [offset, side] of [
        [0, -1],
        [spec.binauralHz, 1],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = carrier + offset;
        const g = ctx.createGain();
        g.gain.value = 0.08;
        const p = ctx.createStereoPanner();
        p.pan.value = side;
        osc.connect(g).connect(p).connect(master);
        osc.start();
      }
    }
  }

  private async scheduleAll(renderLen: number): Promise<void> {
    const { spec, ctx } = this;
    const sustained = spec.instrument === 'pad' || spec.instrument === 'choir';
    // Arrangement arc: lead/decorative layers swell toward the middle of the
    // loop and thin at the edges, so each loop "opens up" then settles. Pad and
    // bass stay constant as the foundation; the thin edges meet via the crossfade.
    const arc = (when: number) => 0.35 + 0.65 * Math.sin((Math.PI * when) / renderLen) ** 2;

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
          this.compNote(this.hum(when + i * 0.05, 0.012), midiToFreq(m), spec.instrument, bellWave, i % 2 ? 0.4 : -0.4),
        );
        await this.breathe();
      }
    }

    // Sparse chimes.
    if (spec.chimeDensity > 0.02) {
      let when = 3 + this.rng() * 16;
      while (when < renderLen) {
        if (this.rng() < arc(when)) this.playChime(this.hum(when, 0.02));
        when += (8 + this.rng() * 16) / Math.max(0.05, spec.chimeDensity);
        await this.breathe();
      }
    }

    // Steady arp + percussion grid.
    if (spec.arp || spec.percussion !== 'none') {
      const stepDur = 60 / spec.tempo / 4;
      // A little swing on the groovier Flow pieces delays the off-16ths so the
      // arp lilts instead of marching; Rest stays dead straight and still.
      const swing = spec.section === 'chill' ? stepDur * 0.16 : 0;
      let s = 0;
      for (let when = 0; when < renderLen; when += stepDur, s++) {
        this.chordTones = this.chordAt(when);
        const st = s % 16;
        if (spec.percussion !== 'none') this.triggerPercussion(st, when);
        if (spec.arp && this.rng() < arc(when)) this.triggerArp(st, when + (st % 2 ? swing : 0));
        await this.breathe();
      }
    }

    // Melodic lead phrases.
    if (spec.melody) {
      let when = 4 + this.rng() * 18;
      while (when < renderLen) {
        if (this.rng() < arc(when)) when = this.schedulePhrase(when);
        else when += 3 + this.rng() * 3; // rest near the edges
        await this.breathe();
      }
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
      const next = leadVoices(this.voiceMidi, tones, this.voices.length, spec.root);
      this.voiceMidi = next;
      this.voices.forEach((v, idx) => {
        const midi = next[idx];
        // Pad plays in tune; the binaural beat is a dedicated clean layer
        // (see build) rather than a detune smeared across the chord.
        const freq = midiToFreq(midi);
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
    const base = this.spec.section === 'rest' ? 0.05 : 0.08;
    this.arpNote(this.hum(when, 0.008), midiToFreq(midi), pan, this.vel(base));
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
    const baseLen = beat * (this.rng() < 0.5 ? 1 : 0.5);
    const gain = spec.section === 'rest' ? 0.08 : 0.1;
    const tones = this.chordAt(t0); // resolve the phrase onto the current chord

    // Alternate a "call" (ends open, hanging) with a "response" (resolves to a
    // chord tone), and develop the motif by exact repeat, transposition or
    // inversion — the building blocks of a singable, composed-sounding line.
    const isAnswer = this.phraseCount % 2 === 1;
    const v = this.rng();
    const invert = v < 0.3;
    const transpose = v >= 0.3 && v < 0.6 ? (this.rng() < 0.5 ? 2 : -2) : 0;
    this.phraseCount++;

    const motif = this.motif.length ? this.motif : [1, -1, 1];
    const rhythm = this.motifRhythm.length ? this.motifRhythm : [1, 1, 1];
    let degIdx = L + Math.floor(this.rng() * L) + transpose;
    let t = t0;
    for (let i = 0; i < motif.length; i++) {
      const last = i === motif.length - 1;
      const len = baseLen * rhythm[i];
      if (!last && this.rng() < 0.12) {
        t += len; // a breath
      } else {
        const midi =
          last && isAnswer && tones.length
            ? tones[Math.floor(this.rng() * tones.length)] + 12 // resolve the answer
            : spec.root + deg(degIdx) + 12;
        this.leadNote(this.hum(t, 0.014), midiToFreq(midi), len * (0.8 + this.rng() * 0.6), this.rng() * 0.4 - 0.2, this.vel(gain));
        t += len;
      }
      degIdx += invert ? -motif[i] : motif[i];
      degIdx = Math.max(L - 1, Math.min(2 * L + 2, degIdx));
    }
    // A call hangs briefly before its answer; an answer rests longer.
    return t + (isAnswer ? 3 + this.rng() * 4 : 1.5 + this.rng() * 1.5);
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
    g.gain.exponentialRampToValueAtTime(this.vel(0.1), when + 0.006);
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
    g.gain.exponentialRampToValueAtTime(this.vel(0.06), when + 0.02);
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

/**
 * Equal-power crossfade-fold a rendered buffer into a seamless loop, then
 * normalize it to a consistent loudness so pieces don't jump in volume from one
 * to the next. Runs on the JS thread (no native nodes), so it yields between
 * chunks: a full-length pass would otherwise block the UI for a noticeable beat
 * right as the "Composing" screen hands off to playback. Only samples that
 * actually approach clipping pay for the tanh; the rest pass through untouched.
 */
// Target loudness (RMS) and a hard peak ceiling. RMS targeting gives consistent
// *perceived* level (a lone loud transient won't drag the whole piece down the
// way peak-only normalization does), and the ceiling guarantees no clipping.
const TARGET_RMS = 0.15;
const PEAK_CEILING = 0.95;

async function foldLoop(
  rendered: AudioBuffer,
  loopSamples: number,
  xfSamples: number,
): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  const CHUNK = 65536; // yield roughly every ~2 s of samples
  let sumSquares = 0;
  let sampleCount = 0;
  let peak = 0;
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    const src = rendered.getChannelData(c);
    const dst = new Float32Array(loopSamples);
    dst.set(src.subarray(0, loopSamples));
    // Blend the tail [loop, loop+xf) over the head [0, xf) so the wrap is seamless.
    for (let i = 0; i < xfSamples; i++) {
      const t = i / xfSamples;
      dst[i] = src[i] * Math.sqrt(t) + src[loopSamples + i] * Math.sqrt(1 - t);
    }
    // Safety soft-clip stray fold peaks, and measure level for normalization.
    for (let i = 0; i < loopSamples; i++) {
      let x = dst[i];
      if (x > 0.6 || x < -0.6) {
        x = softClip(x);
        dst[i] = x;
      }
      const a = x < 0 ? -x : x;
      if (a > peak) peak = a;
      sumSquares += x * x;
      sampleCount++;
      if (i > 0 && i % CHUNK === 0) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }
    out.push(dst);
  }

  // Normalize toward a steady loudness, clamped so we never wildly boost a near-
  // silent piece, then pulled under the peak ceiling so it can't clip.
  const rms = Math.sqrt(sumSquares / Math.max(1, sampleCount));
  let gain = rms > 1e-5 ? TARGET_RMS / rms : 1;
  gain = Math.max(0.6, Math.min(2.2, gain));
  if (peak * gain > PEAK_CEILING) gain = peak > 1e-5 ? PEAK_CEILING / peak : gain;
  if (Math.abs(gain - 1) > 0.02) {
    for (const dst of out) {
      for (let i = 0; i < dst.length; i++) {
        dst[i] *= gain;
        if (i > 0 && i % CHUNK === 0) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }
    }
  }
  return out;
}

export type LoopData = { data: Float32Array[]; length: number; sampleRate: number };

// The native audio engine deadlocks if an offline render runs concurrently with
// another render or with a *live realtime context* — which is exactly what froze
// the second session (its on-demand render overlapped the first session's still-
// running playback context). Serialize every render behind this lock and suspend
// any live realtime context for the render's duration.
let renderLock: Promise<void> = Promise.resolve();

async function renderLoop(spec: PieceSpec): Promise<LoopData | null> {
  const prev = renderLock;
  let release!: () => void;
  renderLock = new Promise<void>((r) => (release = r));
  await prev; // wait for any in-flight render to finish

  const realtime = sharedCtx;
  const wasRunning = !!realtime && realtime.state === 'running';
  try {
    if (wasRunning && realtime) {
      try {
        await realtime.suspend();
      } catch {
        /* best effort */
      }
    }
    const sr = RENDER_SR;
    dlog('[generative] creating OfflineAudioContext', RENDER_SECONDS, 's @', sr, 'Hz');
    // CRITICAL: never abandon an in-flight render. `startRendering()` runs on a
    // detached native thread that the library gives us no way to cancel. If we
    // returned early (e.g. on a timeout) and dropped this `offline` reference,
    // Hermes GC would finalize the context and free its audio graph *while that
    // thread is still reading it* — a use-after-free that crashes with SIGSEGV.
    // So we hold `offline` and await the render to completion no matter what; the
    // render window is short and the lock guarantees only one runs at a time.
    const offline = new OfflineAudioContext(2, Math.ceil(RENDER_SECONDS * sr), sr);
    const rendered = await new Composer(offline, spec).render();
    dlog('[generative] render complete, folding loop');
    const loopSamples = Math.floor(LOOP_SECONDS * sr);
    const xfSamples = Math.floor(XFADE_SECONDS * sr);
    const data = await foldLoop(rendered, loopSamples, xfSamples);
    return { data, length: loopSamples, sampleRate: sr };
  } finally {
    if (wasRunning && realtime) {
      try {
        await realtime.resume();
      } catch {
        /* resumes on next playback */
      }
    }
    release();
  }
}

// --- Background pre-render -------------------------------------------------
// Rendering takes a few seconds, so we do it ahead of time (at app launch and
// while the user is on the home) and stash the result. The session takes it for
// an instant start. Crucially, if a prefetch for the right section is still
// in flight when the session starts, the session *awaits that same render*
// rather than kicking off a second one — rendering twice back-to-back was the
// main cause of the "Composing" hang.
let pending: { spec: PieceSpec; loop: LoopData | null } | null = null;
let inFlight: { section: Section; promise: Promise<void> } | null = null;

function runPrefetch(section: Section): Promise<void> {
  const promise = (async () => {
    dlog('[generative] prefetch start for', section);
    try {
      const ratings = await loadRatings();
      const spec = nextSpec(section, ratings);
      pending = { spec, loop: null };
      const loop = await renderLoop(spec);
      if (pending && pending.spec.seed === spec.seed) pending.loop = loop;
      else pending = null;
    } catch (e) {
      dwarn('[generative] prefetch failed', e);
      pending = null;
    }
  })();
  inFlight = { section, promise };
  void promise.finally(() => {
    if (inFlight && inFlight.promise === promise) inFlight = null;
  });
  return promise;
}

/** Pre-render the next piece for a section, if not already prepared/in flight. */
export async function prefetchGenerative(section: Section): Promise<void> {
  if (inFlight && inFlight.section === section) return inFlight.promise;
  if (pending && pending.spec.section === section && pending.loop) return; // ready
  return runPrefetch(section);
}

/**
 * Take a ready (or in-flight) pre-rendered piece for a section. If a prefetch
 * for this section is still rendering, this awaits it instead of letting the
 * caller start a duplicate render. Returns null only if nothing was prepared.
 */
export async function takeGenerative(
  section: Section,
): Promise<{ spec: PieceSpec; loop: LoopData } | null> {
  if (inFlight && inFlight.section === section) {
    await inFlight.promise.catch(() => {});
  }
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
   * Pass a pre-rendered `preloaded` loop (from takeGenerative) to start instantly.
   */
  async start(spec: PieceSpec, preloaded?: LoopData | null, mixWithMusic = false): Promise<boolean> {
    this.stopped = false;
    try {
      configureSession(mixWithMusic);
      try {
        await AudioManager.setAudioSessionActivity(true);
      } catch (e) {
        dwarn('[generative] audio session activate failed', e);
      }

      let loop: LoopData | null = preloaded ?? null;
      if (!loop) {
        const t0 = Date.now();
        try {
          // renderLoop awaits the native render to completion (it must never be
          // abandoned mid-flight — see the note there) and returns null only if
          // it produced nothing, in which case we fall back to a track.
          loop = await renderLoop(spec);
        } catch (e) {
          dwarn('[generative] offline render threw', e);
          return false;
        }
        dlog('[generative] rendered in', Date.now() - t0, 'ms, samples', loop?.length);
      } else {
        dlog('[generative] using pre-rendered loop');
      }
      if (this.stopped) return false;
      if (!loop) {
        dwarn('[generative] render returned null');
        return false;
      }

      const ctx = getCtx();
      if (!ctx) {
        dwarn('[generative] no realtime AudioContext');
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
      dlog('[generative] playing loop');
      return true;
    } catch (e) {
      dwarn('[generative] start failed', e);
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
