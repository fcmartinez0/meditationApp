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
const N = Math.max(1, parseInt(process.argv[2] || '1', 10));

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

// The Node Web Audio backend occasionally emits a mono, near-DC, over-loud
// render (centroid ~30 Hz, width ~0, RMS ~0.5) that doesn't reflect the engine
// on-device. Skip those and re-render so each section gets N valid renders for a
// stable average.
const valid = (r) => r.width >= 0.03 && r.centroid >= 90 && r.rms < 0.42;

// 2) Render each section until N valid pieces are collected; score raw PCM.
const renderFeats = [];
let dropped = 0;
for (const section of ['rest', 'chill']) {
  const label = section === 'chill' ? 'flow' : 'rest';
  let got = 0;
  for (let attempt = 0; got < N && attempt < N * 6; attempt++) {
    const spec = nextSpec(section, []);
    const loop = await __renderSpecForHarness(spec);
    if (!loop) { dropped++; continue; }
    const feat = computeFeatures(loop.data[0], loop.data[1], loop.sampleRate, loop.length, `gen-${label}`);
    if (!valid(feat)) { dropped++; continue; }
    renderFeats.push({ label: `gen-${label}`, ...feat });
    got++;
    process.stderr.write(`${label} ${got}/${N}: ${spec.scale} ${spec.instrument} ${spec.tempo}bpm  centroid ${feat.centroid.toFixed(0)} low ${(feat.lowWeight * 100).toFixed(0)}% flat ${feat.flatness.toFixed(2)}\n`);
  }
}

// 3) Score the reference tracks (the target) and print a side-by-side.
const tracks = readdirSync(join(ROOT, 'assets/audio/tracks'))
  .filter((f) => f.endsWith('.mp3'))
  .map((f) => join(ROOT, 'assets/audio/tracks', f));

const mean = (arr, sel) => arr.reduce((s, x) => s + sel(x), 0) / arr.length;
const trackFeats = [];
for (const t of tracks) trackFeats.push(await analyzeFile(t));

function summarize(feats) {
  const tally = {};
  for (const r of feats) tally[r.bestKey.scale] = (tally[r.bestKey.scale] ?? 0) + 1;
  const mode = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  return {
    centroid: mean(feats, (x) => x.centroid),
    rolloff: mean(feats, (x) => x.rolloff),
    flatness: mean(feats, (x) => x.flatness),
    lowWeight: mean(feats, (x) => x.lowWeight),
    crestDb: mean(feats, (x) => x.crestDb),
    width: mean(feats, (x) => x.width),
    rms: mean(feats, (x) => x.rms),
    mode,
  };
}

const rows = [['TARGET (tracks)', summarize(trackFeats)]];
for (const sec of [['rest', 'gen REST'], ['flow', 'gen FLOW']]) {
  const fs = renderFeats.filter((r) => r.label.startsWith(`gen-${sec[0]}`));
  if (fs.length) rows.push([`${sec[1]} (n=${fs.length})`, summarize(fs)]);
}

const pad = (s, n) => String(s).padStart(n);
const header = ['', 'centroid', 'rolloff', 'flat', 'low%', 'crest', 'width', 'RMS', 'mode'];
const widths = [16, 9, 8, 6, 6, 7, 7, 7, 18];
const line = (cells) => cells.map((c, i) => (i === 0 ? String(c).padEnd(widths[i]) : pad(c, widths[i]))).join('');
console.log('\n================ GENERATIVE vs REFERENCE TRACKS ================');
console.log(`(${trackFeats.length} tracks, ${N} render(s) per section)\n`);
console.log(line(header));
for (const [label, s] of rows) {
  console.log(line([
    label,
    s.centroid.toFixed(0),
    s.rolloff.toFixed(0),
    s.flatness.toFixed(2),
    (s.lowWeight * 100).toFixed(0),
    s.crestDb.toFixed(1),
    s.width.toFixed(2),
    s.rms.toFixed(3),
    s.mode,
  ]));
}
console.log('\nGoal: gen rows should land in the TARGET row\'s neighbourhood.');
console.log('higher centroid/rolloff = brighter; higher flat = noisier; higher low% = more bass.');
if (dropped) console.log(`(dropped ${dropped} degenerate render(s) from the Node backend)`);

rmSync(tmp, { recursive: true, force: true });
