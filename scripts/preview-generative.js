/**
 * Offline PREVIEW renderer for the generative engine (dev tool, not shipped).
 *
 * Reproduces the musical logic of src/lib/generative.ts (scales, progressions,
 * voicings, arps, percussion, chimes, melody, pad, bass) with simple additive
 * synthesis + a lowpass, tempo delay and Schroeder reverb, so we can render
 * Rest/Flow pieces to WAV, listen, analyze and tune — instead of guessing.
 *
 *   node scripts/preview-generative.js
 */
const fs = require('fs');
const path = require('path');

const SR = 44100;
const TAU = Math.PI * 2;

const SCALES = {
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
  [0, 2, 4, 6],
  [0, 1, 4, 6],
  [0, 3, 4, 6],
  [0, 2, 4, 8],
  [0, 4, 6, 8],
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
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function wave(type, ph) {
  switch (type) {
    case 'sine':
      return Math.sin(ph);
    case 'triangle':
      return (2 / Math.PI) * Math.asin(Math.sin(ph));
    case 'sawtooth':
    case 'warm': {
      // band-limited saw via many harmonics (closer to a real OscillatorNode)
      let v = 0;
      for (let h = 1; h <= 24; h++) v += Math.sin(ph * h) / h;
      return v * 0.45;
    }
    case 'bell': {
      const p = [
        [1, 1],
        [2, 0.6],
        [3, 0.25],
        [5, 0.12],
        [7, 0.05],
      ];
      let v = 0;
      for (const [m, a] of p) v += a * Math.sin(ph * m);
      return v * 0.5;
    }
    default:
      return Math.sin(ph);
  }
}

class Piece {
  constructor(spec, seconds) {
    this.spec = spec;
    this.len = Math.floor(seconds * SR);
    this.rng = makeRng(spec.seed);
    // buses
    this.dryL = new Float32Array(this.len);
    this.dryR = new Float32Array(this.len);
    this.revL = new Float32Array(this.len);
    this.revR = new Float32Array(this.len);
    this.delL = new Float32Array(this.len);
    this.delR = new Float32Array(this.len);
    this.padL = new Float32Array(this.len);
    this.padR = new Float32Array(this.len);
    this.voicing = VOICINGS[Math.floor(this.rng() * VOICINGS.length)];
    this.arpPattern = ARP_PATTERNS[Math.floor(this.rng() * ARP_PATTERNS.length)];
    this.arpEvery = [2, 2, 2, 1, 4][Math.floor(this.rng() * 5)];
    this.arpIdx = 0;
    this.chordEvents = [];
  }

  // add a note (osc + AD envelope) to a target bus pair with pan + sends
  note(L, R, when, dur, freq, type, peak, pan, { rev = 0, del = 0, vib = 0 } = {}) {
    const start = Math.floor(when * SR);
    const n = Math.floor(dur * SR);
    const gl = Math.cos(((pan + 1) / 2) * (Math.PI / 2));
    const gr = Math.sin(((pan + 1) / 2) * (Math.PI / 2));
    const atk = Math.max(2, 0.006 * SR);
    for (let i = 0; i < n; i++) {
      const idx = start + i;
      if (idx < 0 || idx >= this.len) continue;
      const t = i / SR;
      const env = (i < atk ? i / atk : Math.exp(-(t - atk / SR) * (3.5 / dur))) ;
      const ph = TAU * freq * t + (vib ? vib * Math.sin(TAU * 5 * t) : 0);
      const s = wave(type, ph) * peak * env;
      L[idx] += s * gl;
      R[idx] += s * gr;
      if (rev) {
        this.revL[idx] += s * gl * rev;
        this.revR[idx] += s * gr * rev;
      }
      if (del) {
        this.delL[idx] += s * gl * del;
        this.delR[idx] += s * gr * del;
      }
    }
  }

  buildChords(renderLen) {
    const spec = this.spec;
    const scale = SCALES[spec.scale] || SCALES.major_pentatonic;
    const L = scale.length;
    const deg = (x) => 12 * Math.floor(x / L) + scale[((x % L) + L) % L];
    const prog = PROGRESSIONS[spec.progression % PROGRESSIONS.length];
    let step = Math.floor(this.rng() * prog.length);
    const interval = Math.max(4, spec.chordChangeSec);
    for (let when = 0; when < renderLen + interval; when += interval) {
      const base = prog[step % prog.length];
      step++;
      const chord = this.voicing.map((o) => deg(base + o));
      this.chordEvents.push({ time: when, chord, tones: chord.map((c) => spec.root + c) });
    }
  }
  chordAt(t) {
    let c = this.chordEvents[0];
    for (const e of this.chordEvents) {
      if (e.time <= t) c = e;
      else break;
    }
    return c;
  }

  render(renderLen) {
    const spec = this.spec;
    const scale = SCALES[spec.scale] || SCALES.major_pentatonic;
    const Ln = scale.length;
    const deg = (x) => 12 * Math.floor(x / Ln) + scale[((x % Ln) + Ln) % Ln];
    const sustained = spec.instrument === 'pad' || spec.instrument === 'choir';
    this.buildChords(renderLen);

    // --- Pad: continuous voices gliding through chords ---
    if (sustained) {
      const voiceCount = spec.section === 'chill' ? 5 : 4;
      const type = spec.instrument === 'choir' || spec.wave === 'warm' ? 'warm' : 'triangle';
      for (let v = 0; v < voiceCount; v++) {
        const side = v % 2 === 0 ? -1 : 1;
        const pan = side * (0.3 + this.rng() * 0.5);
        const gl = Math.cos(((pan + 1) / 2) * (Math.PI / 2));
        const gr = Math.sin(((pan + 1) / 2) * (Math.PI / 2));
        const detuneCents = side * (spec.binauralHz / 2);
        const target = (0.7 / voiceCount) * (0.7 + 0.6 * this.rng());
        const driftRate = 0.05 + this.rng() * 0.08;
        let ph = 0;
        let curGain = 0;
        for (let i = 0; i < this.len; i++) {
          const t = i / SR;
          const ev = this.chordAt(t);
          const chord = ev.chord;
          const noteMidi = spec.root + chord[v % chord.length] + (v >= 4 ? 12 : 0) + detuneCents / 100;
          const drift = 1 + 0.0006 * Math.sin(TAU * driftRate * t);
          const f = midi(noteMidi) * drift;
          ph += (TAU * f) / SR;
          curGain += (target - curGain) * 0.0008; // slow glide toward target
          let s = wave(type, ph) * curGain;
          this.padL[i] += s * gl;
          this.padR[i] += s * gr;
        }
      }
    }

    // --- Bass ---
    if (spec.bass) {
      let ph = 0;
      for (let i = 0; i < this.len; i++) {
        const t = i / SR;
        const ev = this.chordAt(t);
        const f = midi(spec.root + ev.chord[0] - 12);
        ph += (TAU * f) / SR;
        const env = clamp(t / 4, 0, 1);
        const s = Math.sin(ph) * 0.16 * env;
        this.dryL[i] += s;
        this.dryR[i] += s;
      }
    }

    // --- Plucked strum (bells/keys/harp) ---
    if (!sustained) {
      const beat = 60 / spec.tempo;
      const every = [beat * 2, beat * 3, beat * 4][Math.floor(this.rng() * 3)];
      for (let when = 0.3; when < renderLen; when += every) {
        const tones = this.chordAt(when).tones;
        const order = this.rng() < 0.5 ? tones : [...tones].reverse();
        order.forEach((m, i) => {
          const type = spec.instrument === 'bells' ? 'bell' : spec.instrument === 'keys' ? 'sine' : 'triangle';
          const dur = spec.instrument === 'bells' ? 2.6 : spec.instrument === 'keys' ? 1.4 : 1.2;
          this.note(this.dryL, this.dryR, when + i * 0.05, dur, midi(m), type, 0.1, i % 2 ? 0.4 : -0.4, { rev: 0.5, del: 0.5 });
        });
      }
    }

    // --- Chimes ---
    if (spec.chimeDensity > 0.02) {
      let when = 3 + this.rng() * 16;
      while (when < renderLen) {
        const d = scale[Math.floor(this.rng() * scale.length)];
        const m = spec.root + 12 + d + (this.rng() < 0.4 ? 12 : 0);
        this.note(this.dryL, this.dryR, when, 3, midi(m), 'sine', 0.06, this.rng() * 2 - 1, { rev: 0.6 });
        when += (8 + this.rng() * 16) / Math.max(0.05, spec.chimeDensity);
      }
    }

    // --- Arp + percussion grid ---
    if (spec.arp || spec.percussion !== 'none') {
      const stepDur = 60 / spec.tempo / 4;
      let s = 0;
      const rest = spec.section === 'rest';
      const kg = rest ? 0.16 : 0.3;
      const sg = rest ? 0.05 : 0.09;
      for (let when = 0; when < renderLen; when += stepDur, s++) {
        const st = s % 16;
        const tones = this.chordAt(when).tones;
        if (spec.arp && st % this.arpEvery === 0 && tones.length) {
          const di = this.arpPattern[this.arpIdx % this.arpPattern.length] % tones.length;
          const pan = this.arpIdx % 2 === 0 ? -0.6 : 0.6;
          this.arpIdx++;
          this.note(this.dryL, this.dryR, when, 0.5, midi(tones[di] + 12), 'triangle', rest ? 0.05 : 0.08, pan, { rev: 0.4, del: 0.5 });
        }
        if (spec.percussion === 'pulse' && st % 4 === 0) this.kick(when, kg);
        if (spec.percussion === 'heartbeat' && (st === 0 || st === 8)) this.kick(when, kg * 0.8);
        if (spec.percussion === 'shaker' && st % 4 === 2) this.shaker(when, sg);
      }
    }

    // --- Melody ---
    if (spec.melody) {
      let when = 4 + this.rng() * 18;
      const beat = 60 / spec.tempo;
      const gain = spec.section === 'rest' ? 0.08 : 0.1;
      while (when < renderLen) {
        const noteLen = beat * (this.rng() < 0.5 ? 1 : 0.5);
        const notes = 3 + Math.floor(this.rng() * 4);
        let degIdx = Ln + Math.floor(this.rng() * Ln);
        let t = when;
        const tones = this.chordAt(when).tones; // resolve onto the current chord
        for (let i = 0; i < notes; i++) {
          const last = i === notes - 1;
          if (last || this.rng() >= 0.18) {
            const m =
              last && tones.length
                ? tones[Math.floor(this.rng() * tones.length)] + 12
                : spec.root + deg(degIdx) + 12;
            this.note(this.dryL, this.dryR, t, noteLen * (0.8 + this.rng() * 0.7), midi(m), 'triangle', gain, this.rng() * 0.4 - 0.2, { rev: 0.5, del: 0.5, vib: midi(m) * 0.006 });
          }
          t += noteLen;
          degIdx += this.rng() < 0.8 ? (this.rng() < 0.5 ? 1 : -1) : this.rng() < 0.5 ? 2 : -2;
          degIdx = clamp(degIdx, Ln - 1, 2 * Ln + 2);
        }
        when = t + 2 + this.rng() * 4;
      }
    }

    // --- Clean binaural beat (two carriers, one per ear) ---
    if (spec.binauralHz > 0) {
      const carrier = midi(spec.root);
      for (const [offset, pan] of [
        [0, -1],
        [spec.binauralHz, 1],
      ]) {
        let ph = 0;
        const f = carrier + offset;
        const gl = Math.cos(((pan + 1) / 2) * (Math.PI / 2));
        const gr = Math.sin(((pan + 1) / 2) * (Math.PI / 2));
        for (let i = 0; i < this.len; i++) {
          ph += (TAU * f) / SR;
          const s = Math.sin(ph) * 0.08;
          this.dryL[i] += s * gl;
          this.dryR[i] += s * gr;
        }
      }
    }
  }

  kick(when, gain) {
    const start = Math.floor(when * SR);
    const n = Math.floor(0.3 * SR);
    for (let i = 0; i < n; i++) {
      const idx = start + i;
      if (idx >= this.len) break;
      const t = i / SR;
      const f = 78 * Math.exp(-t * 18) + 42;
      const env = Math.exp(-t * 14);
      const s = Math.sin(TAU * f * t) * gain * env;
      this.dryL[idx] += s;
      this.dryR[idx] += s;
    }
  }
  shaker(when, gain) {
    const start = Math.floor(when * SR);
    const n = Math.floor(0.08 * SR);
    let hp = 0;
    for (let i = 0; i < n; i++) {
      const idx = start + i;
      if (idx >= this.len) break;
      const t = i / SR;
      const w = this.rng() * 2 - 1;
      hp = 0.85 * (hp + w - (this._pw || 0));
      this._pw = w;
      const env = Math.exp(-t * 40);
      const s = hp * gain * env;
      this.dryL[idx] += s;
      this.dryR[idx] += s;
    }
  }

  mix() {
    const baseCut = 2200 + this.spec.brightness * 9000;
    // one-pole lowpass on the pad, then fold into dry + reverb send
    const a = Math.exp((-2 * Math.PI * baseCut) / SR);
    let lpL = 0,
      lpR = 0;
    for (let i = 0; i < this.len; i++) {
      lpL = lpL * a + this.padL[i] * (1 - a);
      lpR = lpR * a + this.padR[i] * (1 - a);
      this.dryL[i] += lpL;
      this.dryR[i] += lpR;
      this.revL[i] += lpL * 0.5;
      this.revR[i] += lpR * 0.5;
    }
    // tempo feedback delay
    const dt = Math.floor((60 / this.spec.tempo) * 0.75 * SR);
    for (let i = dt; i < this.len; i++) {
      this.delL[i] += this.delL[i - dt] * 0.34;
      this.delR[i] += this.delR[i - dt] * 0.34;
    }
    for (let i = 0; i < this.len; i++) {
      this.dryL[i] += this.delL[i] * 0.3;
      this.dryR[i] += this.delR[i] * 0.3;
    }
    // Schroeder reverb on the reverb send
    const wet = this.spec.section === 'rest' ? 0.42 : 0.3;
    const rl = reverb(this.revL);
    const rr = reverb(this.revR);
    const L = new Float32Array(this.len);
    const R = new Float32Array(this.len);
    const fin = 1.5 * SR,
      fout = 3 * SR;
    // high-shelf "air": boost the high-passed signal (corner ~6.5 kHz)
    const ac = Math.exp((-2 * Math.PI * 6500) / SR);
    const airAmt = Math.pow(10, 4 / 20) - 1; // +4 dB shelf
    let loL = 0,
      loR = 0;
    for (let i = 0; i < this.len; i++) {
      let l = this.dryL[i] + rl[i] * wet;
      let r = this.dryR[i] + rr[i] * wet;
      loL = loL * ac + l * (1 - ac);
      loR = loR * ac + r * (1 - ac);
      l += (l - loL) * airAmt;
      r += (r - loR) * airAmt;
      let f = 1;
      if (i < fin) f = i / fin;
      if (i > this.len - fout) f = Math.min(f, (this.len - i) / fout);
      L[i] = Math.tanh(l * 0.5 * 1.5) * f;
      R[i] = Math.tanh(r * 0.5 * 1.5) * f;
    }
    return { L, R };
  }
}

function comb(buf, delay, fb) {
  const out = new Float32Array(buf.length);
  const d = new Float32Array(delay);
  let idx = 0;
  for (let i = 0; i < buf.length; i++) {
    const y = d[idx];
    out[i] = y;
    d[idx] = buf[i] + y * fb;
    idx = (idx + 1) % delay;
  }
  return out;
}
function allpass(buf, delay, g) {
  const out = new Float32Array(buf.length);
  const d = new Float32Array(delay);
  let idx = 0;
  for (let i = 0; i < buf.length; i++) {
    const bd = d[idx];
    const y = -g * buf[i] + bd;
    d[idx] = buf[i] + g * y;
    out[i] = y;
    idx = (idx + 1) % delay;
  }
  return out;
}
function reverb(buf) {
  const c = [1557, 1617, 1491, 1422].map((d) => comb(buf, d, 0.82));
  let s = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) s[i] = (c[0][i] + c[1][i] + c[2][i] + c[3][i]) * 0.25;
  s = allpass(s, 225, 0.5);
  s = allpass(s, 556, 0.5);
  return s;
}

