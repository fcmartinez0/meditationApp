/** Shared domain types for the meditation app. */

/** Live, procedurally-generated sounds (no audio file backs these). */
export type GenerativeSound = 'gen_rest' | 'gen_chill';

/** Background bed: silence, a nature ambience, a fixed track, or a generative one. */
export type AmbientSound =
  | 'none'
  | 'rain'
  | 'ocean'
  | 'forest'
  | 'stream'
  | 'fire'
  | 'night'
  | 'brown'
  | 'white'
  | 'pink'
  | 'purr'
  | 'calm'
  | 'focus'
  | 'deep'
  | 'dream'
  | 'clarity'
  | 'lofi'
  | 'liquid'
  | 'chillstep'
  | 'downtempo'
  | 'deephouse'
  | 'melodic'
  | 'techno'
  | GenerativeSound;

/** Sounds backed by a bundled .wav (everything except silence and generative). */
export type FileSound = Exclude<AmbientSound, 'none' | GenerativeSound>;

/** Every selectable sound, used to validate persisted settings. */
export const AMBIENT_KEYS: AmbientSound[] = [
  'none',
  'rain',
  'ocean',
  'forest',
  'stream',
  'fire',
  'night',
  'brown',
  'white',
  'pink',
  'purr',
  'calm',
  'focus',
  'deep',
  'dream',
  'clarity',
  'lofi',
  'liquid',
  'chillstep',
  'downtempo',
  'deephouse',
  'melodic',
  'techno',
  'gen_rest',
  'gen_chill',
];

export function isGenerative(sound: AmbientSound): sound is GenerativeSound {
  return sound === 'gen_rest' || sound === 'gen_chill';
}

/** The two "sections" a generative piece can belong to (for preference learning). */
export type Section = 'rest' | 'chill';

export function sectionFor(sound: GenerativeSound): Section {
  return sound === 'gen_rest' ? 'rest' : 'chill';
}

/**
 * The parameters that define one generated piece. The same spec always
 * produces the same evolving music (the seed drives every random choice), so
 * a rating can be meaningfully attributed to it.
 */
export type GenWave = 'sine' | 'triangle' | 'warm' | 'bell' | 'glass';
export type GenPercussion =
  | 'none'
  | 'heartbeat'
  | 'pulse'
  | 'shaker'
  | 'broken'
  | 'offbeat'
  | 'tribal';

export interface PieceSpec {
  seed: number;
  section: Section;
  scale: string;
  /** Root note, MIDI. */
  root: number;
  /** 0..1 — overall filter openness / timbre brightness. */
  brightness: number;
  /** Seconds between chord changes. */
  chordChangeSec: number;
  /** Binaural detune between L/R voices, Hz (0 = none). */
  binauralHz: number;
  /** 0..1 — how often gentle chimes appear. */
  chimeDensity: number;
  /** Rhythmic grid tempo (BPM) for the arp and percussion. */
  tempo: number;
  /** 0..0.3 — gentle amplitude pulse depth (0 = none). */
  pulseDepth: number;
  /** Pad/voice timbre. */
  wave: GenWave;
  /** Whether a melodic arpeggio plays over the chords. */
  arp: boolean;
  /** Whether a sub-bass follows the chord root. */
  bass: boolean;
  /** Soft percussion pattern. */
  percussion: GenPercussion;
  /** Index into the chord-progression table (harmonic movement). */
  progression: number;
  /** Whether a sparse melodic lead plays phrases over the chords. */
  melody: boolean;
}

/** Number of chord progressions the generative engine can choose from. */
export const PROGRESSION_COUNT = 8;

/** A user rating of a generated piece, used to learn preferences per section. */
export interface PieceRating {
  section: Section;
  spec: PieceSpec;
  /** +1 = liked, -1 = disliked. */
  score: number;
  at: number;
}

/** The visual shown during a session. */
export type TimerStyle = 'orb' | 'tide' | 'minimal';

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
  /** Background sound volume, 0..1. */
  volume: number;
  /** Visual shown during a session. */
  timerStyle: TimerStyle;
  /** Schema version, for one-time migrations of stored settings. */
  settingsVersion: number;
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
  // Bells are off by default — many people prefer silent start/end.
  startBell: false,
  endBell: false,
  reminderEnabled: false,
  reminderHour: 8,
  reminderMinute: 0,
  volume: 0.85,
  timerStyle: 'orb',
  settingsVersion: 2,
};
