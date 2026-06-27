/**
 * Reference-track analyzer — "learn" the musical character of reference tracks
 * and print findings + suggested generative parameters.
 *
 * Decodes each file to PCM and estimates, per track:
 *   - key + mode/scale     -> SCALE_POOL              (src/lib/preferences.ts)
 *   - tempo (BPM)          -> RANGES[...].tempoMin/Max
 *   - brightness:          centroid + 85% rolloff     -> brightMin/Max
 *   - texture: spectral flatness (tonal..noisy)       -> wave/instrument bias
 *   - low-end weight: sub+bass energy ratio           -> bassChance / sub level
 *   - rhythmic density: onsets/sec                     -> arp/percussion bias
 *   - harmonic rhythm: chord changes/min              -> chordChangeSec
 *   - dynamics: crest factor (dB)                      -> pulseDepth
 *   - loudness (RMS) + stereo width                    -> TARGET_RMS / width
 *
 * With several files it also prints an AGGREGATE + suggested generative params.
 *
 * Usage:
 *   npm i -D mpg123-decoder         # one-off; kept out of app deps on purpose
 *   node scripts/analyze-track.mjs assets/audio/tracks/*.mp3
 */

import { readFileSync } from 'node:fs';
import { MPEGDecoder } from 'mpg123-decoder';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/analyze-track.mjs <audio-file.mp3> [more.mp3 ...]');
  process.exit(1);
}

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Scale templates (pitch-class offsets) — must match the generative SCALES set.
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  lydian_dominant: [0, 2, 4, 6, 7, 9, 10],
  major_pentatonic: [0, 2, 4, 7, 9],
  minor_pentatonic: [0, 3, 5, 7, 10],
  hirajoshi: [0, 2, 3, 7, 8],
};
const MINOR_MODES = new Set(['aeolian', 'dorian', 'phrygian', 'harmonic_minor', 'minor_pentatonic', 'hirajoshi']);

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

