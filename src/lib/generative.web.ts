/**
 * Live, never-repeating meditation music, synthesized in the Web Audio API.
 *
 * Layers, all driven by the spec's seed so a given spec evolves the same way:
 *  - a pad of oscillator voices that glide to a new chord every chordChangeSec
 *  - a slow filter LFO for movement and an optional amplitude "pump"
 *  - an optional sub-bass drone on the root
 *  - an optional arpeggio that picks chord tones on a tempo grid
 *  - one of several soft percussion patterns (heartbeat / pulse / shaker / broken)
 *  - sparse chimes on scale tones
 */

import type { PieceSpec, Section } from './types';

// Web synthesizes live and instantly, so there's nothing to pre-render or take.
export async function prefetchGenerative(_section: Section): Promise<void> {}
export async function takeGenerative(_section: Section): Promise<null> {
  return null;
}

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

// Four-note chord voicings as scale-degree offsets from the chord root.
const VOICINGS = [
  [0, 2, 4, 6], // 7th
  [0, 1, 4, 6], // sus2
  [0, 3, 4, 6], // sus4
  [0, 2, 4, 8], // add9
  [0, 4, 6, 8], // open / quartal
];

const ARP_PATTERNS = [
  [0, 2, 1, 3, 2, 4, 1, 2],
  [0, 1, 2, 3, 4, 3, 2, 1], // up & down
  [0, 2, 4, 2, 1, 3, 1, 0],
  [0, 3, 1, 4, 2, 0, 3, 1], // wider leaps
  [4, 3, 2, 1, 0, 1, 2, 3], // descending
];

// Chord-root movement as scale-degree sequences (index 0 is a static drone).
const PROGRESSIONS = [
  [0, 0, 0, 0], // drone — no movement
  [0, 3, 4, 0], // I – IV – V – I
  [0, 5, 3, 4], // I – vi – IV – V
  [0, 4, 5, 3], // I – V – vi – IV
  [0, 2, 4, 5],
  [0, 5, 1, 4],
  [0, 6, 4, 5],
  [0, 3, 0, 4],
];

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// A short melodic motif: scale-degree steps plus a relative rhythm. Phrases
// develop it through repetition, transposition and inversion so the lead reads
// as a composed line rather than a fresh random walk. Returns [steps, rhythm].
function makeMotif(rng: () => number): [number[], number[]] {
  const len = 3 + Math.floor(rng() * 3);
  const steps: number[] = [];
  const rhythm: number[] = [];
  for (let i = 0; i < len; i++) {
    const r = rng();
    const step = r < 0.55 ? (rng() < 0.5 ? 1 : -1) : r < 0.78 ? 0 : rng() < 0.5 ? 2 : -2;
    steps.push(step);
    rhythm.push(rng() < 0.7 ? 1 : rng() < 0.5 ? 0.5 : 2);
  }
  return [steps, rhythm];
}

// Nearest-neighbour voice leading: move each pad voice to the closest tone of
// the new chord, keeping voices distinct so the chord never collapses. Minimal
// motion reads as musical part-writing rather than the whole pad lurching to a
// new root. Returns one MIDI note per voice.
function leadVoices(prev: number[], chordMidi: number[], count: number, root: number): number[] {
  if (prev.length < count) {
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      out.push(chordMidi[i % chordMidi.length] + (i >= chordMidi.length ? 12 : 0));
    }
    return out;
  }
  const lo = root - 2;
  const hi = root + 26;
  const cand: number[] = [];
  for (const t of chordMidi) {
    for (let m = t - 24; m <= t + 24; m += 12) {
      if (m >= lo && m <= hi) cand.push(m);
    }
  }
  const uniq = Array.from(new Set(cand)).sort((a, b) => a - b);
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

// Custom timbres so pieces sound like different instruments, not just a sine pad.
function makeWave(ctx: AudioContext, kind: string): PeriodicWave | null {
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
let resumeHooked = false;

function hookResume() {
  if (resumeHooked || typeof window === 'undefined') return;
  resumeHooked = true;
  const resume = () => {
    if (sharedCtx && sharedCtx.state === 'suspended') void sharedCtx.resume().catch(() => {});
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', resume);
  window.addEventListener('focus', resume);
  ['touchstart', 'mousedown', 'keydown'].forEach((e) =>
    window.addEventListener(e, resume, { passive: true } as AddEventListenerOptions),
  );
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) sharedCtx = new Ctor();
  hookResume();
  return sharedCtx;
}

export const GENERATIVE_SUPPORTED = true;

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  pan: StereoPannerNode;
  side: number;
}

