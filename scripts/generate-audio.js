/**
 * Generates the app's bundled audio as 16-bit mono PCM WAV files.
 *
 * Everything is synthesized procedurally (no external assets), so the audio
 * is fully reproducible: `node scripts/generate-audio.js`.
 *
 *   assets/audio/bell.wav            – singing-bowl chime (start / interval / end)
 *   assets/audio/ambient/rain.wav    – steady rainfall (looping)
 *   assets/audio/ambient/ocean.wav   – slow ocean swells (looping)
 *   assets/audio/ambient/forest.wav  – soft wind / forest hush (looping)
 *
 * Frequency music (STEREO, looping) — binaural-beat pads. The two ears get
 * carriers offset by the beat frequency, so the listener perceives a pulse at
 * that difference (best with headphones). Frequencies are chosen from common
 * brainwave-entrainment associations:
 *   assets/audio/music/calm.wav   – 432 Hz-tuned drone, 7.83 Hz beat (Schumann / theta-alpha, grounding calm)
 *   assets/audio/music/focus.wav  – 256 Hz carrier, 14 Hz beat (low-beta / SMR, alert focus)
 *   assets/audio/music/deep.wav   – 144 Hz drone, 3 Hz beat (delta, deep rest / sleep)
 *
 * Beat tracks (STEREO, looping) — synthesized grooves modeled on artist styles:
 *   assets/audio/beats/lofi.wav       – jazzy lo-fi hip-hop (Nujabes / J Dilla)
 *   assets/audio/beats/liquid.wav     – liquid drum & bass (LTJ Bukem / Netsky)
 *   assets/audio/beats/chillstep.wav  – future garage / chillstep (Burial)
 *   assets/audio/beats/downtempo.wav  – dreamy downtempo with arps (Tycho / Bonobo)
 *   assets/audio/beats/deephouse.wav  – dark, sultry deep house (ZHU)
 *   assets/audio/beats/melodic.wav    – warm, euphoric melodic house (RÜFÜS DU SOL)
 */

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const OUT_DIR = path.join(__dirname, '..', 'assets', 'audio');
const AMBIENT_DIR = path.join(OUT_DIR, 'ambient');
const MUSIC_DIR = path.join(OUT_DIR, 'music');
const BEATS_DIR = path.join(OUT_DIR, 'beats');

// Deterministic noise so regenerating produces identical files.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff; // [0, 1)
  };
}

const dbToLin = (db) => Math.pow(10, db / 20);
// tanh soft clip: transparent below the ceiling, gently saturates above it.
const softClip = (x, ceiling) => ceiling * Math.tanh(x / ceiling);

/**
 * A small mastering chain so every track sits at a similar, full loudness:
 * a linked soft-knee compressor for glue, RMS normalisation to a target, then
 * a soft limiter. Channels are gain-linked so stereo / binaural imaging (and
 * the binaural beat) is preserved.
 */
function master(channels, { targetDb = -14, thresholdDb = -18, ratio = 3 } = {}) {
  const n = channels[0].length;
  const thr = dbToLin(thresholdDb);
  const atk = Math.exp(-1 / (0.005 * SAMPLE_RATE));
  const rel = Math.exp(-1 / (0.12 * SAMPLE_RATE));
  let env = 0;

  // 1) Linked compressor.
  for (let i = 0; i < n; i++) {
    let det = 0;
    for (const ch of channels) det = Math.max(det, Math.abs(ch[i]));
    env = (det > env ? atk : rel) * env + (1 - (det > env ? atk : rel)) * det;
    let gainDb = 0;
    if (env > thr) gainDb = -(20 * Math.log10(env / thr)) * (1 - 1 / ratio);
    const g = dbToLin(gainDb);
    for (const ch of channels) ch[i] *= g;
  }

  // 2) RMS normalise to the target loudness.
  let sum = 0;
  for (const ch of channels) for (let i = 0; i < n; i++) sum += ch[i] * ch[i];
  const rms = Math.sqrt(sum / (n * channels.length));
  let makeup = rms > 0 ? Math.min(dbToLin(targetDb) / rms, 12) : 1;

  // 3) Soft limiter.
  for (const ch of channels) for (let i = 0; i < n; i++) ch[i] = softClip(ch[i] * makeup, 0.97);
  return channels;
}

function writeWav(filePath, samples, opts = {}) {
  if (opts.master !== false) master([samples], { targetDb: opts.targetDb ?? -16 });
  // Normalize to avoid clipping, leaving a little headroom.
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  // When mastered, levels are already set; otherwise peak-normalise with headroom.
  const gain = opts.master === false ? (peak > 0 ? 0.92 / peak : 1) : 1;

  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    let v = Math.max(-1, Math.min(1, samples[i] * gain));
    buffer.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  console.log(`  wrote ${path.relative(process.cwd(), filePath)} (${(buffer.length / 1024).toFixed(0)} KB)`);
}

function writeWavStereo(filePath, left, right, opts = {}) {
  const n = Math.min(left.length, right.length);
  if (opts.master !== false) master([left, right], { targetDb: opts.targetDb ?? -14 });
  // Joint normalization keeps the stereo image balanced.
  let peak = 0;
  for (let i = 0; i < n; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const gain = opts.master === false ? (peak > 0 ? 0.9 / peak : 1) : 1;

  const dataSize = n * 2 * 2; // 2 channels, 16-bit
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(2, 22); // stereo
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 4, 28); // byte rate (2ch * 2 bytes)
  buffer.writeUInt16LE(4, 32); // block align
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let off = 44;
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, left[i] * gain));
    const r = Math.max(-1, Math.min(1, right[i] * gain));
    buffer.writeInt16LE(Math.round(l * 32767), off);
    buffer.writeInt16LE(Math.round(r * 32767), off + 2);
    off += 4;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  console.log(`  wrote ${path.relative(process.cwd(), filePath)} (${(buffer.length / 1024).toFixed(0)} KB)`);
}