function writeWav(file, L, R) {
  const n = L.length;
  let peak = 1e-9;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const norm = 0.89 / peak;
  const bytes = n * 2 * 2;
  const buf = Buffer.alloc(44 + bytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + bytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(bytes, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(clamp(L[i] * norm, -1, 1) * 32767, o);
    buf.writeInt16LE(clamp(R[i] * norm, -1, 1) * 32767, o + 2);
    o += 4;
  }
  fs.writeFileSync(file, buf);
  console.log('wrote', file, (bytes / 1e6).toFixed(1), 'MB');
}

const SPECS = {
  rest: {
    seed: 12345, section: 'rest', scale: 'aeolian', root: 50, brightness: 0.42,
    chordChangeSec: 9, binauralHz: 4, chimeDensity: 0.18, tempo: 60, pulseDepth: 0,
    wave: 'warm', instrument: 'pad', arp: false, bass: true, percussion: 'heartbeat',
    progression: 2, melody: true,
  },
  flow: {
    seed: 67890, section: 'chill', scale: 'dorian', root: 48, brightness: 0.6,
    chordChangeSec: 6, binauralHz: 4, chimeDensity: 0.12, tempo: 92, pulseDepth: 0.2,
    wave: 'triangle', instrument: 'keys', arp: true, bass: true, percussion: 'pulse',
    progression: 3, melody: true,
  },
};

const seconds = 40;
const outDir = process.env.OUT || '/tmp';
for (const [name, spec] of Object.entries(SPECS)) {
  const p = new Piece(spec, seconds);
  p.render(seconds);
  const { L, R } = p.mix();
  writeWav(path.join(outDir, `gen-${name}.wav`), L, R);
}
console.log('done');
