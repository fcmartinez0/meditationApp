import { dwellForSession } from '@/lib/audio';

// audio.ts imports expo-audio/expo-asset at module scope; neither native module
// is available under jest, so stub just enough for the import to succeed. Only
// the pure dwell math is under test — SessionAudio itself needs a real device.
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(async () => {}),
}));
jest.mock('expo-asset', () => ({ Asset: { fromModule: jest.fn() } }));

describe('dwellForSession (variant-cycling dwell scales with session length)', () => {
  it('defaults to the long-session bounds when no session length is given', () => {
    expect(dwellForSession()).toEqual({ min: 90_000, max: 225_000 });
    expect(dwellForSession(undefined)).toEqual({ min: 90_000, max: 225_000 });
  });

  it('treats a zero-length session like "unknown" (the || guard), not as 45s', () => {
    expect(dwellForSession(0)).toEqual({ min: 90_000, max: 225_000 });
  });

  it('gives a 3-minute session the 45s floor so the mix still moves', () => {
    // 180s / 4 = 45s per variant — exactly the floor.
    expect(dwellForSession(180)).toEqual({ min: 45_000, max: 112_500 });
  });

  it('never dwells less than 45s even for a very short session', () => {
    // 60s / 4 = 15s would churn the mix; the floor holds it at 45s.
    expect(dwellForSession(60)).toEqual({ min: 45_000, max: 112_500 });
  });

  it('scales a 4-minute session between the bounds (quarter of the session)', () => {
    expect(dwellForSession(240)).toEqual({ min: 60_000, max: 150_000 });
  });

  it('caps sessions of 6 minutes and up at 90s min / 225s max', () => {
    expect(dwellForSession(360)).toEqual({ min: 90_000, max: 225_000 });
    // An hour-long session gets the same cap — long sessions aren't churned,
    // but they still evolve at least every 225s.
    expect(dwellForSession(3600)).toEqual({ min: 90_000, max: 225_000 });
  });

  it('keeps max a fixed 2.5x multiple of min within the 240s ceiling', () => {
    for (const sec of [0, 60, 180, 240, 300, 360, 1800]) {
      const { min, max } = dwellForSession(sec);
      expect(max).toBe(Math.min(240_000, min * 2.5));
      expect(min).toBeGreaterThanOrEqual(45_000);
      expect(max).toBeLessThanOrEqual(240_000);
    }
  });
});
