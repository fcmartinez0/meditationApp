/**
 * Generative render-and-score harness.
 *
 * Renders the REAL generative engine offline (headless, via node-web-audio-api),
 * encodes the result to MP3, and runs it through the same analyzer used on the
 * reference tracks — so you can see, in numbers, how close generative Rest/Flow
 * is to the produced tracks and what to tune. No app code is re-implemented: the
 * engine is bundled as-is with its native-audio import aliased to a Node Web
 * Audio backend.
 *
 *   node scripts/gen-harness.mjs            # render rest+flow, compare to tracks
 *   node scripts/gen-harness.mjs 3          # 3 renders per section (more stable)
 *   node scripts/gen-harness.mjs fixed      # deterministic spec matrix, no sampling noise
 *
 * Requires devDependencies: esbuild, node-web-audio-api, @breezystack/lamejs,
 * mpg123-decoder.
 */

import { build } from 'esbuild';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyzeFile, computeFeatures } from './analyze-track.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const HARNESS = join(HERE, '_harness');
const FIXED = process.argv[2] === 'fixed';
const N = Math.max(1, parseInt(process.argv[2] || '1', 10) || 1);

// Deterministic spec matrix for `fixed` mode. Renders are bit-identical for a
// given spec, so rendering a fixed set instead of sampling nextSpec() removes
// the sampling noise that otherwise swamps a before/after comparison: with 8
// random specs per section, which instruments happened to come up moves the
// centroid mean by more than most changes do.
//
// The seeds are ones the Node backend renders cleanly. That is not cherry-
// picking a flattering result: the backend's failures are deterministic in the
// seed, not in the music — the same spec at seed 4 renders a normal piece and at
// seed 5 renders a near-DC blob, and at seed 2 renders one missing everything
// routed through the pulse bus (no low end, centroid ~6600, RMS still on
// target). Those modes are backend bugs, and pinning the seed is what lets this
// mode measure the ENGINE rather than the backend. The random mode above still
// samples seeds freely, so a real regression cannot hide here.
//
// CAVEAT: the backend fails on the sustained-voice path for every seed tried so
// far, so the 'pad' and 'choir' rows of the matrix are always dropped and this
// mode currently measures the plucked archetypes (keys/bells/pluck) only. They
// are listed anyway — the day the backend renders them, they appear.
const FIXED_SEEDS = [12345, 4, 8, 12];
const FIXED_INSTRUMENTS = ['pad', 'choir', 'keys', 'bells', 'pluck'];
function fixedSpecs(section) {
  const rest = section === 'rest';
  const out = [];
  for (const seed of FIXED_SEEDS) {
    for (const instrument of FIXED_INSTRUMENTS) {
      for (const bass of [true, false]) {
        out.push({
          seed, section, instrument, bass,
          scale: 'minor_pentatonic',
          root: rest ? 50 : 53,
          brightness: rest ? 0.35 : 0.55,
          chordChangeSec: rest ? 12 : 7,
          binauralHz: rest ? 6 : 10,
          chimeDensity: 0.1,
          tempo: rest ? 60 : 95,
          pulseDepth: rest ? 0 : 0.1,
          wave: 'triangle',
          arp: !rest,
          percussion: rest ? 'none' : 'shaker',
          progression: 2,
          melody: true,
        });
      }
    }
  }
  return out;
}