/**
 * Binaural-beat pad: each harmonic partial is offset by `beatHz` between the
 * left and right channels, so every partial pair beats at the same perceived
 * rate, reinforcing a single entrainment frequency.
 */
function generateMusic({ carrierHz, beatHz, partials, noiseAmp, seed }) {
  const loopSeconds = 20;
  const crossSeconds = 3;
  const loopSamples = loopSeconds * SAMPLE_RATE;
  const crossSamples = crossSeconds * SAMPLE_RATE;
  const total = loopSamples + crossSamples;

  const left = new Float32Array(total);
  const right = new Float32Array(total);

  // Shared warm noise bed (centered, so it adds no beat of its own).
  const rng = makeRng(seed);
  let bed = brownNoise(total, rng);
  bed = lowPass(bed, 400);

  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE;
    // Slow breathing swell.
    const swell = 0.72 + 0.28 * Math.sin(2 * Math.PI * 0.08 * t);
    let l = 0;
    let r = 0;
    for (const p of partials) {
      const fl = carrierHz * p.ratio;
      const fr = fl + beatHz; // constant offset -> same perceived beat per partial
      l += p.amp * Math.sin(2 * Math.PI * fl * t);
      r += p.amp * Math.sin(2 * Math.PI * fr * t);
    }
    const air = bed[i] * noiseAmp;
    left[i] = l * swell + air;
    right[i] = r * swell + air;
  }

  return {
    left: makeSeamless(left, loopSamples, crossSamples),
    right: makeSeamless(right, loopSamples, crossSamples),
  };
}

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/**
 * A small synthesized "drum machine + synths" used by the beat tracks. Returns
 * stereo buffers plus voice helpers that write into them. Everything is built
 * from oscillators and filtered noise so the grooves stay royalty-free and
 * reproducible.
 */
