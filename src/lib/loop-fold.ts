/**
 * Pure DSP for turning an offline render into a seamless, loudness-consistent
 * loop. Extracted from generative.ts so the math is unit-testable without the
 * native audio module — scripts/gen-harness.mjs verifies the result on real
 * renders (its RMS ±sd column is the number this file exists to keep small).
 */

/**
 * The slice of an AudioBuffer that foldLoop actually reads. Structurally
 * satisfied by react-native-audio-api's AudioBuffer (and by plain test fakes).
 */
export interface RenderedBuffer {
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
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

// Soft-knee limiter. Samples below the knee pass through bit-exact; above it
// they are progressively squeezed into the headroom between the knee and the
// ceiling, approaching it asymptotically (so the output never passes
// PEAK_CEILING and the curve is continuous — no step, no hard clip).
//
// The knee sits ~11.8 dB above TARGET_RMS, so ordinary material never touches
// it: only the rare transient (a kick attack, a fold-summed overshoot) is
// compressed, which is exactly what lets the piece hit the loudness target
// without the whole thing being scaled down around one peak.
export const LIMIT_KNEE = 0.7;

// The normalization gain is clamped to this band. These are sanity rails, not
// tone shaping: they stop a near-silent render being blasted to full loudness
// and a pathologically hot one being scaled into nothing. The band is wide
// enough that real renders are never clamped — before, a GAIN_MIN of 0.4 left
// dense pieces measurably hot (0.235 RMS vs the 0.18 target).
export const GAIN_MIN = 0.15;
export const GAIN_MAX = 3.0;

// Amplitude histogram used to solve for the gain (see solveGain). 256 bins over
// [0, 4) — bin width 0.016, far finer than the limiter's curvature — and
// anything louder falls in the top bin (the per-sample limiter still bounds it).
const HIST_BINS = 256;
const HIST_MAX = 4;

/**
 * Soft-knee limit one sample into [-PEAK_CEILING, PEAK_CEILING]. Identity below
 * the knee — and C¹ at it, since d/du tanh(u) = 1 at u = 0 — so it colours only
 * peaks, never the body of the mix.
 */
export function softLimit(x: number): number {
  const a = x < 0 ? -x : x;
  if (a <= LIMIT_KNEE) return x;
  const head = PEAK_CEILING - LIMIT_KNEE;
  const y = LIMIT_KNEE + head * Math.tanh((a - LIMIT_KNEE) / head);
  return x < 0 ? -y : y;
}

function clampGain(g: number): number {
  return Math.max(GAIN_MIN, Math.min(GAIN_MAX, g));
}

/**
 * Find the gain whose *post-limiter* RMS lands on TARGET_RMS.
 *
 * Plain `TARGET_RMS / rms` is only right while nothing is limited; once peaks
 * are being squeezed, that gain overshoots the target (the limiter eats some of
 * the energy it was supposed to add). So when limiting is in play we solve for
 * the gain instead, evaluating the achieved RMS from the amplitude histogram
 * collected during the fold — a few hundred arithmetic ops, no extra pass over
 * the (million-sample) audio.
 */
function solveGain(
  rms: number,
  peak: number,
  histCount: Float64Array,
  histSq: Float64Array,
  sampleCount: number,
): number {
  if (sampleCount === 0 || !(rms > 1e-5)) return 1;
  const linear = clampGain(TARGET_RMS / rms);
  // Nothing reaches the knee: the limiter is a no-op and plain scaling is exact.
  if (peak * linear <= LIMIT_KNEE) return linear;

  // Per-bin representative amplitude: the RMS *within* the bin, so the energy of
  // the (untouched) sub-knee bins is reproduced exactly.
  const amp = new Float64Array(HIST_BINS);
  for (let b = 0; b < HIST_BINS; b++) {
    if (histCount[b] > 0) amp[b] = Math.sqrt(histSq[b] / histCount[b]);
  }
  const achieved = (g: number): number => {
    let sum = 0;
    for (let b = 0; b < HIST_BINS; b++) {
      const n = histCount[b];
      if (n === 0) continue;
      const y = softLimit(g * amp[b]);
      sum += n * y * y;
    }
    return Math.sqrt(sum / sampleCount);
  };

  // achieved() is monotone in g, so bisect. If even GAIN_MAX can't reach the
  // target (a very quiet render) or GAIN_MIN already overshoots it, take the rail.
  let lo = GAIN_MIN;
  let hi = GAIN_MAX;
  if (achieved(hi) <= TARGET_RMS) return hi;
  if (achieved(lo) >= TARGET_RMS) return lo;
  for (let it = 0; it < 24; it++) {
    const mid = 0.5 * (lo + hi);
    if (achieved(mid) < TARGET_RMS) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

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
  const histCount = new Float64Array(HIST_BINS);
  const histSq = new Float64Array(HIST_BINS);
  const binScale = HIST_BINS / HIST_MAX;

  for (let c = 0; c < rendered.numberOfChannels; c++) {
    const src = rendered.getChannelData(c);
    const dst = new Float32Array(loopSamples);
    dst.set(src.subarray(0, loopSamples));
    // Blend the tail [loop, loop+xf) over the head [0, xf) so the wrap is seamless.
    for (let i = 0; i < xfSamples; i++) {
      const t = i / xfSamples;
      dst[i] = src[i] * Math.sqrt(t) + src[loopSamples + i] * Math.sqrt(1 - t);
    }
    // Measure level (and its distribution) for normalization. Nothing is
    // reshaped here: any overshoot the fold's summing created is handled by the
    // limiter below, *after* the gain — clipping it first would distort the
    // measurement this whole stage depends on.
    for (let i = 0; i < loopSamples; i++) {
      const x = dst[i];
      const a = x < 0 ? -x : x;
      if (a > peak) peak = a;
      const sq = x * x;
      sumSquares += sq;
      sampleCount++;
      let b = (a * binScale) | 0;
      if (b >= HIST_BINS) b = HIST_BINS - 1;
      histCount[b]++;
      histSq[b] += sq;
      if (i > 0 && i % CHUNK === 0) {
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }
    out.push(dst);
  }

  // Normalize toward a steady loudness. Peaks are then rounded off by the
  // soft-knee limiter rather than by scaling the whole piece down around them —
  // that old rule (`gain = PEAK_CEILING / peak`) is why peaky pieces landed
  // several dB under target while dense ones clamped above it.
  const rms = Math.sqrt(sumSquares / Math.max(1, sampleCount));
  const gain = solveGain(rms, peak, histCount, histSq, sampleCount);
  const limiting = peak * gain > LIMIT_KNEE;
  if (limiting || Math.abs(gain - 1) > 0.02) {
    for (const dst of out) {
      for (let i = 0; i < dst.length; i++) {
        // softLimit is the identity below the knee, so quiet samples pay only a
        // compare — the tanh is reached by peaks alone.
        dst[i] = softLimit(dst[i] * gain);
        if (i > 0 && i % CHUNK === 0) {
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }
    }
  }
  return out;
}