function analyze(file) {
  const dec = new MPEGDecoder();
  return dec.ready.then(() => {
    const { channelData, sampleRate, samplesDecoded } = dec.decode(new Uint8Array(readFileSync(file)));
    dec.free();
    const sr = sampleRate;
    const N = samplesDecoded;
    const Lc = channelData[0];
    const Rc = channelData[1] ?? channelData[0];
    const mono = new Float32Array(N);
    let mid = 0, side = 0, sq = 0, peak = 0;
    for (let i = 0; i < N; i++) {
      const m = 0.5 * (Lc[i] + Rc[i]);
      const s = 0.5 * (Lc[i] - Rc[i]);
      mono[i] = m;
      mid += m * m; side += s * s; sq += m * m;
      const a = Math.abs(m); if (a > peak) peak = a;
    }
    const width = Math.sqrt(side / Math.max(1e-9, mid));
    const rms = Math.sqrt(sq / N);

    const FFT = 4096, HOP = 1024;
    const win = new Float32Array(FFT);
    for (let i = 0; i < FFT; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT - 1));
    const frames = Math.floor((N - FFT) / HOP);
    const binHz = sr / FFT;
    const halfBins = FFT / 2;
    const A4 = 440;

    const spec = new Float64Array(halfBins); // global summed magnitude spectrum
    const chroma = new Float64Array(12);
    const flux = new Float32Array(frames);
    const lowEnv = new Float32Array(frames);
    const chromaFrames = []; // per-frame chroma (downsampled) for harmonic rhythm
    let prevMag = new Float32Array(halfBins);

    for (let f = 0; f < frames; f++) {
      const off = f * HOP;
      const re = new Float64Array(FFT);
      const im = new Float64Array(FFT);
      for (let i = 0; i < FFT; i++) re[i] = mono[off + i] * win[i];
      fft(re, im);
      let fluxSum = 0, low = 0;
      const fc = new Float64Array(12);
      for (let k = 1; k < halfBins; k++) {
        const mag = Math.hypot(re[k], im[k]);
        const hz = k * binHz;
        spec[k] += mag;
        const d = mag - prevMag[k];
        if (d > 0) fluxSum += d;
        prevMag[k] = mag;
        if (hz >= 30 && hz <= 160) low += mag;
        if (hz >= 80 && hz <= 2000 && mag > 0) {
          const midi = 69 + 12 * Math.log2(hz / A4);
          const pc = ((Math.round(midi) % 12) + 12) % 12;
          chroma[pc] += mag;
          fc[pc] += mag;
        }
      }
      flux[f] = fluxSum;
      lowEnv[f] = low;
      chromaFrames.push(fc);
    }

    // --- brightness: centroid + 85% rolloff; texture: spectral flatness ---
    let cWeight = 0, cSum = 0, specTotal = 0;
    for (let k = 1; k < halfBins; k++) { cSum += k * binHz * spec[k]; cWeight += spec[k]; specTotal += spec[k]; }
    const centroid = cSum / Math.max(1e-9, cWeight);
    let cum = 0, rolloff = 0;
    for (let k = 1; k < halfBins; k++) { cum += spec[k]; if (cum >= 0.85 * specTotal) { rolloff = k * binHz; break; } }
    // flatness over a musical band (50 Hz .. 8 kHz)
    let gm = 0, am = 0, nb = 0;
    const lo = Math.floor(50 / binHz), hi = Math.floor(8000 / binHz);
    for (let k = lo; k <= hi; k++) { const v = spec[k] + 1e-9; gm += Math.log(v); am += v; nb++; }
    const flatness = Math.exp(gm / nb) / (am / nb); // ~0 tonal .. ~1 noisy

    // --- band energy ratios (power) ---
    const bands = { sub: 0, bass: 0, lowMid: 0, mid: 0, high: 0, air: 0 };
    let bandTotal = 0;
    for (let k = 1; k < halfBins; k++) {
      const hz = k * binHz; const p = spec[k] * spec[k]; bandTotal += p;
      if (hz < 60) bands.sub += p; else if (hz < 250) bands.bass += p; else if (hz < 500) bands.lowMid += p;
      else if (hz < 2000) bands.mid += p; else if (hz < 6000) bands.high += p; else bands.air += p;
    }
    const lowWeight = (bands.sub + bands.bass) / Math.max(1e-9, bandTotal);

    // --- tempo: autocorrelation of low-band onset envelope ---
    const fps = sr / HOP;
    const env = new Float32Array(frames);
    for (let i = 1; i < frames; i++) env[i] = Math.max(0, lowEnv[i] - lowEnv[i - 1]);
    let bpm = 0; { let best = 0, bestLag = 0;
      const minLag = Math.floor((60 / 180) * fps), maxLag = Math.floor((60 / 60) * fps);
      for (let lag = minLag; lag <= maxLag; lag++) { let s = 0; for (let i = lag; i < env.length; i++) s += env[i] * env[i - lag]; if (s > best) { best = s; bestLag = lag; } }
      bpm = bestLag ? 60 / (bestLag / fps) : 0;
    }

    // --- rhythmic density: onsets/sec (flux peaks above adaptive threshold) ---
    let onsets = 0;
    const W = 16;
    for (let i = 1; i < frames - 1; i++) {
      let mean = 0, c = 0;
      for (let j = Math.max(0, i - W); j <= Math.min(frames - 1, i + W); j++) { mean += flux[j]; c++; }
      mean /= c;
      if (flux[i] > flux[i - 1] && flux[i] >= flux[i + 1] && flux[i] > mean * 1.6 && flux[i] > 0) onsets++;
    }
    const onsetRate = onsets / (N / sr);

    // --- harmonic rhythm: changes of dominant pitch-class over ~1.2 s windows ---
    const winSec = 1.2; const winFrames = Math.max(1, Math.round(winSec * fps));
    let lastPc = -1, changes = 0, wins = 0;
    for (let i = 0; i < frames; i += winFrames) {
      const acc = new Float64Array(12);
      for (let j = i; j < Math.min(frames, i + winFrames); j++) for (let p = 0; p < 12; p++) acc[p] += chromaFrames[j][p];
      let dom = 0; for (let p = 1; p < 12; p++) if (acc[p] > acc[dom]) dom = p;
      if (lastPc >= 0 && dom !== lastPc) changes++;
      lastPc = dom; wins++;
    }
    const durMin = N / sr / 60;
    const chordChangesPerMin = changes / Math.max(1e-6, durMin);
    const chordChangeSec = chordChangesPerMin > 0 ? 60 / chordChangesPerMin : 16;

    // --- dynamics: crest factor (peak vs short-term RMS), in dB ---
    const winN = Math.floor(sr * 0.1); let maxR = 0, sumR = 0, cR = 0;
    for (let i = 0; i + winN < N; i += winN) { let s = 0; for (let j = i; j < i + winN; j++) s += mono[j] * mono[j]; const r = Math.sqrt(s / winN); if (r > maxR) maxR = r; sumR += r; cR++; }
    const avgR = sumR / Math.max(1, cR);
    const crestDb = 20 * Math.log10(maxR / Math.max(1e-9, avgR));

    // --- key + scale (best (root, scale) by mean in-scale vs out-of-scale) ---
    let total = 0; for (let p = 0; p < 12; p++) total += chroma[p];
    const ch = [...chroma].map((c) => c / Math.max(1e-9, total));
    let best = { fit: -9, root: 0, scale: 'aeolian' };
    const ranked = [];
    for (let r = 0; r < 12; r++) {
      for (const [name, set] of Object.entries(SCALES)) {
        const inSet = new Set(set.map((s) => (r + s) % 12));
        let inSum = 0, outSum = 0;
        for (let p = 0; p < 12; p++) (inSet.has(p) ? (inSum += ch[p]) : (outSum += ch[p]));
        const fit = inSum / inSet.size - outSum / (12 - inSet.size);
        ranked.push({ fit, root: r, scale: name });
        if (fit > best.fit) best = { fit, root: r, scale: name };
      }
    }
    ranked.sort((a, b) => b.fit - a.fit);

    let folded = bpm; while (folded > 112) folded /= 2; while (folded && folded < 56) folded *= 2;

    return {
      file, dur: N / sr, sr, rms, peak, width, centroid, rolloff, flatness, lowWeight,
      bpm, folded, onsetRate, chordChangeSec, crestDb, bestKey: best,
      top3: ranked.slice(0, 3), bands, bandTotal,
    };
  });
}