function makeKit(N, seed) {
  const SR = SAMPLE_RATE;
  const rng = makeRng(seed);
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const add = (idx, l, r) => {
    if (idx >= 0 && idx < N) { L[idx] += l; R[idx] += r; }
  };

  // Punchy kick: phase-accurate pitch sweep, soft saturation, and a click transient.
  const kick = (start, o = {}) => {
    const { gain = 0.9, pitchStart = 110, pitchEnd = 46, decay = 12, punch = 30, dur = 0.36, click = 0.25 } = o;
    const n = Math.floor(dur * SR);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = Math.exp(-t * decay);
      const f = pitchEnd + (pitchStart - pitchEnd) * Math.exp(-t * punch);
      phase += (2 * Math.PI * f) / SR;
      let body = Math.tanh(Math.sin(phase) * 1.7) / Math.tanh(1.7); // soft saturation = punch
      let s = body * env;
      if (t < 0.006) s += Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 500) * click; // beater click
      add(start + i, s * gain, s * gain);
    }
  };

  // Snare/clap-ish: a tonal body plus high-passed noise with its own decay.
  const snare = (start, o = {}) => {
    const { gain = 0.45, decay = 18, noiseAmt = 0.6, tone = 185, toneAmt = 0.4 } = o;
    const n = Math.floor(0.25 * SR);
    let hp = 0;
    let prevN = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = Math.exp(-t * decay);
      const body =
        (Math.sin(2 * Math.PI * tone * t) + Math.sin(2 * Math.PI * tone * 1.6 * t)) *
        0.5 *
        Math.exp(-t * decay * 1.8);
      const w = rng() * 2 - 1;
      hp = 0.72 * (hp + w - prevN); // high-pass the noise = snappier
      prevN = w;
      const s = (body * toneAmt + hp * env * noiseAmt) * gain;
      add(start + i, s, s);
    }
  };

  // Multi-tap clap: three quick transients then a diffuse tail (house/garage backbeat).
  const clap = (start, o = {}) => {
    const { gain = 0.5, pan = 0 } = o;
    const n = Math.floor(0.24 * SR);
    const taps = [0, 0.009, 0.018];
    let hp = 0;
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let amp = Math.exp(-t * 15) * 0.6; // tail
      for (const tp of taps) if (t >= tp) amp += Math.exp(-(t - tp) * 230);
      const w = rng() * 2 - 1;
      hp = 0.6 * (hp + w - prev);
      prev = w;
      const s = hp * amp * gain * 0.5;
      add(start + i, s * (pan <= 0 ? 1 : 0.7), s * (pan >= 0 ? 1 : 0.7));
    }
  };

  // Metallic 808-style hat: a cluster of square oscillators, high-passed.
  const HAT_RATIOS = [2.0, 3.0, 4.16, 5.43, 6.79, 8.21];
  const hat = (start, o = {}) => {
    const { gain = 0.16, open = false, pan = 0 } = o;
    const n = Math.floor((open ? 0.18 : 0.05) * SR);
    const f0 = 1480;
    let hp = 0;
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = Math.exp(-t * (open ? 20 : 55));
      let sq = 0;
      for (const r of HAT_RATIOS) sq += Math.sign(Math.sin(2 * Math.PI * f0 * r * t));
      sq /= HAT_RATIOS.length;
      hp = 0.93 * (hp + sq - prev); // high-pass -> metallic sizzle
      prev = sq;
      const s = hp * env * gain;
      add(start + i, s * (pan <= 0 ? 1 : 0.5), s * (pan >= 0 ? 1 : 0.5));
    }
  };

  const shaker = (start, o = {}) => {
    const { gain = 0.08, pan = 0 } = o;
    const n = Math.floor(0.045 * SR);
    let hp = 0;
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = Math.exp(-t * 65);
      const w = rng() * 2 - 1;
      hp = 0.9 * (hp + w - prev);
      prev = w;
      const s = hp * env * gain;
      add(start + i, s * (pan <= 0 ? 1 : 0.6), s * (pan >= 0 ? 1 : 0.6));
    }
  };

  // Warm sub: fundamental + a touch of 2nd harmonic, gently saturated.
  const sub = (start, freq, dur, o = {}) => {
    const { gain = 0.5, attack = 0.008, release = 0.06 } = o;
    const n = Math.floor(dur * SR);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = Math.min(1, t / attack) * Math.min(1, (dur - t) / release);
      const raw = Math.sin(2 * Math.PI * freq * t) * 0.9 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.12;
      const s = (Math.tanh(raw * 1.3) / Math.tanh(1.3)) * env * gain;
      add(start + i, s, s);
    }
  };

  // Lush, wide pad: band-limited saw-ish voices (1/h harmonics), detuned per channel.
  const pad = (start, freqs, dur, o = {}) => {
    const { gain = 0.14, attack = 0.4, release = 0.5, detune = 6, bright = 0 } = o;
    const n = Math.floor(dur * SR);
    const harmonics = 3 + Math.round(bright * 60); // richer/brighter pads use more harmonics
    const nyq = SR * 0.45;
    const k = (gain / freqs.length) * 0.6;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = Math.min(1, t / attack) * Math.min(1, (dur - t) / release);
      let l = 0;
      let r = 0;
      for (const f of freqs) {
        const fr = f * (1 + detune / 10000);
        for (let h = 1; h <= harmonics; h++) {
          if (f * h > nyq) break;
          const a = 1 / h;
          l += a * Math.sin(2 * Math.PI * f * h * t);
          r += a * Math.sin(2 * Math.PI * fr * h * t);
        }
      }
      add(start + i, l * k * env, r * k * env);
    }
  };

  // FM electric piano (Rhodes-ish): a fast-decaying modulator gives the tine attack.
  const key = (start, freq, dur, o = {}) => {
    const { gain = 0.2, pan = 0, decay = 3.2 } = o;
    const n = Math.floor(dur * SR);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = Math.min(1, t / 0.004) * Math.exp(-t * decay);
      const index = 2.4 * Math.exp(-t * 22); // bell-like attack, mellow sustain
      const mod = Math.sin(2 * Math.PI * freq * 14 * t) * index;
      const s = (Math.sin(2 * Math.PI * freq * t + mod) + 0.3 * Math.sin(2 * Math.PI * freq * t)) * env * gain * 0.6;
      add(start + i, s * (pan <= 0 ? 1 : 0.7), s * (pan >= 0 ? 1 : 0.7));
    }
  };

  // Vinyl hiss + occasional crackle across the whole loop.
  const crackle = (o = {}) => {
    const { gain = 0.6, density = 0.0008 } = o;
    for (let i = 0; i < N; i++) {
      let s = (rng() * 2 - 1) * 0.01;
      if (rng() < density) s += (rng() * 2 - 1) * 0.5;
      L[i] += s * gain;
      R[i] += s * gain;
    }
  };

  // Airy filtered-noise wash that slowly swells.
  const atmos = (o = {}) => {
    const { gain = 0.05, cutoff = 1200, swellHz = 0.06 } = o;
    const tmp = new Float32Array(N);
    for (let i = 0; i < N; i++) tmp[i] = rng() * 2 - 1;
    const filtered = lowPass(highPass(tmp, 250), cutoff);
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      const sw = 0.5 + 0.5 * Math.sin(2 * Math.PI * swellHz * t);
      const s = filtered[i] * sw * gain;
      L[i] += s;
      R[i] += s;
    }
  };

  return { L, R, kick, snare, clap, hat, shaker, sub, pad, key, crackle, atmos };
}

/**
 * Apply send effects to a finished kit, then fold the loop: a reverb wash for
 * space, and an optional four-on-the-floor sidechain "pump". (reverbChannel and
 * duckEnvelope are declared below; function declarations hoist.)
 */
function finishTrack(kit, loopSamples, tail, opts = {}) {
  let L = kit.L;
  let R = kit.R;
  if (opts.reverbMix) {
    L = reverbChannel(L, opts.reverbMix);
    R = reverbChannel(R, opts.reverbMix);
  }
  if (opts.pumpBpm) {
    const duck = duckEnvelope(L.length, opts.pumpBpm, opts.pumpDepth ?? 0.4, 0.14);
    for (let i = 0; i < L.length; i++) {
      L[i] *= duck[i];
      R[i] *= duck[i];
    }
  }
  return foldTail(L, R, loopSamples, tail);
}

/** Fold voice tails that cross the loop point back onto the head for a seamless loop. */
function foldTail(L, R, loopSamples, tail) {
  const left = new Float32Array(loopSamples);
  const right = new Float32Array(loopSamples);
  left.set(L.subarray(0, loopSamples));
  right.set(R.subarray(0, loopSamples));
  for (let i = 0; i < tail; i++) {
    left[i] += L[loopSamples + i];
    right[i] += R[loopSamples + i];
  }
  return { left, right };
}