export class GenerativeEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null; // fade in/out
  private pulseGain: GainNode | null = null; // amplitude pump
  private filter: BiquadFilterNode | null = null;
  private bus: GainNode | null = null; // pad voices
  private reverbSend: GainNode | null = null; // wet send into the convolver
  private delaySend: GainNode | null = null; // tempo-synced echo send
  private voices: Voice[] = [];
  private bass: { osc: OscillatorNode; gain: GainNode } | null = null;
  private noise: AudioBuffer | null = null;
  private extras: AudioNode[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private rng: () => number = Math.random;
  private spec: PieceSpec | null = null;
  private targetGain = 0.5;
  private chordTones: number[] = [];
  private arpIdx = 0;
  private step = 0;
  private chordStep = 0;
  private arpPattern: number[] = ARP_PATTERNS[0];
  private arpEvery = 2;
  private voicing: number[] = VOICINGS[0];
  private voiceMidi: number[] = [];
  private motif: number[] = [];
  private motifRhythm: number[] = [];
  private phraseCount = 0;

  async start(spec: PieceSpec, _preloaded?: unknown, _mixWithMusic = false): Promise<boolean> {
    const ctx = getCtx();
    if (!ctx) return false;
    this.ctx = ctx;
    this.spec = spec;
    this.rng = makeRng(spec.seed);
    this.voiceMidi = [];
    // Fire-and-forget: do NOT await — resume() can stay pending until a user
    // gesture, which would hang start() and freeze the session. The resume
    // hooks (hookResume) reactivate audio on the next interaction.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    // Sustained pad/choir vs. plucked bells/harp/keys — the main character lever.
    const sustained = spec.instrument === 'pad' || spec.instrument === 'choir';
    const fadeIn = sustained ? 2.5 + this.rng() * 3 : 1.4; // varied, shorter for plucked

    // Chain: pad bus -> filter -> pulse -> master -> destination.
    // Rhythmic/bright layers route post-filter for clarity.
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(this.targetGain, now + fadeIn);
    // A gentle high-shelf adds air without the dark, muffled feel the web build
    // had before. Kept lower than the native +4 dB because the full-band
    // oscillators here already carry more top end than the band-limited preview.
    const air = ctx.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 6500;
    air.gain.value = 2;
    // Master glue: a gentle compressor for an even, polished level.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    master.connect(air).connect(comp).connect(ctx.destination);
    this.extras.push(air, comp);

    // Tempo-synced feedback delay (dotted-eighth) for space and movement.
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
    // High-pass the echo input so bass notes don't pile up in the feedback line.
    const delayHp = ctx.createBiquadFilter();
    delayHp.type = 'highpass';
    delayHp.frequency.value = 200;
    delaySend.connect(delayHp).connect(delay);
    this.delaySend = delaySend;
    this.extras.push(delay, delayLp, delayFb, delayWet, delayHp, delaySend);

    // Reverb send: a generated impulse gives a lush, spacious tail.
    const convolver = ctx.createConvolver();
    convolver.buffer = this.makeImpulse(ctx, 2.6, 2.6);
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = spec.section === 'rest' ? 0.42 : 0.3;
    convolver.connect(reverbWet).connect(master);
    // High-pass the reverb input so sub/bass energy doesn't wash the tail to mud.
    const reverbHp = ctx.createBiquadFilter();
    reverbHp.type = 'highpass';
    reverbHp.frequency.value = 300;
    reverbHp.connect(convolver);
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 1;
    reverbSend.connect(reverbHp);
    this.reverbSend = reverbSend;
    this.extras.push(convolver, reverbWet, reverbHp, reverbSend);

    const pulse = ctx.createGain();
    pulse.gain.value = 1;
    pulse.connect(master);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // The preview synth is band-limited (~24 harmonics, rolling off near 3-4 kHz)
    // but the live oscillators here run full-band to Nyquist, so an identical
    // cutoff over-brightens. Tune the web cutoff to match the preview's
    // perceived brightness rather than its nominal filter value.
    const baseCut = 1400 + spec.brightness * 5000;
    filter.frequency.value = baseCut;
    filter.Q.value = 0.4;
    filter.connect(pulse);

    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(filter);
    bus.connect(reverbSend); // pad also feeds the reverb

    // Chorus: a slowly-modulated short delay thickens and widens the pad.
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
    this.extras.push(chorus, chorusLfo, chorusDepth, chorusWet);

    this.master = master;
    this.pulseGain = pulse;
    this.filter = filter;
    this.bus = bus;

    // A noise buffer reused for shakers.
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = this.rng() * 2 - 1;
    this.noise = noise;

    // Slow filter movement.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.02 + this.rng() * 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = baseCut * 0.35;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    this.extras.push(lfo, lfoGain);

    // Amplitude pump.
    if (spec.pulseDepth > 0) {
      const pumpLfo = ctx.createOscillator();
      pumpLfo.type = 'sine';
      pumpLfo.frequency.value = spec.tempo / 60; // one cycle per beat
      const depth = ctx.createGain();
      depth.gain.value = spec.pulseDepth / 2;
      pulse.gain.value = 1 - spec.pulseDepth / 2;
      pumpLfo.connect(depth).connect(pulse.gain);
      pumpLfo.start();
      this.extras.push(pumpLfo, depth);
    }

    // Per-piece voicing, arpeggio pattern and rate, chosen from the seed.
    this.voicing = VOICINGS[Math.floor(this.rng() * VOICINGS.length)];
    this.arpPattern = ARP_PATTERNS[Math.floor(this.rng() * ARP_PATTERNS.length)];
    this.arpEvery = [2, 2, 2, 1, 4][Math.floor(this.rng() * 5)];
    [this.motif, this.motifRhythm] = makeMotif(this.rng);
    this.phraseCount = 0;

    // Match the native engine / preview density (extra voices just thickened
    // and muddied the web pad relative to the build the previews come from).
    const voiceCount = spec.section === 'chill' ? 5 : 4;

    if (sustained) {
      // Sustained pad / choir: held oscillators that glide between chords.
      const choir = spec.instrument === 'choir';
      const periodicWave = choir ? null : makeWave(ctx, spec.wave);
      // Triangle (never a pure sine) is the dark-end floor so the pad keeps
      // some upper harmonics — matches the native engine. Warm/choir use saw.
      const oscType: OscillatorType = choir || spec.wave === 'warm' ? 'sawtooth' : 'triangle';
      for (let i = 0; i < voiceCount; i++) {
        const osc = ctx.createOscillator();
        if (periodicWave) osc.setPeriodicWave(periodicWave);
        else osc.type = oscType;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const pan = ctx.createStereoPanner();
        const side = i % 2 === 0 ? -1 : 1;
        pan.pan.value = side * (0.3 + this.rng() * 0.5);
        // Slow analog drift on the tuning for warmth (wider for choir).
        const drift = ctx.createOscillator();
        drift.type = 'sine';
        drift.frequency.value = 0.04 + this.rng() * 0.1;
        const driftGain = ctx.createGain();
        driftGain.gain.value = (choir ? 7 : 4) + this.rng() * 5; // cents
        drift.connect(driftGain).connect(osc.detune);
        drift.start();
        this.extras.push(drift, driftGain);
        osc.connect(gain).connect(pan).connect(bus);
        osc.start();
        this.voices.push({ osc, gain, pan, side });
      }
    } else {
      // Plucked archetypes: re-strum the chord on a slow grid (bells / harp / keys).
      const beat = 60 / spec.tempo;
      const every = [beat * 2, beat * 3, beat * 4][Math.floor(this.rng() * 3)];
      const bellWave = spec.instrument === 'bells' ? makeWave(ctx, 'bell') : null;
      const strum = () => {
        if (!this.ctx) return;
        const when = this.ctx.currentTime + 0.06;
        const tones = this.chordTones;
        const order = this.rng() < 0.5 ? tones : [...tones].reverse();
        order.forEach((m, i) => {
          this.compNote(this.hum(when + i * 0.05, 0.012), midiToFreq(m), spec.instrument, bellWave, i % 2 ? 0.4 : -0.4);
        });
        this.timers.push(setTimeout(strum, every * 1000));
      };
      this.timers.push(setTimeout(strum, 300));
    }

    // Sub-bass drone on the root, an octave down — entering at a varied time.
    if (spec.bass) {
      const bassEntry = this.rng() * 8;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = midiToFreq(spec.root - 12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now + bassEntry);
      gain.gain.exponentialRampToValueAtTime(0.16, now + bassEntry + 4);
      osc.connect(gain).connect(pulse);
      osc.start();
      this.bass = { osc, gain };
    }

    // Clean binaural beat (researched frequencies): two pure carriers, one per
    // ear, differing by spec.binauralHz, tuned to the root. Straight to master
    // (no filter/reverb) so the beat stays pure. Subtle; needs headphones.
    if (spec.binauralHz > 0) {
      // Lift the carrier into the ~300–600 Hz band where binaural beats are
      // perceived strongest (the study used a 500 Hz carrier); the musical root
      // is too low. Octave shifts keep it in tune with the piece. See native.
      let carrier = midiToFreq(spec.root);
      while (carrier < 300) carrier *= 2;
      while (carrier > 600) carrier /= 2;
      for (const [offset, side] of [
        [0, -1],
        [spec.binauralHz, 1],
      ] as const) {
        const bosc = ctx.createOscillator();
        bosc.type = 'sine';
        bosc.frequency.value = carrier + offset;
        const bg = ctx.createGain();
        bg.gain.value = 0.08;
        const bp = ctx.createStereoPanner();
        bp.pan.value = side;
        bosc.connect(bg).connect(bp).connect(master);
        bosc.start();
        this.extras.push(bosc, bg, bp);
      }
    }

    // Open at a random point in the progression so pieces don't all start on
    // the tonic chord.
    this.chordStep = Math.floor(this.rng() * PROGRESSIONS[spec.progression % PROGRESSIONS.length].length);
    this.setChord(true);
    this.timers.push(
      setInterval(() => this.setChord(false), Math.max(4000, spec.chordChangeSec * 1000)),
    );

    // Sparse chimes — first one at a varied time.
    if (spec.chimeDensity > 0.02) {
      const scheduleChime = () => {
        if (!this.ctx) return;
        this.playChime();
        const gap = (5 + this.rng() * 12) / Math.max(0.05, spec.chimeDensity);
        this.timers.push(setTimeout(scheduleChime, gap * 1000));
      };
      this.timers.push(setTimeout(scheduleChime, (3 + this.rng() * 16) * 1000));
    }

    // Step grid for arp + percussion — the groove builds in after a varied delay.
    if (spec.arp || spec.percussion !== 'none') {
      const stepDur = 60 / spec.tempo / 4;
      // A little swing on the groovier Flow pieces; Rest stays dead straight.
      const swing = spec.section === 'chill' ? stepDur * 0.16 : 0;
      const tick = () => {
        const c = this.ctx;
        if (!c) return;
        const when = c.currentTime + 0.06;
        const s = this.step % 16;
        if (spec.percussion !== 'none') this.triggerPercussion(s, when);
        if (spec.arp) this.triggerArp(s, when + (s % 2 ? swing : 0));
        this.step++;
      };
      const grooveEntry = (sustained ? this.rng() * 14 : this.rng() * 8) * 1000;
      this.timers.push(
        setTimeout(() => this.timers.push(setInterval(tick, stepDur * 1000)), grooveEntry),
      );
    }

    // Sparse melodic lead — enters at a varied time.
    if (spec.melody) {
      this.timers.push(setTimeout(() => this.scheduleMelody(), (4 + this.rng() * 18) * 1000));
    }
    return true;
  }

  private setChord(initial: boolean): void {
    const ctx = this.ctx;
    const spec = this.spec;
    if (!ctx || !spec) return;
    const scale = SCALES[spec.scale] ?? SCALES.major_pentatonic;
    const L = scale.length;
    // Semitone offset for an (extended) scale degree, wrapping octaves.
    const deg = (x: number) => 12 * Math.floor(x / L) + scale[((x % L) + L) % L];

    // Advance through the progression and build a lush diatonic 7th chord on it.
    const prog = PROGRESSIONS[spec.progression % PROGRESSIONS.length];
    const base = prog[this.chordStep % prog.length];
    if (!initial) this.chordStep++;
    const chord = this.voicing.map((o) => deg(base + o));

    // The chord's notes — used by the arp, the plucked strum, and the melody.
    this.chordTones = chord.map((c) => spec.root + c);

    const now = ctx.currentTime;
    const glide = initial ? 2 : 6;
    if (this.voices.length) {
      const next = leadVoices(this.voiceMidi, this.chordTones, this.voices.length, spec.root);
      this.voiceMidi = next;
      this.voices.forEach((v, idx) => {
        const midi = next[idx];
        // Pad plays in tune; the binaural beat is a dedicated clean layer.
        v.osc.frequency.cancelScheduledValues(now);
        v.osc.frequency.setTargetAtTime(midiToFreq(midi), now, glide / 3);
        const target = (0.7 / this.voices.length) * (0.7 + 0.6 * this.rng());
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(target, now, glide / 3);
      });
    }

    // Move the sub-bass with the chord root.
    if (this.bass) {
      this.bass.osc.frequency.cancelScheduledValues(now);
      this.bass.osc.frequency.setTargetAtTime(midiToFreq(spec.root + chord[0] - 12), now, glide / 3);
    }
  }

  // Micro-timing: nudge an event a few ms so grid layers feel played, not
  // quantized. Clamped so a nudged-early note never lands before "now".
  private hum(when: number, amt: number): number {
    const floor = this.ctx ? this.ctx.currentTime : 0;
    return Math.max(floor, when + (this.rng() * 2 - 1) * amt);
  }

  // Velocity: gentle per-note level variation for a human, breathing dynamic.
  private vel(base: number, range = 0.3): number {
    return base * (1 - range / 2 + this.rng() * range);
  }

  private triggerPercussion(s: number, when: number): void {
    const rest = this.spec?.section === 'rest';
    const kg = rest ? 0.16 : 0.3;
    const sg = rest ? 0.05 : 0.09;
    switch (this.spec?.percussion) {
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
    const base = this.spec?.section === 'rest' ? 0.05 : 0.08;
    this.arpNote(this.hum(when, 0.008), midiToFreq(midi), pan, this.vel(base));
  }

  private softKick(when: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(78, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.28);
    osc.connect(g).connect(this.master);
    osc.start(when);
    osc.stop(when + 0.32);
  }

  private shaker(when: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
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
    src.connect(hp).connect(g).connect(pan).connect(this.master);
    src.start(when, this.rng() * 0.5);
    src.stop(when + 0.1);
  }

  /** A singing lead note with gentle vibrato, routed through the reverb. */
  private leadNote(when: number, freq: number, dur: number, pan: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.pulseGain) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, when);
    // Gentle vibrato.
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
    p.connect(this.pulseGain);
    if (this.reverbSend) p.connect(this.reverbSend);
    if (this.delaySend) p.connect(this.delaySend);
    osc.start(when);
    osc.stop(when + dur + 0.06);
  }

  /** Play a short melodic phrase, then schedule the next after a rest. */
  private scheduleMelody(): void {
    const ctx = this.ctx;
    const spec = this.spec;
    if (!ctx || !spec) return;
    const scale = SCALES[spec.scale] ?? SCALES.major_pentatonic;
    const L = scale.length;
    const deg = (x: number) => 12 * Math.floor(x / L) + scale[((x % L) + L) % L];

    const beat = 60 / spec.tempo;
    const baseLen = beat * (this.rng() < 0.5 ? 1 : 0.5);
    const gain = spec.section === 'rest' ? 0.08 : 0.1;
    let t = ctx.currentTime + 0.1;
    const start = t;
    const tones = this.chordTones; // resolve the phrase onto the current chord

    // Alternate a "call" (ends open) with a "response" (resolves to a chord
    // tone), developing the motif by exact repeat, transposition or inversion.
    const isAnswer = this.phraseCount % 2 === 1;
    const v = this.rng();
    const invert = v < 0.3;
    const transpose = v >= 0.3 && v < 0.6 ? (this.rng() < 0.5 ? 2 : -2) : 0;
    this.phraseCount++;

    const motif = this.motif.length ? this.motif : [1, -1, 1];
    const rhythm = this.motifRhythm.length ? this.motifRhythm : [1, 1, 1];
    let degIdx = L + Math.floor(this.rng() * L) + transpose;
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
    const wait = t - start + (isAnswer ? 3 + this.rng() * 4 : 1.5 + this.rng() * 1.5);
    this.timers.push(setTimeout(() => this.scheduleMelody(), wait * 1000));
  }

  private arpNote(when: number, freq: number, pan: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.pulseGain) return;
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
    p.connect(this.pulseGain);
    if (this.reverbSend) p.connect(this.reverbSend);
    if (this.delaySend) p.connect(this.delaySend);
    osc.start(when);
    osc.stop(when + 0.55);
  }

  /** A plucked/struck chord tone for the bells / harp / keys archetypes. */
  private compNote(
    when: number,
    freq: number,
    instrument: string,
    bellWave: PeriodicWave | null,
    pan: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.pulseGain) return;
    const osc = ctx.createOscillator();
    let dur: number;
    if (instrument === 'keys') {
      // FM electric piano: a fast-decaying modulator gives the tine attack.
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
      osc.type = 'triangle'; // harp-ish pluck
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
    p.connect(this.pulseGain);
    if (this.reverbSend) p.connect(this.reverbSend);
    if (this.delaySend) p.connect(this.delaySend);
    osc.start(when);
    osc.stop(when + dur + 0.1);
  }

  private playChime(): void {
    const ctx = this.ctx;
    const spec = this.spec;
    if (!ctx || !spec || !this.master) return;
    const scale = SCALES[spec.scale] ?? SCALES.major_pentatonic;
    const deg = scale[Math.floor(this.rng() * scale.length)];
    const midi = spec.root + 12 + deg + (this.rng() < 0.4 ? 12 : 0);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = midiToFreq(midi);
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(this.vel(0.09), now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 3);
    const pan = ctx.createStereoPanner();
    pan.pan.value = this.rng() * 2 - 1;
    osc.connect(g).connect(pan);
    pan.connect(this.master);
    if (this.reverbSend) pan.connect(this.reverbSend);
    osc.start(now);
    osc.stop(now + 3.2);
  }

  private makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const len = Math.floor(seconds * ctx.sampleRate);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (this.rng() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  setVolume(v: number): void {
    this.targetGain = 0.5 * Math.max(0, Math.min(1, v));
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
    const ctx = this.ctx;
    this.timers.forEach((t) => {
      clearTimeout(t);
      clearInterval(t as unknown as ReturnType<typeof setInterval>);
    });
    this.timers = [];

    const voices = this.voices;
    const extras = this.extras;
    const bass = this.bass;
    const master = this.master;
    const filter = this.filter;
    const pulse = this.pulseGain;
    const bus = this.bus;

    if (ctx && master) {
      const now = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
      } catch {
        /* ignore */
      }
    }

    setTimeout(() => {
      const stopNode = (n: { stop?: () => void; disconnect?: () => void }) => {
        try {
          n.stop?.();
        } catch {}
        try {
          n.disconnect?.();
        } catch {}
      };
      voices.forEach((v) => {
        stopNode(v.osc);
        try {
          v.gain.disconnect();
          v.pan.disconnect();
        } catch {}
      });
      if (bass) {
        stopNode(bass.osc);
        try {
          bass.gain.disconnect();
        } catch {}
      }
      extras.forEach((n) => stopNode(n as unknown as { stop?: () => void; disconnect?: () => void }));
      try {
        bus?.disconnect();
        filter?.disconnect();
        pulse?.disconnect();
        master?.disconnect();
      } catch {}
    }, 1800);

    this.voices = [];
    this.extras = [];
    this.bass = null;
    this.master = null;
    this.filter = null;
    this.pulseGain = null;
    this.bus = null;
    this.reverbSend = null;
    this.delaySend = null;
    this.ctx = null;
  }
}
