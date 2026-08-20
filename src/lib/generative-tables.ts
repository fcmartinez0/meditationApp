/**
 * Shared musical tables for the generative engine.
 *
 * Imported by BOTH engines (generative.ts native, generative.web.ts web) and by
 * types.ts, so the two platforms can never drift: a scale/voicing/arp/progression
 * added here changes both at once, and PROGRESSION_COUNT stays in sync. These are
 * pure data (no audio-API types), so this module has no platform dependencies.
 */

export const SCALES: Record<string, number[]> = {
  major_pentatonic: [0, 2, 4, 7, 9],
  minor_pentatonic: [0, 3, 5, 7, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  major: [0, 2, 4, 5, 7, 9, 11], // bright, open
  lydian_dominant: [0, 2, 4, 6, 7, 9, 10], // dreamy, floating
  hirajoshi: [0, 2, 3, 7, 8], // Japanese pentatonic — spacious, calm
};

export const VOICINGS = [
  [0, 2, 4, 6], // 7th
  [0, 1, 4, 6], // sus2
  [0, 3, 4, 6], // sus4
  [0, 2, 4, 8], // add9
  [0, 4, 6, 8], // open / quartal
  [0, 4, 8, 10], // wide stacked — spacious
  [0, 2, 6, 8], // open with 11th colour
];

export const ARP_PATTERNS = [
  [0, 2, 1, 3, 2, 4, 1, 2],
  [0, 1, 2, 3, 4, 3, 2, 1], // up & down
  [0, 2, 4, 2, 1, 3, 1, 0],
  [0, 3, 1, 4, 2, 0, 3, 1], // wider leaps
  [4, 3, 2, 1, 0, 1, 2, 3], // descending
  [0, 2, 4, 6, 4, 2, 0, 2], // arch
  [0, 4, 1, 5, 2, 6, 3, 0], // wide skips
  [2, 0, 3, 1, 4, 2, 5, 3], // interleaved climb
];

export const PROGRESSIONS = [
  [0, 0, 0, 0], // drone — no movement
  [0, 3, 4, 0], // I – IV – V – I
  [0, 5, 3, 4], // I – vi – IV – V
  [0, 4, 5, 3], // I – V – vi – IV
  [0, 2, 4, 5],
  [0, 5, 1, 4],
  [0, 6, 4, 5],
  [0, 3, 0, 4],
  [0, 4, 1, 5], // gentle circle
  [0, 2, 5, 3],
  [0, 6, 3, 4],
  [0, 1, 4, 5],
];

/** Number of chord progressions the generative engine can choose from. */
export const PROGRESSION_COUNT = PROGRESSIONS.length;