/** Lo-fi hip-hop, in the jazzy, dusty spirit of Nujabes / J Dilla. */
function generateLoFi() {
  const bpm = 85;
  const bars = 8;
  const swing = 0.2; // laid-back shuffle
  const stepDur = 60 / bpm / 4;
  const totalSteps = bars * 16;
  const loopSamples = Math.round(totalSteps * stepDur * SAMPLE_RATE);
  const tail = Math.round(0.9 * SAMPLE_RATE);
  const N = loopSamples + tail;
  const kit = makeKit(N, 101);
  const pos = (step) => {
    const t = step * stepDur + (step % 2 === 1 ? swing * stepDur : 0);
    return Math.round(t * SAMPLE_RATE);
  };
  // Fmaj7 – Em7 – Dm7 – G7, two bars each.
  const chords = [
    [53, 57, 60, 64],
    [52, 55, 59, 62],
    [50, 53, 57, 60],
    [55, 59, 62, 65],
  ];
  const bassRoots = [41, 40, 38, 43];

  kit.crackle({ gain: 0.6, density: 0.0008 });
  for (let bar = 0; bar < bars; bar++) {
    const ci = Math.floor(bar / 2) % 4;
    const chord = chords[ci];
    const base = bar * 16;
    if (bar % 2 === 0) {
      kit.pad(pos(base), chord.map(midiToFreq), 2 * 16 * stepDur * 0.98, {
        gain: 0.12, attack: 0.5, release: 0.6, detune: 6, bright: 0.05,
      });
    }
    // Rhodes chord stabs on beat 1 and the swung "and" of beat 2.
    for (const st of [0, 6]) for (const m of chord) kit.key(pos(base + st), midiToFreq(m), 0.55, { gain: 0.12 });
    kit.sub(pos(base + 0), midiToFreq(bassRoots[ci]), stepDur * 6, { gain: 0.5 });
    kit.sub(pos(base + 10), midiToFreq(bassRoots[ci]), stepDur * 3, { gain: 0.42 });
    for (let s = 0; s < 16; s++) {
      const p = pos(base + s);
      if (s === 0 || s === 10) kit.kick(p, { gain: 0.9, pitchStart: 100, pitchEnd: 48, decay: 12 });
      if (s === 4 || s === 12) kit.snare(p, { gain: 0.42, decay: 16, noiseAmt: 0.5, tone: 180, toneAmt: 0.3 });
      if (s % 2 === 0) kit.hat(p, { gain: 0.11, open: s === 14, pan: s % 4 === 0 ? -0.6 : 0.6 });
    }
  }
  return finishTrack(kit, loopSamples, tail, { reverbMix: 0.12 });
}

/** Liquid drum & bass, lush and rolling like LTJ Bukem / Netsky. */
function generateLiquid() {
  const bpm = 172;
  const bars = 8;
  const stepDur = 60 / bpm / 4;
  const totalSteps = bars * 16;
  const loopSamples = Math.round(totalSteps * stepDur * SAMPLE_RATE);
  const tail = Math.round(0.6 * SAMPLE_RATE);
  const N = loopSamples + tail;
  const kit = makeKit(N, 202);
  const pos = (step) => Math.round(step * stepDur * SAMPLE_RATE);
  // Am9 then Fmaj7, four bars each.
  const chords = [
    [57, 60, 64, 67, 71],
    [53, 57, 60, 64],
  ];
  const bassRoots = [33, 29]; // deep sub

  kit.atmos({ gain: 0.045, cutoff: 1300, swellHz: 0.05 });
  for (let bar = 0; bar < bars; bar++) {
    const ci = Math.floor(bar / 4) % 2;
    const chord = chords[ci];
    const base = bar * 16;
    if (bar % 4 === 0) {
      kit.pad(pos(base), chord.map(midiToFreq), 4 * 16 * stepDur * 0.99, {
        gain: 0.1, attack: 0.8, release: 1.0, detune: 7, bright: 0.06,
      });
    }
    kit.sub(pos(base + 0), midiToFreq(bassRoots[ci]), stepDur * 6, { gain: 0.5 });
    kit.sub(pos(base + 10), midiToFreq(bassRoots[ci]), stepDur * 4, { gain: 0.45 });
    for (let s = 0; s < 16; s++) {
      const p = pos(base + s);
      if (s === 0 || s === 10) kit.kick(p, { gain: 0.9, pitchStart: 120, pitchEnd: 50, decay: 14 });
      if (s === 4 || s === 12) kit.snare(p, { gain: 0.5, decay: 20, noiseAmt: 0.6, tone: 190, toneAmt: 0.35 });
      kit.hat(p, { gain: s % 2 === 0 ? 0.12 : 0.07, open: s === 6 || s === 14, pan: s % 2 === 0 ? -0.5 : 0.5 });
      if (s === 7 || s === 15) kit.snare(p, { gain: 0.16, decay: 26, noiseAmt: 0.7, tone: 200, toneAmt: 0.2 });
    }
  }
  return finishTrack(kit, loopSamples, tail, { reverbMix: 0.22 });
}

