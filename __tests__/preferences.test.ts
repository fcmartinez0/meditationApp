jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { nextSpec } from '@/lib/preferences';
import type { PieceRating, PieceSpec } from '@/lib/types';

function spec(overrides: Partial<PieceSpec> = {}): PieceSpec {
  return {
    seed: 1,
    section: 'rest',
    scale: 'dorian',
    root: 50,
    brightness: 0.4,
    chordChangeSec: 14,
    binauralHz: 6,
    chimeDensity: 0.1,
    tempo: 60,
    pulseDepth: 0,
    wave: 'sine',
    arp: true,
    bass: true,
    percussion: 'heartbeat',
    ...overrides,
  };
}

function liked(overrides: Partial<PieceSpec> = {}): PieceRating {
  return { section: 'rest', spec: spec(overrides), score: 1, at: Date.now() };
}

describe('nextSpec', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns a valid spec when there is no history', () => {
    const s = nextSpec('rest', []);
    expect(s.section).toBe('rest');
    expect(typeof s.root).toBe('number');
    expect(s.pulseDepth).toBe(0); // rest never pulses
  });

  it('exploits toward the liked scale and root when not exploring', () => {
    // > EXPLORE_RATE so it exploits; positive jitter, stable picks.
    jest.spyOn(Math, 'random').mockReturnValue(0.9);
    const ratings = [liked({ scale: 'dorian', root: 50 }), liked({ scale: 'dorian', root: 50 })];
    const s = nextSpec('rest', ratings);
    expect(s.scale).toBe('dorian');
    expect(s.root).toBeGreaterThanOrEqual(45);
    expect(s.root).toBeLessThanOrEqual(55);
  });

  it('learns the best-rated percussion via net score', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9);
    const ratings: PieceRating[] = [
      liked({ percussion: 'tribal' }),
      liked({ percussion: 'tribal' }),
      { section: 'rest', spec: spec({ percussion: 'shaker' }), score: -1, at: Date.now() },
    ];
    expect(nextSpec('rest', ratings).percussion).toBe('tribal');
  });

  it('keeps chill pieces in range and lets them pulse', () => {
    const s = nextSpec('chill', []);
    expect(s.section).toBe('chill');
    expect(s.tempo).toBeGreaterThanOrEqual(80);
    expect(s.tempo).toBeLessThanOrEqual(104);
  });

  it('converges toward liked traits while keeping binaural in the researched band', () => {
    // A user who consistently likes lydian + bells pieces.
    const ratings: PieceRating[] = [];
    for (let i = 0; i < 15; i++) {
      ratings.push({
        section: 'rest',
        spec: spec({ scale: 'lydian', instrument: 'bells', binauralHz: 4.6 }),
        score: 1,
        at: i,
      });
    }
    const band = new Set([3, 4.6, 6]); // rest's researched delta–theta pool (study-aligned)
    let lydian = 0;
    for (let k = 0; k < 400; k++) {
      const s = nextSpec('rest', ratings);
      if (s.scale === 'lydian') lydian++;
      expect(band.has(s.binauralHz)).toBe(true); // entrainment never leaves the band
    }
    expect(lydian).toBeGreaterThan(200); // clearly learned, despite exploration
  });

  it('weights recent feedback over older feedback', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9); // force exploit
    const ratings: PieceRating[] = [];
    // Older: liked aeolian. Newer (and more): liked phrygian.
    for (let i = 0; i < 4; i++) ratings.push({ section: 'rest', spec: spec({ scale: 'aeolian' }), score: 1, at: i });
    for (let i = 4; i < 12; i++) ratings.push({ section: 'rest', spec: spec({ scale: 'phrygian' }), score: 1, at: i });
    expect(nextSpec('rest', ratings).scale).toBe('phrygian');
  });
});