// 1) Bundle the real engine for Node, aliasing the native-audio module. The temp
// dir lives inside the project so the bundle's `node-web-audio-api` import (kept
// external — it's a native module) resolves against the project's node_modules.
const tmp = mkdtempSync(join(ROOT, '.gen-harness-'));
const bundle = join(tmp, 'engine.mjs');
await build({
  entryPoints: [join(HARNESS, 'entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile: bundle,
  alias: {
    'react-native-audio-api': join(HARNESS, 'rn-audio-shim.ts'),
    '@react-native-async-storage/async-storage': join(HARNESS, 'async-storage-stub.ts'),
  },
  define: { __DEV__: 'false' },
  external: ['node-web-audio-api'],
  logLevel: 'error',
});
const { __renderSpecForHarness, nextSpec } = await import(pathToFileURL(bundle).href);

// The Node Web Audio backend occasionally emits a broken render that doesn't
// reflect the engine on-device: near-DC (centroid ~30-120 Hz where any real
// piece with a pad measures >1500), collapsed to mono (width ~0) or blown out
// into anti-phase (width >1, i.e. more side than mid energy — impossible for a
// mix with a centred sub). Skip those and re-render so each section gets N valid
// renders for a stable average.
//
// These bounds are deliberately far outside anything the engine can legitimately
// produce, so a real regression still shows up in the table rather than being
// filtered away: a piece that got muffled, narrow or wide would have to move by
// a factor of ~3 past the worst legitimate render before it were dropped.
const valid = (r) =>
  r.width >= 0.03 && r.width <= 1 && r.centroid >= 500 && r.rms < 0.42;

// 2) Render each section until N valid pieces are collected; score raw PCM.
const renderFeats = [];
let dropped = 0;
for (const section of ['rest', 'chill']) {
  const label = section === 'chill' ? 'flow' : 'rest';
  if (FIXED) {
    for (const spec of fixedSpecs(section)) {
      const loop = await __renderSpecForHarness(spec);
      if (!loop) { dropped++; continue; }
      const feat = computeFeatures(loop.data[0], loop.data[1], loop.sampleRate, loop.length, `gen-${label}`);
      if (!valid(feat)) { dropped++; continue; }
      renderFeats.push({ label: `gen-${label}`, ...feat });
      process.stderr.write(`${label} ${spec.instrument.padEnd(6)} seed ${String(spec.seed).padStart(5)} bass=${spec.bass ? 'y' : 'n'}  centroid ${feat.centroid.toFixed(0)} low ${(feat.lowWeight * 100).toFixed(0)}% flat ${feat.flatness.toFixed(2)} width ${feat.width.toFixed(2)} rms ${feat.rms.toFixed(3)}\n`);
    }
    continue;
  }
  let got = 0;
  // Generous attempt budget: the Node backend drops roughly two renders in three
  // (see `valid` above), and a short budget silently returns fewer than N.
  for (let attempt = 0; got < N && attempt < N * 12; attempt++) {
    const spec = nextSpec(section, []);
    const loop = await __renderSpecForHarness(spec);
    if (!loop) { dropped++; continue; }
    const feat = computeFeatures(loop.data[0], loop.data[1], loop.sampleRate, loop.length, `gen-${label}`);
    if (!valid(feat)) { dropped++; continue; }
    renderFeats.push({ label: `gen-${label}`, ...feat });
    got++;
    process.stderr.write(`${label} ${got}/${N}: ${spec.scale} ${spec.instrument} ${spec.tempo}bpm bass=${spec.bass ? 'y' : 'n'}  centroid ${feat.centroid.toFixed(0)} low ${(feat.lowWeight * 100).toFixed(0)}% flat ${feat.flatness.toFixed(2)} width ${feat.width.toFixed(2)} rms ${feat.rms.toFixed(3)}\n`);
  }
}

// 3) Score the reference tracks (the target) and print a side-by-side.
const tracks = readdirSync(join(ROOT, 'assets/audio/tracks'))
  .filter((f) => f.endsWith('.mp3'))
  .map((f) => join(ROOT, 'assets/audio/tracks', f));

const trackFeats = [];
for (const t of tracks) trackFeats.push(await analyzeFile(t));

// Per-metric mean AND spread. Consistency between pieces is the thing being
// tuned, so a mean alone hides the defect: two pieces at 0.24 and 0.12 RMS
// average to a perfectly on-target 0.18. sd is the population sd (n, not n-1),
// which is what we want here — these are all the renders, not a sample of them.
const METRICS = [
  ['centroid', (x) => x.centroid, 0],
  ['rolloff', (x) => x.rolloff, 0],
  ['flatness', (x) => x.flatness, 2],
  ['lowWeight', (x) => x.lowWeight * 100, 0],
  ['crestDb', (x) => x.crestDb, 1],
  ['width', (x) => x.width, 2],
  ['rms', (x) => x.rms, 3],
];

function stats(feats, sel) {
  const vals = feats.map(sel);
  const m = vals.reduce((s, v) => s + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length);
  return { mean: m, sd, min: Math.min(...vals), max: Math.max(...vals) };
}

function summarize(feats) {
  const tally = {};
  for (const r of feats) tally[r.bestKey.scale] = (tally[r.bestKey.scale] ?? 0) + 1;
  const mode = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  const out = { mode, n: feats.length };
  for (const [name, sel] of METRICS) out[name] = stats(feats, sel);
  return out;
}

const rows = [['TARGET (tracks)', summarize(trackFeats)]];
for (const sec of [['rest', 'gen REST'], ['flow', 'gen FLOW']]) {
  const fs = renderFeats.filter((r) => r.label.startsWith(`gen-${sec[0]}`));
  if (fs.length) rows.push([`${sec[1]} (n=${fs.length})`, summarize(fs)]);
}

const pad = (s, n) => String(s).padStart(n);
const header = ['', 'centroid', 'rolloff', 'flat', 'low%', 'crest', 'width', 'RMS', 'mode'];
// Wide enough that the min–max cells ("9995–10332") stay column-aligned with
// the mean and ±sd rows above them.
const widths = [16, 12, 13, 11, 9, 10, 12, 14, 18];
const line = (cells) => cells.map((c, i) => (i === 0 ? String(c).padEnd(widths[i]) : pad(c, widths[i]))).join('');
console.log('\n================ GENERATIVE vs REFERENCE TRACKS ================');
console.log(
  FIXED
    ? `(${trackFeats.length} tracks, fixed spec matrix: ${FIXED_SEEDS.length} seeds x ${FIXED_INSTRUMENTS.length} instruments x bass on/off)\n`
    : `(${trackFeats.length} tracks, ${N} render(s) per section)\n`,
);
console.log(line(header));
for (const [label, s] of rows) {
  // Mean row, then the spread beneath it: ±sd and the observed min–max. A tight
  // spread is the goal — the ±sd row is what says whether pieces are consistent.
  console.log(line([label, ...METRICS.map(([n, , d]) => s[n].mean.toFixed(d)), s.mode]));
  if (s.n > 1) {
    console.log(line(['   ±sd', ...METRICS.map(([n, , d]) => s[n].sd.toFixed(d)), '']));
    console.log(line([
      '   min–max',
      ...METRICS.map(([n, , d]) => `${s[n].min.toFixed(d)}–${s[n].max.toFixed(d)}`),
      '',
    ]));
  }
}
console.log('\nGoal: gen rows should land in the TARGET row\'s neighbourhood.');
console.log('higher centroid/rolloff = brighter; higher flat = noisier; higher low% = more bass.');
console.log('±sd / min–max show consistency BETWEEN pieces — tighter is better (esp. RMS).');
if (dropped) console.log(`(dropped ${dropped} degenerate render(s) from the Node backend)`);

rmSync(tmp, { recursive: true, force: true });