/** Future garage / chillstep — smoky, 2-step, in the mood of Burial. */
function generateChillstep() {
  const bpm = 140;
  const bars = 8;
  const swing = 0.12;
  const stepDur = 60 / bpm / 4;
  const totalSteps = bars * 16;
  const loopSamples = Math.round(totalSteps * stepDur * SAMPLE_RATE);
  const tail = Math.round(0.8 * SAMPLE_RATE);
  const N = loopSamples + tail;
  const kit = makeKit(N, 303);
  const pos = (step) => {
    const t = step * stepDur + (step % 2 === 1 ? swing * stepDur : 0);
    return Math.round(t * SAMPLE_RATE);
  };
  // Em – C – G – D, two bars each.
  const chords = [
    [52, 55, 59],
    [48, 52, 55],
    [55, 59, 62],
    [50, 54, 57],
  ];
  const bassRoots = [40, 36, 43, 38];

  kit.crackle({ gain: 0.45, density: 0.001 });
  kit.atmos({ gain: 0.05, cutoff: 2400, swellHz: 0.08 }); // rain-like air
  for (let bar = 0; bar < bars; bar++) {
    const ci = Math.floor(bar / 2) % 4;
    const chord = chords[ci];
    const base = bar * 16;
    if (bar % 2 === 0) {
      kit.pad(pos(base), chord.map(midiToFreq), 2 * 16 * stepDur * 0.98, {
        gain: 0.11, attack: 0.7, release: 0.8, detune: 8, bright: 0.04,
      });
    }
    kit.sub(pos(base + 0), midiToFreq(bassRoots[ci]), stepDur * 8, { gain: 0.46 });
    for (let s = 0; s < 16; s++) {
      const p = pos(base + s);
      if (s === 0 || s === 11) kit.kick(p, { gain: 0.85, pitchStart: 95, pitchEnd: 46, decay: 11 });
      if (s === 4 || s === 12) kit.snare(p, { gain: 0.4, decay: 17, noiseAmt: 0.55, tone: 175, toneAmt: 0.3 });
      if (s === 2 || s === 6 || s === 10 || s === 14) kit.shaker(p, { gain: 0.09, pan: s % 4 === 2 ? -0.6 : 0.6 });
      if (s === 8) kit.hat(p, { gain: 0.1, open: true });
    }
  }
  return finishTrack(kit, loopSamples, tail, { reverbMix: 0.16 });
}

/** Dreamy downtempo with ping-pong arps, à la Tycho / Bonobo. */
function generateDowntempo() {
  const bpm = 98;
  const bars = 8;
  const stepDur = 60 / bpm / 4;
  const totalSteps = bars * 16;
  const loopSamples = Math.round(totalSteps * stepDur * SAMPLE_RATE);
  const tail = Math.round(0.8 * SAMPLE_RATE);
  const N = loopSamples + tail;
  const kit = makeKit(N, 404);
  const pos = (step) => Math.round(step * stepDur * SAMPLE_RATE);
  // D – A – Bm – G, two bars each.
  const chords = [
    [50, 54, 57],
    [57, 61, 64],
    [59, 62, 66],
    [55, 59, 62],
  ];
  const bassRoots = [38, 45, 47, 43];

  kit.atmos({ gain: 0.04, cutoff: 1700, swellHz: 0.05 });
  for (let bar = 0; bar < bars; bar++) {
    const ci = Math.floor(bar / 2) % 4;
    const chord = chords[ci];
    const base = bar * 16;
    if (bar % 2 === 0) {
      kit.pad(pos(base), chord.map(midiToFreq), 2 * 16 * stepDur * 0.98, {
        gain: 0.1, attack: 0.6, release: 0.7, detune: 7, bright: 0.07,
      });
    }
    kit.sub(pos(base + 0), midiToFreq(bassRoots[ci]), stepDur * 6, { gain: 0.46 });
    kit.sub(pos(base + 8), midiToFreq(bassRoots[ci]), stepDur * 4, { gain: 0.4 });
    // Ping-pong 8th-note arpeggio an octave up.
    const arp = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[1] + 12];
    for (let e = 0; e < 8; e++) {
      kit.key(pos(base + e * 2), midiToFreq(arp[e % arp.length]), stepDur * 2.2, {
        gain: 0.1, pan: e % 2 === 0 ? -0.8 : 0.8, decay: 4,
      });
    }
    for (let s = 0; s < 16; s++) {
      const p = pos(base + s);
      if (s === 0 || s === 8) kit.kick(p, { gain: 0.8, pitchStart: 90, pitchEnd: 46, decay: 11 });
      if (s === 4 || s === 12) kit.snare(p, { gain: 0.34, decay: 15, noiseAmt: 0.45, tone: 185, toneAmt: 0.3 });
      if (s % 2 === 0) kit.shaker(p, { gain: 0.07, pan: s % 4 === 0 ? -0.5 : 0.5 });
    }
  }
  return finishTrack(kit, loopSamples, tail, { reverbMix: 0.16 });
}

/** Dark, sultry deep house — spacious four-on-the-floor in the spirit of ZHU. */
function generateZhu() {
  const bpm = 122;
  const bars = 8;
  const stepDur = 60 / bpm / 4;
  const totalSteps = bars * 16;
  const loopSamples = Math.round(totalSteps * stepDur * SAMPLE_RATE);
  const tail = Math.round(0.7 * SAMPLE_RATE);
  const N = loopSamples + tail;
  const kit = makeKit(N, 505);
  const pos = (step) => Math.round(step * stepDur * SAMPLE_RATE);
  // F#m then D, four bars each — dark and sparse.
  const chords = [
    [54, 57, 61],
    [50, 54, 57],
  ];
  const bassRoots = [30, 26]; // deep sub

  kit.atmos({ gain: 0.05, cutoff: 700, swellHz: 0.05 }); // dark wash
  kit.crackle({ gain: 0.3, density: 0.0006 });
  for (let bar = 0; bar < bars; bar++) {
    const ci = Math.floor(bar / 4) % 2;
    const chord = chords[ci];
    const base = bar * 16;
    if (bar % 4 === 0) {
      kit.pad(pos(base), chord.map(midiToFreq), 4 * 16 * stepDur * 0.99, {
        gain: 0.09, attack: 1.0, release: 1.2, detune: 9, bright: 0.02,
      });
    }
    // Sultry sustained lead note (root, up an octave) once per bar.
    kit.key(pos(base + 0), midiToFreq(chord[0] + 12), stepDur * 6, { gain: 0.07, decay: 1.6 });
    // Dark chord stabs on the "and" of beats 2 and 4.
    for (const st of [6, 14]) for (const m of chord) kit.key(pos(base + st), midiToFreq(m), 0.32, { gain: 0.07, decay: 5 });
    for (let s = 0; s < 16; s++) {
      const p = pos(base + s);
      if (s % 4 === 0) kit.kick(p, { gain: 0.95, pitchStart: 105, pitchEnd: 44, decay: 11 }); // four-on-floor
      if (s % 4 === 2) kit.hat(p, { gain: 0.13, open: true, pan: s % 8 === 2 ? -0.4 : 0.4 }); // off-beat open hats
      if (s === 4 || s === 12) kit.clap(p, { gain: 0.32 }); // backbeat clap
      if (s % 4 === 2) kit.sub(pos(base + s), midiToFreq(bassRoots[ci]), stepDur * 1.6, { gain: 0.5 }); // off-beat house bass
    }
  }
  return finishTrack(kit, loopSamples, tail, { reverbMix: 0.18, pumpBpm: 122, pumpDepth: 0.45 });
}

