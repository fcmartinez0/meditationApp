jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { nextSpec } from '@/lib/preferences';
import { PROGRESSION_COUNT, type PieceRating, type PieceSpec, type Section } from '@/lib/types';

// The valid value sets the generative engine knows how to render. nextSpec is
// the only thing that produces specs, so if it ever emits a value outside these
// the synth would silently misbehave. This is the contract between the two.
const SCALES = [
  'major_pentatonic',
  'minor_pentatonic',
  'lydian',
  'dorian',
  'aeolian',
  'mixolydian',
  'phrygian',
  'harmonic_minor',
];
const WAVES = ['sine', 'triangle', 'warm'];
const INSTRUMENTS = ['pad', 'choir', 'bells', 'pluck', 'keys'];
const PERCUSSION = ['none', 'heartbeat', 'pulse', 'shaker', 'broken', 'offbeat', 'tribal'];
const BAND: Record<Section, number[]> = { rest: [3, 4, 5, 6], chill: [9, 10, 11] };

function fullSpec(section: Section, overrides: Partial<PieceSpec> = {}): PieceSpec {
  return {
    seed: Math.floor(Math.random() * 1e9),
    section,
    scale: 'dorian',
    root: section === 'rest' ? 50 : 53,
    brightness: 0.4,
    chordChangeSec: 12,
    binauralHz: section === 'rest' ? 4 : 10,
    chimeDensity: 0.1,
    tempo: section === 'rest' ? 60 : 90,
    pulseDepth: 0,
    wave: 'sine',
    instrument: 'pad',
    arp: true,
    bass: true,
    percussion: 'shaker',
    progression: 1,
    melody: true,
    ...overrides,
  };
}

function expectValid(s: PieceSpec, section: Section) {
  expect(s.section).toBe(section);
  expect(SCALES).toContain(s.scale);
  expect(WAVES).toContain(s.wave);
  expect(INSTRUMENTS).toContain(s.instrument);
  expect(PERCUSSION).toContain(s.percussion);
  expect(BAND[section]).toContain(s.binauralHz); // entrainment never leaves the band

  // Numeric ranges the engine relies on.
  expect(s.root).toBeGreaterThanOrEqual(36);
  expect(s.root).toBeLessThanOrEqual(72);
  expect(s.brightness).toBeGreaterThanOrEqual(0);
  expect(s.brightness).toBeLessThanOrEqual(1);
  expect(s.chordChangeSec).toBeGreaterThan(0);
  expect(s.chimeDensity).toBeGreaterThanOrEqual(0);
  expect(s.tempo).toBeGreaterThan(0);
  expect(Number.isInteger(s.progression)).toBe(true);
  expect(s.progression).toBeGreaterThanOrEqual(0);
  expect(s.progression).toBeLessThan(PROGRESSION_COUNT);

  // Section-specific invariants.
  if (section === 'rest') {
    expect(s.pulseDepth).toBe(0); // rest never pulses
  } else {
    expect(s.pulseDepth).toBeGreaterThanOrEqual(0);
    expect(s.pulseDepth).toBeLessThanOrEqual(0.3);
  }

  // Flags must be real booleans (the engine branches on them).
  for (const flag of [s.arp, s.bass, s.melody]) expect(typeof flag).toBe('boolean');

  // Every value must survive a JSON round-trip (specs are persisted as ratings).
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
}

describe('nextSpec always emits an engine-valid spec', () => {
  const sections: Section[] = ['rest', 'chill'];

  it('is valid with no history (the explore path)', () => {
    for (const section of sections) {
      for (let i = 0; i < 300; i++) expectValid(nextSpec(section, []), section);
    }
  });

  it('is valid when learning from a history of ratings (the exploit path)', () => {
    for (const section of sections) {
      const ratings: PieceRating[] = [];
      for (let i = 0; i < 20; i++) {
        ratings.push({
          section,
          spec: fullSpec(section, { scale: 'lydian', instrument: 'bells' }),
          score: i % 5 === 0 ? -1 : 1,
          at: i,
        });
      }
      for (let i = 0; i < 300; i++) expectValid(nextSpec(section, ratings), section);
    }
  });
});
