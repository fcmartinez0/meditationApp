import {
  FILE_RMS,
  FILE_SCALE,
  GEN_NATIVE_RMS,
  GEN_NATIVE_SCALE,
  GEN_WEB_SCALE,
  masterGain,
  type LoudnessSource,
} from '@/lib/loudness';

const SOURCES: LoudnessSource[] = ['file', 'gen-native', 'gen-web'];

describe('masterGain', () => {
  it('is monotonically non-decreasing in the user volume for every source', () => {
    for (const source of SOURCES) {
      let prev = -Infinity;
      for (let v = 0; v <= 1.0001; v += 0.05) {
        const g = masterGain(source, v);
        expect(g).toBeGreaterThanOrEqual(prev);
        prev = g;
      }
    }
  });

  it('clamps the user volume to 0..1', () => {
    for (const source of SOURCES) {
      expect(masterGain(source, -1)).toBe(0);
      expect(masterGain(source, -0.001)).toBe(0);
      // Above 1 the gain must plateau at the source's full-scale value, never
      // exceed it — the per-source scale is the loudness ceiling.
      expect(masterGain(source, 2)).toBe(masterGain(source, 1));
    }
  });

  it('scales linearly between the clamp bounds', () => {
    for (const source of SOURCES) {
      expect(masterGain(source, 0.5)).toBeCloseTo(masterGain(source, 1) / 2, 10);
    }
  });
});

describe('loudness policy', () => {
  it('keeps file audio at its long-standing 0.6 baseline (behavior guard)', () => {
    // Changing this changes the app's overall loudness for everyone; the other
    // scales are derived from it.
    expect(FILE_SCALE).toBe(0.6);
    expect(masterGain('file', 1)).toBe(0.6);
  });

  it('matches file and native-generative perceived loudness at any slider position', () => {
    // Perceived level ≈ content RMS × master scale. The two must agree within
    // 5% so the same slider position is volume-neutral across sources.
    const file = FILE_RMS * FILE_SCALE;
    const gen = GEN_NATIVE_RMS * GEN_NATIVE_SCALE;
    expect(Math.abs(file - gen) / file).toBeLessThan(0.05);
  });

  it('keeps the by-ear web generative scale at its current effective loudness', () => {
    // No RMS-normalized content on web to derive from; 0.5 preserves what the
    // app shipped with. Revisit with the harness (see loudness.ts).
    expect(GEN_WEB_SCALE).toBe(0.5);
  });
});