/** Sidechain "pump" envelope: dips on every quarter-note kick and recovers. */
function duckEnvelope(N, bpm, depth, tau) {
  const beat = 60 / bpm;
  const env = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const tInBeat = (i / SAMPLE_RATE) % beat;
    env[i] = 1 - depth + depth * (1 - Math.exp(-tInBeat / tau));
  }
  return env;
}

/** One-pole low-pass with a time-varying cutoff, for filter "build" sweeps. */
function sweepLowPass(buf, cutoffFn) {
  const out = new Float32Array(buf.length);
  const dt = 1 / SAMPLE_RATE;
  let prev = 0;
  for (let i = 0; i < buf.length; i++) {
    const rc = 1 / (2 * Math.PI * cutoffFn(i / SAMPLE_RATE));
    const alpha = dt / (rc + dt);
    prev += alpha * (buf[i] - prev);
    out[i] = prev;
  }
  return out;
}

function allpass(buf, D, g) {
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const xnD = i >= D ? buf[i - D] : 0;
    const ynD = i >= D ? out[i - D] : 0;
    out[i] = -g * buf[i] + xnD + g * ynD;
  }
  return out;
}

/** Cheap Schroeder reverb (4 combs + 2 allpasses) for a spacious wash. */
function reverbChannel(buf, mix) {
  const SR = SAMPLE_RATE;
  const combDelays = [0.0297, 0.0371, 0.0411, 0.0437];
  const combG = 0.72;
  const wet = new Float32Array(buf.length);
  for (const d of combDelays) {
    const D = Math.floor(d * SR);
    const y = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) {
      y[i] = buf[i] + combG * (i >= D ? y[i - D] : 0);
      wet[i] += y[i];
    }
  }
  for (let i = 0; i < buf.length; i++) wet[i] /= combDelays.length;
  let ap = allpass(wet, Math.floor(0.005 * SR), 0.7);
  ap = allpass(ap, Math.floor(0.0017 * SR), 0.7);
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] * (1 - mix) + ap[i] * mix;
  return out;
}

/**
 * Warm, euphoric melodic house in the spirit of RÜFÜS DU SOL. The signatures
 * are layered deliberately: an emotional i–VI–III–VII progression, a wide
 * detuned pad, a driving arp with dotted-eighth delay throws, a sidechain
 * "pump" that ducks the pad and bass on every kick, a filter that swells over
 * the 16-bar arrangement, and a reverb wash for space.
 */
function generateRufus() {
  const bpm = 123;
  const bars = 16; // a full 16-bar arrangement so it breathes rather than loops fast
  const stepDur = 60 / bpm / 4;
  const barDur = stepDur * 16;
  const totalSteps = bars * 16;
  const loopSamples = Math.round(totalSteps * stepDur * SAMPLE_RATE);
  const loopDur = loopSamples / SAMPLE_RATE;
  const tail = Math.round(1.0 * SAMPLE_RATE);
  const N = loopSamples + tail;

  // Separate buses so we can reverb/sweep the tonal parts and sidechain them
  // independently of the drums.
  const tonal = makeKit(N, 606); // pad + arp + delay throws
  const bass = makeKit(N, 607); // dry sub
  const drums = makeKit(N, 608); // kick / hats / clap / shaker (kept punchy)
  const pos = (step) => Math.round(step * stepDur * SAMPLE_RATE);

  // i–VI–III–VII in B minor with colour tones: Bm7 – Gmaj7 – Dadd9 – Amaj7.
  const chords = [
    [59, 62, 66, 69], // Bm7
    [55, 59, 62, 66], // Gmaj7
    [62, 66, 69, 64], // Dadd9
    [57, 61, 64, 68], // Amaj7
  ];
  const bassRoots = [35, 31, 38, 33];

  for (let bar = 0; bar < bars; bar++) {
    const ci = Math.floor(bar / 2) % 4;
    const chord = chords[ci];
    const base = bar * 16;

    // Wide, lush pad once per chord.
    if (bar % 2 === 0) {
      tonal.pad(pos(base), chord.map(midiToFreq), 2 * barDur * 0.99, {
        gain: 0.1, attack: 0.7, release: 0.9, detune: 12, bright: 0.05,
      });
    }

    // Plucky off-beat sub bass (the house "pump"), plus a grounding downbeat.
    bass.sub(pos(base + 0), midiToFreq(bassRoots[ci]), stepDur * 1.2, { gain: 0.42 });
    for (const s of [2, 6, 10, 14]) {
      bass.sub(pos(base + s), midiToFreq(bassRoots[ci]), stepDur * 1.7, { gain: 0.5 });
    }

    // Driving arpeggio (up-and-back contour) with dotted-eighth delay throws.
    const tones = chord.concat(chord.map((n) => n + 12));
    const contour = [0, 2, 4, 5, 7, 5, 4, 2, 0, 2, 4, 6, 7, 6, 4, 2];
    const arpGain = 0.55 + 0.45 * (bar / bars); // arp grows as the track builds
    for (let s = 0; s < 16; s++) {
      const note = tones[contour[(s + bar) % contour.length] % tones.length] + 12;
      const pan = s % 2 === 0 ? -0.7 : 0.7;
      tonal.key(pos(base + s), midiToFreq(note), stepDur * 1.3, { gain: 0.08 * arpGain, pan, decay: 6 });
      // Dotted-eighth (3/16) echoes, decaying and ping-ponged.
      tonal.key(pos(base + s + 3), midiToFreq(note), stepDur * 1.1, { gain: 0.04 * arpGain, pan: -pan, decay: 7 });
      tonal.key(pos(base + s + 6), midiToFreq(note), stepDur * 0.9, { gain: 0.02 * arpGain, pan, decay: 8 });
    }

    // Drums.
    for (let s = 0; s < 16; s++) {
      const p = pos(base + s);
      if (s % 4 === 0) drums.kick(p, { gain: 0.92, pitchStart: 100, pitchEnd: 46, decay: 11 });
      if (s % 4 === 2) drums.hat(p, { gain: 0.12, open: true, pan: s % 8 === 2 ? -0.4 : 0.4 });
      if (s === 4 || s === 12) drums.clap(p, { gain: 0.34 });
      if (s % 2 === 1) drums.shaker(p, { gain: 0.05, pan: s % 4 === 1 ? -0.5 : 0.5 });
    }
  }

  // Filter build: cutoff swells up and back over the whole loop (seamless).
  const cutoffFn = (t) => 650 + 4500 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / loopDur));
  const wetL = reverbChannel(sweepLowPass(tonal.L, cutoffFn), 0.2);
  const wetR = reverbChannel(sweepLowPass(tonal.R, cutoffFn), 0.2);

  // Sidechain: pad + bass duck on every kick; drums punch through.
  const duck = duckEnvelope(N, bpm, 0.55, 0.16);
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    L[i] = (wetL[i] + bass.L[i]) * duck[i] + drums.L[i];
    R[i] = (wetR[i] + bass.R[i]) * duck[i] + drums.R[i];
  }
  return foldTail(L, R, loopSamples, tail);
}

