/** Shared domain types for the meditation app. */

/** Background bed: silence, a nature ambience, a binaural track, or a beat track. */
export type AmbientSound =
  | 'none'
  | 'rain'
  | 'ocean'
  | 'forest'
  | 'calm'
  | 'focus'
  | 'deep'
  | 'lofi'
  | 'liquid'
  | 'chillstep'
  | 'downtempo'
  | 'deephouse'
  | 'melodic';

/** Every selectable sound, used to validate persisted settings. */
export const AMBIENT_KEYS: AmbientSound[] = [
  'none',
  'rain',
  'ocean',
  'forest',
  'calm',
  'focus',
  'deep',
  'lofi',
  'liquid',
  'chillstep',
  'downtempo',
  'deephouse',
  'melodic',
];

/** A single completed (or partially completed) meditation session. */
export interface SessionRecord {
  /** Unix epoch ms when the session ended. */
  endedAt: number;
  /** Local calendar day key, e.g. "2026-06-02". */
  day: string;
  /** Seconds the user actually meditated. */
  durationSec: number;
  /** Whether the planned duration was reached (vs. ended early). */
  completed: boolean;
  ambient: AmbientSound;
}

export interface Settings {
  /** Default session length in minutes. */
  durationMin: number;
  /** Interval bell every N minutes (0 = off). */
  intervalMin: number;
  ambient: AmbientSound;
  /** Play a bell at the start of a session. */
  startBell: boolean;
  /** Play a bell at the end of a session. */
  endBell: boolean;
  /** Daily reminder enabled. */
  reminderEnabled: boolean;
  /** Reminder time, 24h. */
  reminderHour: number;
  reminderMinute: number;
}

export interface Stats {
  currentStreak: number;
  longestStreak: number;
  totalSessions: number;
  totalMinutes: number;
  /** Minutes meditated per weekday for the current week (Mon..Sun). */
  weekMinutes: number[];
  /** True if the user has already meditated today. */
  meditatedToday: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  durationMin: 10,
  intervalMin: 0,
  ambient: 'none',
  startBell: true,
  endBell: true,
  reminderEnabled: false,
  reminderHour: 8,
  reminderMinute: 0,
};
