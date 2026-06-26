/**
 * Reference-track analyzer — "learn" the musical character of a Gemini-generated
 * (or any) track and print findings to fold into the generative engine.
 *
 * It decodes the file to PCM and estimates:
 *   - tempo (BPM)               -> RANGES[...].tempoMin/Max  (src/lib/preferences.ts)
 *   - key + mode (major/minor)  -> SCALE_POOL                (src/lib/preferences.ts)
 *   - spectral centroid (Hz)    -> RANGES[...].brightMin/Max
 *   - RMS loudness              -> TARGET_RMS                (src/lib/generative.ts)
 *   - stereo width              -> (informational)
 *
 * Usage:
 *   npm i -D mpg123-decoder        # one-off; kept out of app deps on purpose
 *   node scripts/analyze-track.mjs assets/audio/tracks/sunward-ascent.mp3
 *
 * The key/mode uses the Krumhansl–Schmuckler profiles; tempo uses autocorrelation
 * of a low-band onset envelope. These are estimates — sanity-check by ear — but
 * they're enough to bias the generative defaults toward "real music" character.
 */

import { readFileSync } from 'node:fs';
import { MPEGDecoder } from 'mpg123-decoder';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/analyze-track.mjs <audio-file.mp3>');
  process.exit(1);
}

const dec = new MPEGDecoder();
await dec.ready;
const { channelData, sampleRate, samplesDecoded } = dec.decode(new Uint8Array(readFileSync(file)));
dec.free();

const sr = sampleRate;
const N = samplesDecoded;
const L = channelData[0];
const R = channelData[1] ?? channelData[0];
const mono = new Float32Array(N);
for (let i = 0; i < N; i++) mono[i] = 0.5 * (L[i] + R[i]);

// Stereo width + loudness.
let mid = 0, side = 0, sq = 0, peak = 0;
for (let i = 0; i < N; i++) {
  const m = 0.5 * (L[i] + R[i]);
  const s = 0.5 * (L[i] - R[i]);
  mid += m * m; side += s * s; sq += mono[i] * mono[i];
  const a = Math.abs(mono[i]); if (a > peak) peak = a;
}
const width = Math.sqrt(side / Math.max(1e-9, mid));
const rms = Math.sqrt(sq / N);

// Radix-2 FFT (in place).
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

const FFT = 4096, HOP = 1024;
const win = new Float32Array(FFT);
for (let i = 0; i < FFT; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT - 1));
const frames = Math.floor((N - FFT) / HOP);
const binHz = sr / FFT;
const A4 = 440;
const chroma = new Float64Array(12);
let centroidSum = 0, centroidWeight = 0;
const lowEnv = new Float32Array(frames);

for (let f = 0; f < frames; f++) {
  const off = f * HOP;
  const re = new Float64Array(FFT);
  const im = new Float64Array(FFT);
  for (let i = 0; i < FFT; i++) re[i] = mono[off + i] * win[i];
  fft(re, im);
  let low = 0;
  for (let k = 1; k < FFT / 2; k++) {
    const mag = Math.hypot(re[k], im[k]);
    const hz = k * binHz;
    centroidSum += hz * mag; centroidWeight += mag;
    if (hz >= 30 && hz <= 160) low += mag;
    if (hz >= 80 && hz <= 2000 && mag > 0) {
      const midi = 69 + 12 * Math.log2(hz / A4);
      chroma[((Math.round(midi) % 12) + 12) % 12] += mag;
    }
  }
  lowEnv[f] = low;
}
const centroid = centroidSum / Math.max(1e-9, centroidWeight);

// Tempo via autocorrelation of the low-band onset envelope.
const fps = sr / HOP;
const env = new Float32Array(frames);
for (let i = 1; i < frames; i++) env[i] = Math.max(0, lowEnv[i] - lowEnv[i - 1]);
function bpmAutocorr(sig, minBpm, maxBpm) {
  const minLag = Math.floor((60 / maxBpm) * fps);
  const maxLag = Math.floor((60 / minBpm) * fps);
  let best = 0, bestLag = minLag;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < sig.length; i++) s += sig[i] * sig[i - lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  return 60 / (bestLag / fps);
}
const bpm = bpmAutocorr(env, 60, 180);

// Key via Krumhansl–Schmuckler.
const major = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const minor = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function corr(a, b) {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return num / Math.sqrt(da * db);
}
let bestKey = { score: -2, root: 0, mode: 'major' };
for (let rt = 0; rt < 12; rt++) {
  const rMaj = major.map((_, i) => major[(i - rt + 12) % 12]);
  const rMin = minor.map((_, i) => minor[(i - rt + 12) % 12]);
  const cMaj = corr([...chroma], rMaj);
  const cMin = corr([...chroma], rMin);
  if (cMaj > bestKey.score) bestKey = { score: cMaj, root: rt, mode: 'major' };
  if (cMin > bestKey.score) bestKey = { score: cMin, root: rt, mode: 'minor' };
}

let folded = bpm;
while (folded > 110) folded /= 2;
while (folded < 60) folded *= 2;
const chMax = Math.max(...chroma);

console.log(`\n=== ${file} ===`);
console.log(`duration       ${(N / sr).toFixed(1)} s @ ${sr} Hz`);
console.log(`key            ${NOTE[bestKey.root]} ${bestKey.mode}  (corr ${bestKey.score.toFixed(3)})`);
console.log(`tempo          ${bpm.toFixed(1)} BPM (folded ${folded.toFixed(1)})`);
console.log(`brightness     centroid ${centroid.toFixed(0)} Hz`);
console.log(`loudness       RMS ${rms.toFixed(3)}  peak ${peak.toFixed(3)}`);
console.log(`stereo width   ${width.toFixed(3)} (side/mid)`);
console.log(`chroma C..B    ${[...chroma].map((c) => (c / chMax).toFixed(2)).join(' ')}`);
