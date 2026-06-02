/** Persistence layer backed by AsyncStorage. */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { AMBIENT_KEYS, DEFAULT_SETTINGS, type SessionRecord, type Settings } from './types';

const SESSIONS_KEY = 'mc.sessions.v1';
const SETTINGS_KEY = 'mc.settings.v1';

/** Keep history bounded; a year of daily sessions is plenty for stats. */
const MAX_SESSIONS = 1000;

export async function loadSessions(): Promise<SessionRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SessionRecord[]) : [];
  } catch {
    return [];
  }
}

export async function saveSessions(sessions: SessionRecord[]): Promise<void> {
  const trimmed = sessions.slice(-MAX_SESSIONS);
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(trimmed));
}

export async function appendSession(record: SessionRecord): Promise<SessionRecord[]> {
  const sessions = await loadSessions();
  sessions.push(record);
  await saveSessions(sessions);
  return sessions;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    // Merge so new fields added in later versions get sane defaults.
    const merged = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    // Drop a sound that no longer exists (e.g. a renamed/removed track).
    if (!AMBIENT_KEYS.includes(merged.ambient)) merged.ambient = 'none';
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function clearAllData(): Promise<void> {
  await AsyncStorage.multiRemove([SESSIONS_KEY, SETTINGS_KEY]);
}
