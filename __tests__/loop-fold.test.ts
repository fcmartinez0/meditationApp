import {
  foldLoop,
  GAIN_MAX,
  GAIN_MIN,
  LIMIT_KNEE,
  PEAK_CEILING,
  softLimit,
  TARGET_RMS,
  type RenderedBuffer,
} from '@/lib/loop-fold';

// Small sizes keep the tests fast; the algorithm is size-independent.
const LOOP = 1000;
const XF = 100;
const RENDER = LOOP + XF;

/** Minimal stand-in for the rendered AudioBuffer (loop-fold only reads these). */
function buffer(...channels: Float32Array[]): RenderedBuffer {
  return {
    numberOfChannels: channels.length,
    getChannelData: (c: number) => channels[c],
  };
}

function constant(value: number, length = RENDER): Float32Array {
  return new Float32Array(length).fill(value);
}

function rms(data: Float32Array): number {
  let sum = 0;
  for (const x of data) sum += x * x;
  return Math.sqrt(sum / data.length);
}

function peakOf(data: Float32Array): number {
  let p = 0;
  for (const x of data) p = Math.max(p, Math.abs(x));
  return p;
}

/** Deterministic noise, so a "piece" is reproducible across runs. */
function noise(amp: number, seed = 1, length = RENDER): Float32Array {
  let s = seed >>> 0 || 1;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = (s / 0xffffffff) * 2 * amp - amp;
  }
  return out;
}

/** A quiet bed with sparse loud transients — the shape of a percussive piece. */
function peaky(bed: number, spike: number, every = 50, seed = 7): Float32Array {
  const data = noise(bed, seed);
  for (let i = 0; i < RENDER; i += every) data[i] = spike;
  return data;
}

