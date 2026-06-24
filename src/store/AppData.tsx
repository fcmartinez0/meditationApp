/**
 * App-wide state: user settings and meditation history, persisted to
 * AsyncStorage and exposed with derived stats. Wrap the app once at the root.
 */

import { Alert } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { computeStats } from '@/lib/stats';
import {
  appendSession,
  clearAllData,
  loadSessions,
  loadSettings,
  saveSettings,
} from '@/lib/storage';
import {
  DEFAULT_SETTINGS,
  type SessionRecord,
  type Settings,
  type Stats,
} from '@/lib/types';

interface AppDataValue {
  ready: boolean;
  settings: Settings;
  stats: Stats;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  recordSession: (record: SessionRecord) => Promise<void>;
  resetData: () => Promise<void>;
}

const AppDataContext = createContext<AppDataValue | null>(null);

const EMPTY_STATS: Stats = {
  currentStreak: 0,
  longestStreak: 0,
  totalSessions: 0,
  totalMinutes: 0,
  weekMinutes: [0, 0, 0, 0, 0, 0, 0],
  meditatedToday: false,
};

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [loadedSettings, loadedSessions] = await Promise.all([
        loadSettings(),
        loadSessions(),
      ]);
      if (!active) return;
      setSettings(loadedSettings);
      setSessions(loadedSessions);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  // Persist settings whenever they change (after the initial load). Doing this
  // in an effect — rather than fire-and-forget inside the setter — lets us
  // actually catch a write failure and tell the user, instead of silently
  // losing their change on the next launch.
  const skipFirstSave = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (skipFirstSave.current) {
      // Don't immediately re-write the value we just loaded from disk.
      skipFirstSave.current = false;
      return;
    }
    saveSettings(settings).catch((e) => {
      console.warn('[settings] save failed', e);
      Alert.alert(
        'Couldn’t save setting',
        'That change might not stick after you close the app. Please try again.',
      );
    });
  }, [settings, ready]);

  const recordSession = useCallback(async (record: SessionRecord) => {
    const updated = await appendSession(record);
    setSessions(updated);
  }, []);

  const resetData = useCallback(async () => {
    await clearAllData();
    setSessions([]);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const stats = useMemo(
    () => (sessions.length ? computeStats(sessions) : EMPTY_STATS),
    [sessions],
  );

  const value = useMemo<AppDataValue>(
    () => ({ ready, settings, stats, updateSettings, recordSession, resetData }),
    [ready, settings, stats, updateSettings, recordSession, resetData],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return ctx;
}
