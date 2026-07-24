import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  appendSession,
  loadSessions,
  loadSettings,
  saveSessions,
  saveSettings,
} from '@/lib/storage';
import { DEFAULT_SETTINGS, RECENTS_MAX, type SessionRecord } from '@/lib/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Storage keys are private to storage.ts by design; the literals here pin the
// on-disk contract (renaming a key would silently orphan every user's data).
const SESSIONS_KEY = 'mc.sessions.v1';
const SETTINGS_KEY = 'mc.settings.v1';
/** Mirrors MAX_SESSIONS in storage.ts (private there on purpose). */
const MAX_SESSIONS = 1000;

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    endedAt: 1_750_000_000_000,
    day: '2026-07-24',
    durationSec: 600,
    completed: true,
    ambient: 'rain',
    ...overrides,
  };
}

beforeEach(() => AsyncStorage.clear());

describe('loadSettings', () => {
  it('returns the defaults when nothing is stored', async () => {
    const s = await loadSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
    // Must be a copy — a caller mutating it must not corrupt the shared defaults.
    expect(s).not.toBe(DEFAULT_SETTINGS);
  });

  it('migrates pre-v3 settings: existing users skip onboarding', async () => {
    // A v1 blob has no settingsVersion field at all.
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ durationMin: 15, ambient: 'rain' }));
    const s = await loadSettings();
    expect(s.onboarded).toBe(true);
    expect(s.settingsVersion).toBe(3);
    expect(s.durationMin).toBe(15); // stored values survive the migration
  });

  it('migrates an explicit settingsVersion 2 the same way', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ settingsVersion: 2, onboarded: false }));
    const s = await loadSettings();
    expect(s.onboarded).toBe(true);
    expect(s.settingsVersion).toBe(3);
  });

  it('leaves onboarded alone for settings already at v3', async () => {
    // A fresh v3 user who hasn’t finished onboarding must still see it.
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ settingsVersion: 3, onboarded: false }));
    expect((await loadSettings()).onboarded).toBe(false);
  });

  it('falls back to "none" for an ambient sound that no longer exists', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ settingsVersion: 3, ambient: 'waterfall' }));
    expect((await loadSettings()).ambient).toBe('none');
  });

  it('keeps a still-valid ambient sound', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ settingsVersion: 3, ambient: 'ocean' }));
    expect((await loadSettings()).ambient).toBe('ocean');
  });

  it('sanitizes recents: drops unknown keys, dedupes, caps at RECENTS_MAX', async () => {
    const recents = [
      'rain',
      'waterfall', // removed sound -> dropped
      'rain', // duplicate -> deduped
      42, // wrong type -> dropped
      'ocean',
      'forest',
      'stream',
      'fire',
      'night',
      'brown',
      'white',
      'pink', // 9th valid unique key -> beyond the cap
    ];
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ settingsVersion: 3, recents }));
    const s = await loadSettings();
    expect(s.recents).toHaveLength(RECENTS_MAX);
    expect(s.recents).toEqual(['rain', 'ocean', 'forest', 'stream', 'fire', 'night', 'brown', 'white']);
  });

  it('coerces a non-array recents to an empty list', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ settingsVersion: 3, recents: 'rain' }));
    expect((await loadSettings()).recents).toEqual([]);
  });

  it('returns defaults for corrupt JSON', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, '{not valid json');
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through saveSettings', async () => {
    const settings = { ...DEFAULT_SETTINGS, durationMin: 20, ambient: 'fire' as const, recents: ['fire' as const] };
    await saveSettings(settings);
    expect(await loadSettings()).toEqual(settings);
  });
});

describe('loadSessions', () => {
  it('returns [] when nothing is stored, on corrupt JSON, and on a non-array', async () => {
    expect(await loadSessions()).toEqual([]);
    await AsyncStorage.setItem(SESSIONS_KEY, '[{"endedAt":'); // truncated write
    expect(await loadSessions()).toEqual([]);
    await AsyncStorage.setItem(SESSIONS_KEY, '{"endedAt":1}'); // object, not array
    expect(await loadSessions()).toEqual([]);
  });

  it('drops malformed records and keeps the valid ones', async () => {
    const good = record();
    const blob = [
      good,
      null, // not an object
      'nope', // not an object
      { day: '2026-07-24', durationSec: 60 }, // missing endedAt
      { endedAt: 1, durationSec: 60 }, // missing day
      { endedAt: '1', day: 'x', durationSec: 60 }, // endedAt wrong type
      { endedAt: 1, day: 'x', durationSec: null }, // durationSec wrong type (NaN serializes to null)
    ];
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(blob));
    expect(await loadSessions()).toEqual([good]);
  });

  it('drops records with non-finite numerics', async () => {
    // JSON.parse turns 1e999 into Infinity — the closest a stored blob can get
    // to the NaN/Infinity corruption isValidSession guards the stats against.
    await AsyncStorage.setItem(
      SESSIONS_KEY,
      '[{"endedAt":1e999,"day":"2026-07-24","durationSec":60,"completed":true,"ambient":"rain"},' +
        '{"endedAt":1,"day":"2026-07-24","durationSec":1e999,"completed":true,"ambient":"rain"}]',
    );
    expect(await loadSessions()).toEqual([]);
  });
});

describe('saveSessions / appendSession', () => {
  it('round-trips a session list', async () => {
    const sessions = [record({ endedAt: 1 }), record({ endedAt: 2, completed: false })];
    await saveSessions(sessions);
    expect(await loadSessions()).toEqual(sessions);
  });

  it('keeps only the most recent MAX_SESSIONS records', async () => {
    const many = Array.from({ length: MAX_SESSIONS + 5 }, (_, i) => record({ endedAt: i }));
    await saveSessions(many);
    const loaded = await loadSessions();
    expect(loaded).toHaveLength(MAX_SESSIONS);
    // The oldest 5 were trimmed; the newest survive.
    expect(loaded[0].endedAt).toBe(5);
    expect(loaded[loaded.length - 1].endedAt).toBe(MAX_SESSIONS + 4);
  });

  it('appendSession persists the new record and returns the updated list', async () => {
    await saveSessions([record({ endedAt: 1 })]);
    const appended = record({ endedAt: 2 });
    const result = await appendSession(appended);
    expect(result.map((r) => r.endedAt)).toEqual([1, 2]);
    expect(await loadSessions()).toEqual(result);
  });
});
