/**
 * Pure DSP for turning an offline render into a seamless, loudness-consistent
 * loop. Extracted verbatim from generative.ts so the math is unit-testable
 * without the native audio module — the algorithm must stay byte-identical to
 * what the engine shipped with (scripts/gen-harness.mjs verifies the render).
 */

/**
 * The slice of an AudioBuffer that foldLoop actually reads. Structurally
 * satisfied by react-native-audio-api's AudioBuffer (and by plain test fakes).
 */
export interface RenderedBuffer {
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

// Gentle tanh soft-clip for the crossfade-fold safety net — applied in JS only
// to stray peaks that the fold's summing can create after the render.
function softClip(x: number): number {
  return Math.tanh(1.5 * x);
}

// Target loudness (RMS) and a hard peak ceiling. RMS targeting gives consistent
// *perceived* level (a lone loud transient won't drag the whole piece down the
// way peak-only normalization does), and the ceiling guarantees no clipping.
// Matched to the reference tracks, which all measure ≈0.19 RMS, so generated
// pieces feel as full and present — while staying under the peak ceiling.
// NOTE: the playback master scale (GEN_NATIVE_SCALE in ./loudness) is derived
// from this value; if you change it, re-derive the scale there too.
export const TARGET_RMS = 0.18;
export const PEAK_CEILING = 0.95;

// The normalization gain is clamped to this band so a near-silent render is
// never wildly boosted and a hot render is never crushed (see foldLoop).
export const GAIN_MIN = 0.4;
export const GAIN_MAX = 2.2;

/**
 * Equal-power crossfade-fold a rendered buffer into a seamless loop, then
 * normalize it to a consistent loudness so pieces don't jump in volume from one
 * to the next. Runs on the JS thread (no native nodes), so it yields between
 * chunks: a full-length pass would otherwise block the UI for a noticeable beat
 * right as the "Composing" screen hands off to playback. Only samples that
 * actually approach clipping pay for the tanh; the rest pass through untouched.
 */
export async function foldLoop(
  rendered: RenderedBuffer,
  loopSamples: number,
  xfSamples: number,
): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  const CHUNK = 65536; // yield roughly every ~2 s of samples
  let sumSquares = 0;
  let sampleCount = 0;
  let peak = 0;
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    const src = rendered.getChannelData(c);
    const dst = new Float32Array(loopSamples);
    dst.set(src.subarray(0, loopSamples));
    // Blend the tail [loop, loop+xf) over the head [0, xf) so the wrap is seamless.
    for (let i = 0; i < xfSamples; i++) {
      const t = i / xfSamples;
      dst[i] = src[i] * Math.sqrt(t) + src[loopSamples + i] * Math.sqrt(1 - t);
    }
    // Safety soft-clip stray fold peaks, and measure level for normalization.
    for (let i = 0; i < loopSamples; i++) {
      let x = dst[i];
      if (x > 0.6 || x < -0.6) {
        x = softClip(x);
        dst[i] = x;
      }
      const a = x < 0 ? -x : x;
      if (a > peak) peak = a;
      sumSquares += x * x;
      sampleCount++;
      if (i > 0 && i % CHUNK === 0) {
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }
    out.push(dst);
  }

  // Normalize toward a steady loudness, clamped so we never wildly boost a near-
  // silent piece, then pulled under the peak ceiling so it can't clip.
  const rms = Math.sqrt(sumSquares / Math.max(1, sampleCount));
  let gain = rms > 1e-5 ? TARGET_RMS / rms : 1;
  // Floor lowered so a loud, bass+percussion-heavy render is actually pulled
  // down to the target loudness instead of clamping hot.
  gain = Math.max(GAIN_MIN, Math.min(GAIN_MAX, gain));
  if (peak * gain > PEAK_CEILING) gain = peak > 1e-5 ? PEAK_CEILING / peak : gain;
  if (Math.abs(gain - 1) > 0.02) {
    for (const dst of out) {
      for (let i = 0; i < dst.length; i++) {
        dst[i] *= gain;
        if (i > 0 && i % CHUNK === 0) {
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }
    }
  }
  return out;
}
