import { foldLoop, GAIN_MAX, GAIN_MIN, PEAK_CEILING, TARGET_RMS, type RenderedBuffer } from '@/lib/loop-fold';

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

describe('foldLoop', () => {
  it('trims the render to the loop length, one output per channel', async () => {
    const out = await foldLoop(buffer(constant(0.1), constant(0.1)), LOOP, XF);
    expect(out).toHaveLength(2);
    for (const ch of out) expect(ch).toHaveLength(LOOP);
  });

  it('normalizes a constant signal to TARGET_RMS when the needed gain is in the clamp band', async () => {
    // 0.1 needs roughly a 1.8x boost — inside the 0.4..2.2 clamp, and its peak
    // stays far below the ceiling, so the output RMS must land on the target.
    const out = await foldLoop(buffer(constant(0.1)), LOOP, XF);
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

  it('clamps the cut for a hot render (gain floor)', async () => {
    // 0.5 would need a 0.36x cut to reach the target; the floor holds it at
    // GAIN_MIN so a loud, dense render is tamed but not crushed.
    const out = await foldLoop(buffer(constant(0.5)), LOOP, XF);
    expect(out[0][LOOP - 1] / 0.5).toBeCloseTo(GAIN_MIN, 5);
    expect(rms(out[0])).toBeGreaterThan(TARGET_RMS);
  });

  it('never exceeds the peak ceiling, even when the RMS gain would', async () => {
    // Quiet bed (earns the full GAIN_MAX boost) plus one 0.5 spike: boosted the
    // spike would hit 1.1, so the gain must be pulled back to PEAK_CEILING/peak.
    const data = constant(0.05);
    data[500] = 0.5;
    const out = await foldLoop(buffer(data), LOOP, XF);
    const peak = peakOf(out[0]);
    expect(peak).toBeLessThanOrEqual(PEAK_CEILING + 1e-6);
    expect(peak).toBeCloseTo(PEAK_CEILING, 5);
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
