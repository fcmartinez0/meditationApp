/**
 * One loudness policy for every audio source (audit finding M2).
 *
 * The same slider position used to land at different loudness depending on
 * what was playing, because each engine applied its own ad-hoc master scale.
 * This module is the single place that policy lives; every engine's
 * setVolume/fade path must route through it.
 *
 * The policy has two halves:
 *  1. Content-level loudness matching, where we control the content:
 *     - Bundled ambient/music MP3s are loudness-matched offline to ≈0.19 RMS.
 *     - The native generative engine normalizes its offline render to
 *       TARGET_RMS ≈ 0.18 (see generative.ts foldLoop).
 *  2. A per-source master scale (below) chosen so that, over that known
 *     content loudness, the same slider position is perceptually
 *     volume-neutral across sources: content RMS × scale ≈ equal everywhere.
 */

/** RMS the bundled MP3s are loudness-matched to (measured offline). */
export const FILE_RMS = 0.19;
/** RMS the native generative render is normalized to (TARGET_RMS in generative.ts). */
export const GEN_NATIVE_RMS = 0.18;

/**
 * File audio (native + web): the long-standing baseline. Everything else is
 * derived from it — do not change this without re-deriving the others, and
 * note that changing it changes the app's overall loudness for everyone.
 */
export const FILE_SCALE = 0.6;

/**
 * Native generative: derived so it matches file audio at the same slider
 * position — FILE_SCALE × (FILE_RMS / GEN_NATIVE_RMS) = 0.6 × (0.19/0.18)
 * ≈ 0.633, rounded to 0.63. The engine previously applied the slider raw
 * (default 0.85), which played ~2–3 dB hotter than file audio; 0.63 is the
 * intended fix, not a regression.
 */
export const GEN_NATIVE_SCALE = 0.63;

/**
 * Web generative synthesizes live, so there is no RMS-normalized content to
 * derive a scale from. 0.5 was set by ear against file audio and is kept as
 * the current effective loudness; revisit with the harness
 * (scripts/gen-harness.mjs) once the web engine's output can be measured.
 */
export const GEN_WEB_SCALE = 0.5;

export type LoudnessSource = 'file' | 'gen-native' | 'gen-web';

const SCALE: Record<LoudnessSource, number> = {
  file: FILE_SCALE,
  'gen-native': GEN_NATIVE_SCALE,
  'gen-web': GEN_WEB_SCALE,
};

/**
 * Master gain for a source at a user volume-slider position. Clamps the
 * slider to 0..1 so a stray setting can never push a player past the
 * loudness-matched ceiling (or negative, which some backends reject).
 */
export function masterGain(source: LoudnessSource, userVolume: number): number {
  return SCALE[source] * Math.max(0, Math.min(1, userVolume));
}