/**
 * A cat's purr — a warm low rumble around 25 Hz (the frequency cats purr at,
 * often associated with calming and healing). Harmonics make it audible on
 * small speakers, a breathy noise layer adds texture, and a slow breath
 * envelope rolls it in and out like a real purr.
 */
function generatePurr() {
  const loopSeconds = 12;
  const crossSeconds = 2;
  const loopSamples = loopSeconds * SAMPLE_RATE;
  const crossSamples = crossSeconds * SAMPLE_RATE;
  const total = loopSamples + crossSamples;
  const rng = makeRng(555);
  const buf = new Float32Array(total);

  const purrHz = 25; // the purr's fundamental rumble
  const breathHz = 1.4; // in/out purr cycle, ~per second

  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE;
    let s =
      Math.sin(2 * Math.PI * purrHz * t) * 1.0 +
      Math.sin(2 * Math.PI * purrHz * 2 * t) * 0.5 +
      Math.sin(2 * Math.PI * purrHz * 3 * t) * 0.3 +
      Math.sin(2 * Math.PI * purrHz * 4 * t) * 0.15;
    s += (rng() * 2 - 1) * 0.15; // breathy flutter
    // Breath envelope — rolls in and out, never fully silent.
    const breath = 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * breathHz * t), 1.5);
    buf[i] = s * breath * 0.4;
  }
  // Keep it warm and rumbly.
  const warm = lowPass(buf, 400);
  return makeSeamless(warm, loopSamples, crossSamples);
}

/**
 * Warm singing-bowl chime. The shimmer is produced by pairs of slightly
 * detuned partials beating against each other (a bounded, natural effect) —
 * NOT by frequency-modulating each partial, which previously created a
 * runaway metallic warble on the high partials.
 */
function generateBell() {
  const duration = 4.0;
  const n = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(n);

  const fundamental = 392; // G4 — calm and warm

  // Mostly harmonic partials with only a hint of inharmonic bowl colour, and
  // gentler highs so the chime is warm rather than clangy. `beat` Hz is the
  // detuning between each partial's two voices, giving a slow natural shimmer.
  const partials = [
    { ratio: 1.0, amp: 1.0, decay: 3.8, beat: 0.7 },
    { ratio: 2.0, amp: 0.42, decay: 3.0, beat: 1.0 },
    { ratio: 2.76, amp: 0.16, decay: 2.2, beat: 1.3 }, // subtle bowl inharmonicity
    { ratio: 4.0, amp: 0.07, decay: 1.6, beat: 1.6 },
  ];

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;
    for (const p of partials) {
      const env = Math.exp(-t / p.decay);
      const f = fundamental * p.ratio;
      // Two fixed, slightly detuned voices beat at `p.beat` Hz — bounded shimmer.
      const voice = Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * (f + p.beat) * t);
      s += p.amp * env * voice * 0.5;
    }
    const attack = Math.min(1, t / 0.01); // soft strike
    out[i] = s * attack * 0.5;
  }
  // A touch of low-pass adds warmth and tames any remaining edge.
  return lowPass(out, 4000);
}

/** One-pole low-pass filter (in place is avoided; returns new array). */
function lowPass(input, cutoffHz) {
  const dt = 1 / SAMPLE_RATE;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = dt / (rc + dt);
  const out = new Float32Array(input.length);
  let prev = 0;
  for (let i = 0; i < input.length; i++) {
    prev = prev + alpha * (input[i] - prev);
    out[i] = prev;
  }
  return out;
}

