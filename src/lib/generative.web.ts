/**
 * Live, never-repeating meditation music, synthesized in the Web Audio API.
 *
 * The engine holds a small set of oscillator "voices" that form a chord drawn
 * from a scale, and every `chordChangeSec` it glides them to a new chord. A
 * slow filter LFO adds movement, optional chimes sparkle on top, and an
 * optional gentle amplitude pulse gives "chill" a soft heartbeat. Every random
 * choice comes from the spec's seed, so a given spec always evolves the same
 * way — which is what lets a rating mean something.
 */

import type { PieceSpec } from './types';

const SCALES: Record<string, number[]> = {
  major_pentatonic: [0, 2, 4, 7, 9],
  minor_pentatonic: [0, 3, 5, 7, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
};

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
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
  side: number; // -1 left, +1 right (for binaural offset)
}

export class GenerativeEngine {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null; // voices sum here
  private filter: BiquadFilterNode | null = null;
  private pulse: GainNode | null = null; // chill amplitude pulse
  private master: GainNode | null = null; // fade in/out
  private voices: Voice[] = [];
  private extras: AudioNode[] = []; // LFOs etc. to stop/disconnect
  private timers: ReturnType<typeof setTimeout>[] = [];
  private rng: () => number = Math.random;
  private spec: PieceSpec | null = null;

  async start(spec: PieceSpec): Promise<void> {
    const ctx = getCtx();
    if (!ctx) return;
    this.ctx = ctx;
    this.spec = spec;
    this.rng = makeRng(spec.seed);
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        /* resumes on next interaction */
      }
    }

    const now = ctx.currentTime;

    // Chain: voices -> bus -> filter -> pulse -> master(fade) -> destination
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.5, now + 4); // slow swell in
    master.connect(ctx.destination);

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

    this.master = master;
    this.pulse = pulse;
    this.filter = filter;
    this.bus = bus;

    // Slow filter movement.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.02 + this.rng() * 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = baseCut * 0.35;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    this.extras.push(lfo, lfoGain);

    // Voices.
    const voiceCount = spec.section === 'chill' ? 6 : 5;
    for (let i = 0; i < voiceCount; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      const side = i % 2 === 0 ? -1 : 1;
      pan.pan.value = side * (0.3 + this.rng() * 0.5);
      osc.connect(gain).connect(pan).connect(bus);
      osc.start();
      this.voices.push({ osc, gain, pan, side });
    }

    this.setChord(true);
    this.timers.push(
      setInterval(() => this.setChord(false), Math.max(4000, spec.chordChangeSec * 1000)),
    );

    // Optional gentle chimes.
    if (spec.chimeDensity > 0.02) {
      const scheduleChime = () => {
        if (!this.ctx) return;
        this.playChime();
        const gap = (5 + this.rng() * 12) / Math.max(0.05, spec.chimeDensity);
        this.timers.push(setTimeout(scheduleChime, gap * 1000));
      };
      this.timers.push(setTimeout(scheduleChime, 5000));
    }

    // Optional "chill" amplitude pulse.
    if (spec.pulseBpm > 0) {
      const beat = 60 / spec.pulseBpm;
      const lfoP = ctx.createOscillator();
      lfoP.type = 'sine';
      lfoP.frequency.value = 1 / beat;
      const depth = ctx.createGain();
      depth.gain.value = 0.18;
      pulse.gain.value = 0.82;
      lfoP.connect(depth).connect(pulse.gain);
      lfoP.start();
      this.extras.push(lfoP, depth);
    }
  }

  private setChord(initial: boolean): void {
    const ctx = this.ctx;
    const spec = this.spec;
    if (!ctx || !spec || this.voices.length === 0) return;
    const scale = SCALES[spec.scale] ?? SCALES.major_pentatonic;

    const notes: number[] = [spec.root, spec.root + 12];
    for (let i = 0; i < this.voices.length - 2; i++) {
      const deg = scale[Math.floor(this.rng() * scale.length)];
      const oct = 12 * Math.floor(this.rng() * 2);
      notes.push(spec.root + deg + oct);
    }

    const now = ctx.currentTime;
    const glide = initial ? 2 : 6;
    this.voices.forEach((v, idx) => {
      const midi = notes[idx % notes.length];
      // Binaural: nudge left/right voices apart by half the beat frequency.
      const detune = (spec.binauralHz / 2) * v.side;
      const freq = midiToFreq(midi) + detune;
      v.osc.frequency.cancelScheduledValues(now);
      v.osc.frequency.setTargetAtTime(freq, now, glide / 3);
      const target = (0.75 / this.voices.length) * (0.7 + 0.6 * this.rng());
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(target, now, glide / 3);
    });
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
    g.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 3);
    const pan = ctx.createStereoPanner();
    pan.pan.value = this.rng() * 2 - 1;
    osc.connect(g).connect(pan).connect(this.master);
    osc.start(now);
    osc.stop(now + 3.2);
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
    master.gain.exponentialRampToValueAtTime(0.5, now + 0.4);
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
    const master = this.master;
    const filter = this.filter;
    const pulse = this.pulse;
    const bus = this.bus;

    if (ctx && master) {
      const now = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 1.6); // fade out
      } catch {
        /* ignore */
      }
    }

    setTimeout(() => {
      voices.forEach((v) => {
        try {
          v.osc.stop();
        } catch {}
        try {
          v.osc.disconnect();
          v.gain.disconnect();
          v.pan.disconnect();
        } catch {}
      });
      extras.forEach((n) => {
        try {
          (n as OscillatorNode).stop?.();
        } catch {}
        try {
          n.disconnect();
        } catch {}
      });
      try {
        bus?.disconnect();
        filter?.disconnect();
        pulse?.disconnect();
        master?.disconnect();
      } catch {}
    }, 1800);

    this.voices = [];
    this.extras = [];
    this.master = null;
    this.filter = null;
    this.pulse = null;
    this.bus = null;
    this.ctx = null;
  }
}
