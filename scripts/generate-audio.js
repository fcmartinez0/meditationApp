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
 */

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 22050;
const OUT_DIR = path.join(__dirname, '..', 'assets', 'audio');
const AMBIENT_DIR = path.join(OUT_DIR, 'ambient');
const MUSIC_DIR = path.join(OUT_DIR, 'music');

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

function writeWav(filePath, samples) {
  // Normalize to avoid clipping, leaving a little headroom.
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  const gain = peak > 0 ? 0.92 / peak : 1;

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

function writeWavStereo(filePath, left, right) {
  const n = Math.min(left.length, right.length);
  // Joint normalization keeps the stereo image balanced.
  let peak = 0;
  for (let i = 0; i < n; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const gain = peak > 0 ? 0.9 / peak : 1;

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

/** Singing-bowl style chime: inharmonic partials with a soft beat and long decay. */
function generateBell() {
  const duration = 4.0;
  const n = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(n);

  const fundamental = 396; // calming, low chime
  // Inharmonic partials typical of a struck metal bowl.
  const partials = [
    { ratio: 1.0, amp: 1.0, decay: 3.6 },
    { ratio: 2.76, amp: 0.55, decay: 2.6 },
    { ratio: 5.4, amp: 0.3, decay: 1.8 },
    { ratio: 8.9, amp: 0.16, decay: 1.1 },
  ];
  const beat = 0.8; // Hz – gentle shimmer

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;
    for (const p of partials) {
      const env = Math.exp(-t / p.decay);
      const f = fundamental * p.ratio;
      const shimmer = 1 + 0.004 * Math.sin(2 * Math.PI * beat * t);
      s += p.amp * env * Math.sin(2 * Math.PI * f * shimmer * t);
    }
    // Soft strike attack.
    const attack = Math.min(1, t / 0.006);
    out[i] = s * attack * 0.5;
  }
  return out;
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
writeWav(path.join(OUT_DIR, 'bell.wav'), generateBell());
writeWav(path.join(AMBIENT_DIR, 'rain.wav'), generateAmbient('rain'));
writeWav(path.join(AMBIENT_DIR, 'ocean.wav'), generateAmbient('ocean'));
writeWav(path.join(AMBIENT_DIR, 'forest.wav'), generateAmbient('forest'));

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
writeWavStereo(path.join(MUSIC_DIR, 'calm.wav'), calm.left, calm.right);

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
writeWavStereo(path.join(MUSIC_DIR, 'focus.wav'), focus.left, focus.right);

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
writeWavStereo(path.join(MUSIC_DIR, 'deep.wav'), deep.left, deep.right);

console.log('Done.');