/** One-pole high-pass filter. */
function highPass(input, cutoffHz) {
  const dt = 1 / SAMPLE_RATE;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = rc / (rc + dt);
  const out = new Float32Array(input.length);
  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < input.length; i++) {
    prevOut = alpha * (prevOut + input[i] - prevIn);
    prevIn = input[i];
    out[i] = prevOut;
  }
  return out;
}

/** Crossfade the tail of an over-length buffer into its head for seamless looping. */
function makeSeamless(buffer, loopSamples, crossSamples) {
  const out = new Float32Array(loopSamples);
  for (let i = 0; i < loopSamples; i++) {
    if (i < crossSamples) {
      const w = i / crossSamples; // 0 -> 1
      out[i] = buffer[i] * w + buffer[i + loopSamples] * (1 - w);
    } else {
      out[i] = buffer[i];
    }
  }
  return out;
}

function whiteNoise(n, rng) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rng() * 2 - 1;
  return out;
}

function brownNoise(n, rng) {
  const out = new Float32Array(n);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = rng() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    out[i] = last * 12;
  }
  return out;
}

function generateAmbient(kind) {
  const loopSeconds = 12;
  const crossSeconds = 2;
  const loopSamples = loopSeconds * SAMPLE_RATE;
  const crossSamples = crossSeconds * SAMPLE_RATE;
  const total = loopSamples + crossSamples;
  const rng = makeRng(kind === 'rain' ? 1337 : kind === 'ocean' ? 2024 : 7); // per-sound seed

  let raw;
  if (kind === 'rain') {
    // Bright, steady hiss with a touch of body.
    let n = whiteNoise(total, rng);
    n = highPass(n, 700);
    n = lowPass(n, 7000);
    raw = n;
  } else if (kind === 'ocean') {
    // Brown noise swelling slowly like waves.
    let n = brownNoise(total, rng);
    n = lowPass(n, 1200);
    for (let i = 0; i < total; i++) {
      const t = i / SAMPLE_RATE;
      // Two slow LFOs combine into an irregular swell.
      const swell =
        0.5 +
        0.35 * Math.sin(2 * Math.PI * 0.07 * t) +
        0.15 * Math.sin(2 * Math.PI * 0.11 * t + 1.3);
      n[i] *= Math.max(0, swell);
    }
    raw = n;
  } else {
    // forest: soft low wind with gentle movement.
    let n = brownNoise(total, rng);
    n = lowPass(n, 600);
    for (let i = 0; i < total; i++) {
      const t = i / SAMPLE_RATE;
      const gust = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.05 * t + 0.5);
      n[i] *= gust;
    }
    raw = n;
  }

  return makeSeamless(raw, loopSamples, crossSamples);
}

console.log('Generating audio assets...');
writeWav(path.join(OUT_DIR, 'bell.wav'), generateBell(), { master: false });
writeWav(path.join(AMBIENT_DIR, 'rain.wav'), generateAmbient('rain'));
writeWav(path.join(AMBIENT_DIR, 'ocean.wav'), generateAmbient('ocean'));
writeWav(path.join(AMBIENT_DIR, 'forest.wav'), generateAmbient('forest'));
writeWav(path.join(OUT_DIR, 'purr.wav'), generatePurr());

// Frequency music — binaural-beat pads (stereo).
const calm = generateMusic({
  carrierHz: 216, // A3 in 432 Hz tuning
  beatHz: 7.83, // Schumann resonance (theta/alpha border) — grounding calm
  partials: [
    { ratio: 1.0, amp: 1.0 },
    { ratio: 2.0, amp: 0.34 },
    { ratio: 3.0, amp: 0.12 },
  ],
  noiseAmp: 0.06,
  seed: 11,
});
writeWavStereo(path.join(MUSIC_DIR, 'calm.wav'), calm.left, calm.right, { targetDb: -16 });

const focus = generateMusic({
  carrierHz: 256, // "scientific" C
  beatHz: 14, // low-beta / SMR — alert, calm focus
  partials: [
    { ratio: 1.0, amp: 0.9 },
    { ratio: 1.5, amp: 0.42 }, // a perfect fifth adds brightness
    { ratio: 2.0, amp: 0.28 },
    { ratio: 3.0, amp: 0.13 },
  ],
  noiseAmp: 0.03,
  seed: 22,
});
writeWavStereo(path.join(MUSIC_DIR, 'focus.wav'), focus.left, focus.right, { targetDb: -16 });

const deep = generateMusic({
  carrierHz: 144, // low warm drone
  beatHz: 3, // delta — deep rest / sleep
  partials: [
    { ratio: 1.0, amp: 1.0 },
    { ratio: 2.0, amp: 0.22 },
  ],
  noiseAmp: 0.05,
  seed: 33,
});
writeWavStereo(path.join(MUSIC_DIR, 'deep.wav'), deep.left, deep.right, { targetDb: -16 });

const lofi = generateLoFi();
writeWavStereo(path.join(BEATS_DIR, 'lofi.wav'), lofi.left, lofi.right);
const liquid = generateLiquid();
writeWavStereo(path.join(BEATS_DIR, 'liquid.wav'), liquid.left, liquid.right);
const chillstep = generateChillstep();
writeWavStereo(path.join(BEATS_DIR, 'chillstep.wav'), chillstep.left, chillstep.right);
const downtempo = generateDowntempo();
writeWavStereo(path.join(BEATS_DIR, 'downtempo.wav'), downtempo.left, downtempo.right);
const deephouse = generateZhu();
writeWavStereo(path.join(BEATS_DIR, 'deephouse.wav'), deephouse.left, deephouse.right);
const melodic = generateRufus();
writeWavStereo(path.join(BEATS_DIR, 'melodic.wav'), melodic.left, melodic.right);

console.log('Done.');