function fmt(n, d = 2) { return Number(n).toFixed(d); }

const results = [];
for (const f of files) results.push(await analyze(f));

for (const r of results) {
  console.log(`\n=== ${r.file.split('/').pop()} ===`);
  console.log(`  key/scale     ${NOTE[r.bestKey.root]} ${r.bestKey.scale}  (${r.top3.map((t) => `${NOTE[t.root]} ${t.scale}`).join('  |  ')})`);
  console.log(`  tempo         ${fmt(r.bpm, 1)} BPM (folded ${fmt(r.folded, 1)})`);
  console.log(`  brightness    centroid ${fmt(r.centroid, 0)} Hz, rolloff85 ${fmt(r.rolloff, 0)} Hz`);
  console.log(`  texture       flatness ${fmt(r.flatness, 3)} (0 tonal .. 1 noisy)`);
  console.log(`  low-end       ${fmt(r.lowWeight * 100, 0)}% of energy < 250 Hz`);
  console.log(`  rhythm        ${fmt(r.onsetRate, 2)} onsets/sec`);
  console.log(`  harmony       chord change ~every ${fmt(r.chordChangeSec, 1)} s`);
  console.log(`  dynamics      crest ${fmt(r.crestDb, 1)} dB`);
  console.log(`  loudness      RMS ${fmt(r.rms, 3)}, peak ${fmt(r.peak, 3)}, width ${fmt(r.width, 2)}`);
}

if (results.length > 1) {
  const mean = (sel) => results.reduce((s, r) => s + sel(r), 0) / results.length;
  const median = (sel) => { const a = results.map(sel).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  // mode tally (root-independent scale name)
  const tally = {};
  for (const r of results) tally[r.bestKey.scale] = (tally[r.bestKey.scale] ?? 0) + 1;
  const minorShare = results.filter((r) => MINOR_MODES.has(r.bestKey.scale)).length / results.length;
  console.log(`\n===== AGGREGATE (${results.length} tracks) =====`);
  console.log(`  modes         ${Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(', ')}  (minor share ${fmt(minorShare * 100, 0)}%)`);
  console.log(`  tempo folded  mean ${fmt(mean((r) => r.folded), 0)} / median ${fmt(median((r) => r.folded), 0)} BPM`);
  console.log(`  centroid      mean ${fmt(mean((r) => r.centroid), 0)} Hz, rolloff ${fmt(mean((r) => r.rolloff), 0)} Hz`);
  console.log(`  flatness      mean ${fmt(mean((r) => r.flatness), 3)}`);
  console.log(`  low-end       mean ${fmt(mean((r) => r.lowWeight) * 100, 0)}%`);
  console.log(`  onsets/sec    mean ${fmt(mean((r) => r.onsetRate), 2)}`);
  console.log(`  chordChangeS  mean ${fmt(mean((r) => r.chordChangeSec), 1)} s`);
  console.log(`  crest dB      mean ${fmt(mean((r) => r.crestDb), 1)}`);
  console.log(`  RMS           mean ${fmt(mean((r) => r.rms), 3)}`);

  // --- map to generative brightness 0..1 (centroid ~1.5k->0.2, ~6k->0.9) ---
  const brightness = Math.max(0, Math.min(1, (mean((r) => r.centroid) - 1200) / 5200));
  console.log(`\n  suggested generative brightness ~ ${fmt(brightness, 2)} (0..1)`);
  console.log(`  suggested bassChance high (low-end ${fmt(mean((r) => r.lowWeight) * 100, 0)}%); smooth pads (flatness ${fmt(mean((r) => r.flatness), 3)}, ${fmt(mean((r) => r.onsetRate), 2)} onsets/s)`);
}