describe('foldLoop', () => {
  it('trims the render to the loop length, one output per channel', async () => {
    const out = await foldLoop(buffer(constant(0.1), constant(0.1)), LOOP, XF);
    expect(out).toHaveLength(2);
    for (const ch of out) expect(ch).toHaveLength(LOOP);
  });

  it('normalizes a constant signal to TARGET_RMS when the needed gain is in the clamp band', async () => {
    // 0.1 needs roughly a 1.8x boost — inside the clamp band, and its peak stays
    // far below the limiter's knee, so the output RMS must land on the target.
    const out = await foldLoop(buffer(constant(0.1)), LOOP, XF);
    expect(rms(out[0])).toBeCloseTo(TARGET_RMS, 3);
  });

  it('pulls a hot-but-plausible render all the way down to the target', async () => {
    // 0.5 needs a 0.36x cut. The old GAIN_MIN of 0.4 clamped exactly this case
    // and left the piece ~1 dB hot; the band is now wide enough to hit target.
    const out = await foldLoop(buffer(constant(0.5)), LOOP, XF);
    expect(rms(out[0])).toBeCloseTo(TARGET_RMS, 3);
  });

  it('clamps the boost for a near-silent (but not silent) render', async () => {
    // 0.005 would need a 36x boost to reach the target; the clamp caps it at
    // GAIN_MAX so a whisper-quiet render is never blasted to full loudness.
    const out = await foldLoop(buffer(constant(0.005)), LOOP, XF);
    // Sample outside the crossfade window, where the input was exactly 0.005.
    expect(out[0][LOOP - 1] / 0.005).toBeCloseTo(GAIN_MAX, 5);
    expect(rms(out[0])).toBeLessThan(TARGET_RMS);
  });

  it('clamps the cut for an absurdly hot render (gain floor)', async () => {
    // 2.0 would need a 0.09x cut; the floor holds it at GAIN_MIN so a broken
    // render is tamed but never scaled into nothing.
    const out = await foldLoop(buffer(constant(2)), LOOP, XF);
    expect(out[0][LOOP - 1] / 2).toBeCloseTo(GAIN_MIN, 5);
    expect(rms(out[0])).toBeGreaterThan(TARGET_RMS);
  });

  it('lands peaky material on the target instead of scaling it down around one peak', async () => {
    // THE loudness-consistency fix. A quiet bed with sparse 0.8 transients: the
    // gain that hits target pushes those peaks past 1.0, and the old rule
    // (gain = PEAK_CEILING / peak) therefore dragged the whole piece ~1.5 dB
    // under target. The limiter absorbs the transients instead, so the body of
    // the piece still arrives at the target loudness.
    const out = await foldLoop(buffer(peaky(0.1, 0.8)), LOOP, XF);
    expect(rms(out[0])).toBeGreaterThan(TARGET_RMS * 0.97);
    expect(rms(out[0])).toBeLessThan(TARGET_RMS * 1.03);
    expect(peakOf(out[0])).toBeLessThan(PEAK_CEILING);
  });

  it('holds every kind of piece within ~1 dB of each other (loudness consistency)', async () => {
    // Quiet/dense/peaky/wide "pieces" — the situation a user shuffling pieces
    // hears. Before the fix these spanned roughly 5 dB (0.235 vs 0.125 RMS).
    // All of these sit inside the GAIN_MIN..GAIN_MAX rails, which is where real
    // renders live; the rails themselves are covered by the clamp tests above.
    const pieces: RenderedBuffer[] = [
      buffer(noise(0.16, 11), noise(0.16, 12)), // sparse and quiet
      buffer(noise(0.45, 13), noise(0.45, 14)), // dense and hot
      buffer(peaky(0.06, 0.9, 40, 15), peaky(0.06, 0.9, 40, 16)), // percussive
      buffer(peaky(0.3, 1.4, 25, 17), peaky(0.3, 1.4, 25, 18)), // hot AND peaky
      buffer(constant(0.22), constant(0.22)), // a flat drone
    ];
    const levels: number[] = [];
    for (const p of pieces) {
      const out = await foldLoop(p, LOOP, XF);
      // Level of the piece as a whole, across both channels.
      levels.push(Math.sqrt((rms(out[0]) ** 2 + rms(out[1]) ** 2) / 2));
      expect(peakOf(out[0])).toBeLessThanOrEqual(PEAK_CEILING);
      expect(peakOf(out[1])).toBeLessThanOrEqual(PEAK_CEILING);
    }
    const spreadDb = 20 * Math.log10(Math.max(...levels) / Math.min(...levels));
    expect(spreadDb).toBeLessThan(1);
    for (const l of levels) expect(Math.abs(20 * Math.log10(l / TARGET_RMS))).toBeLessThan(0.6);
  });

  it('never reaches the peak ceiling, however hard the input peaks', async () => {
    // Quiet bed (earns the full GAIN_MAX boost) plus one huge spike: the output
    // must stay under the ceiling — and, because the limiter is asymptotic, it
    // gets close to it rather than clipping flat at it.
    const data = constant(0.05);
    data[500] = 5;
    const out = await foldLoop(buffer(data), LOOP, XF);
    const peak = peakOf(out[0]);
    expect(peak).toBeLessThanOrEqual(PEAK_CEILING);
    expect(peak).toBeGreaterThan(LIMIT_KNEE);
  });

  it('applies one gain to every channel, so the stereo image is unchanged', async () => {
    const out = await foldLoop(buffer(constant(0.2), constant(0.1)), LOOP, XF);
    expect(out[0][LOOP - 1] / out[1][LOOP - 1]).toBeCloseTo(2, 6);
  });

  it('folds a loop-periodic sine with no discontinuity at the wrap seam', async () => {
    // Period 100 divides both the loop (1000) and crossfade (100) lengths, so
    // the tail being blended over the head is phase-aligned with it and the
    // loop's last sample must connect back to its first as smoothly as any
    // in-body step.
    const data = new Float32Array(RENDER);
    for (let i = 0; i < RENDER; i++) data[i] = 0.2 * Math.sin((2 * Math.PI * i) / 100);
    const out = await foldLoop(buffer(data), LOOP, XF);
    const ch = out[0];
    let maxBodyStep = 0;
    for (let i = 1; i < LOOP; i++) maxBodyStep = Math.max(maxBodyStep, Math.abs(ch[i] - ch[i - 1]));
    const seamStep = Math.abs(ch[0] - ch[LOOP - 1]);
    // The wrap step may not stick out beyond the signal's own sample-to-sample
    // motion (a click at the seam would be an outlier here).
    expect(seamStep).toBeLessThanOrEqual(maxBodyStep + 1e-4);
    // And in absolute terms: one sine step at this frequency/amplitude is
    // ~0.015 post-gain — anything much bigger would be an audible click.
    expect(seamStep).toBeLessThan(0.03);
  });

  it('passes silence through untouched (no NaN blow-up from the RMS division)', async () => {
    const out = await foldLoop(buffer(constant(0), constant(0)), LOOP, XF);
    for (const ch of out) {
      for (const x of ch) expect(x).toBe(0);
    }
  });
});

describe('softLimit', () => {
  it('is the identity below the knee', () => {
    for (const x of [0, 0.05, -0.3, LIMIT_KNEE, -LIMIT_KNEE]) expect(softLimit(x)).toBe(x);
  });

  it('is continuous through the knee (no step, unlike a threshold clip)', () => {
    const eps = 1e-4;
    expect(softLimit(LIMIT_KNEE + eps) - LIMIT_KNEE).toBeCloseTo(eps, 7);
  });

  it('is monotone and never passes the ceiling', () => {
    let prev = -Infinity;
    // Non-decreasing everywhere (tanh flattens into the ceiling at the top of
    // the range), and strictly increasing over the range peaks actually reach.
    for (let x = LIMIT_KNEE; x < 20; x += 0.01) {
      const y = softLimit(x);
      expect(y).toBeGreaterThanOrEqual(prev);
      if (x < 3) expect(y).toBeGreaterThan(prev);
      expect(y).toBeLessThanOrEqual(PEAK_CEILING);
      prev = y;
    }
  });

  it('is odd-symmetric, so it adds no DC offset', () => {
    for (const x of [0.75, 1.1, 3]) expect(softLimit(-x)).toBeCloseTo(-softLimit(x), 12);
  });
});
