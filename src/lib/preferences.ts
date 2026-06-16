/**
 * Learns what generated music a user likes, per section, from their ratings.
 *
 * Each generated piece is described by a `PieceSpec`. When the user rates a
 * piece, we store the spec + score. To pick the next piece we mostly "exploit"
 * (sample near the specs they liked, away from disliked ones) but sometimes
 * "explore" (try something fresh), so the music keeps evolving toward taste
 * without getting stuck.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  GenInstrument,
  GenPercussion,
  GenWave,
  PieceRating,
  PieceSpec,
  Section,
} from './types';
import { PROGRESSION_COUNT } from './types';

const RATINGS_KEY = 'mc.ratings.v1';
const MAX_RATINGS = 300;
// Exploration shrinks as we learn more, but never stops (taste keeps evolving).
const EXPLORE_MAX = 0.35;
const EXPLORE_MIN = 0.12;
// Recency half-life (in ratings): recent feedback counts ~2x an older one.
const RECENCY_HALF_LIFE = 10;

const SCALES = [
  'major_pentatonic',
  'minor_pentatonic',
  'lydian',
  'dorian',
  'aeolian',
  'mixolydian',
  'phrygian',
  'harmonic_minor',
] as const;

const WAVES: GenWave[] = ['sine', 'triangle', 'warm', 'bell', 'glass'];
const INSTRUMENTS: GenInstrument[] = ['pad', 'choir', 'bells', 'pluck', 'keys'];

interface Range {
  rootMin: number;
  rootMax: number;
  brightMin: number;
  brightMax: number;
  chordMin: number;
  chordMax: number;
  binaurals: number[];
  chimeMax: number;
  tempoMin: number;
  tempoMax: number;
  pulseMax: number;
  arpChance: number;
  bassChance: number;
  percussion: GenPercussion[];
}

// Sensible parameter ranges for each section.
const RANGES: Record<Section, Range> = {
  rest: {
    rootMin: 45,
    rootMax: 55,
    brightMin: 0.15,
    brightMax: 0.55,
    chordMin: 11,
    chordMax: 22,
    binaurals: [3, 4, 5, 6],
    chimeMax: 0.35,
    tempoMin: 48,
    tempoMax: 72,
    pulseMax: 0,
    arpChance: 0.45,
    bassChance: 0.7,
    // Mostly still, with subtle motion options for variety.
    percussion: ['none', 'none', 'heartbeat', 'shaker', 'tribal'],
  },
  chill: {
    rootMin: 48,
    rootMax: 58,
    brightMin: 0.4,
    brightMax: 0.85,
    chordMin: 6,
    chordMax: 12,
    binaurals: [9, 10, 11],
    chimeMax: 0.2,
    tempoMin: 80,
    tempoMax: 104,
    pulseMax: 0.22,
    arpChance: 0.75,
    bassChance: 0.85,
    percussion: ['pulse', 'shaker', 'broken', 'heartbeat', 'offbeat', 'tribal'],
  },
};

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

function randIn(lo: number, hi: number) {
  return lo + Math.random() * (hi - lo);
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function loadRatings(): Promise<PieceRating[]> {
  try {
    const raw = await AsyncStorage.getItem(RATINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PieceRating[]) : [];
  } catch {
    return [];
  }
}

async function saveRatings(ratings: PieceRating[]): Promise<void> {
  await AsyncStorage.setItem(RATINGS_KEY, JSON.stringify(ratings.slice(-MAX_RATINGS)));
}

export async function recordRating(spec: PieceSpec, score: number): Promise<void> {
  const ratings = await loadRatings();
  ratings.push({ section: spec.section, spec, score, at: Date.now() });
  await saveRatings(ratings);
}

export async function clearRatings(): Promise<void> {
  await AsyncStorage.removeItem(RATINGS_KEY);
}

/** A fresh random spec within the section's ranges. */
function randomSpec(section: Section): PieceSpec {
  const r = RANGES[section];
  return {
    seed: Math.floor(Math.random() * 1e9),
    section,
    scale: pick(SCALES),
    root: Math.round(randIn(r.rootMin, r.rootMax)),
    brightness: randIn(r.brightMin, r.brightMax),
    chordChangeSec: randIn(r.chordMin, r.chordMax),
    binauralHz: pick(r.binaurals),
    chimeDensity: randIn(0, r.chimeMax),
    tempo: Math.round(randIn(r.tempoMin, r.tempoMax)),
    pulseDepth: r.pulseMax > 0 ? randIn(0, r.pulseMax) : 0,
    wave: pick(WAVES),
    arp: Math.random() < r.arpChance,
    bass: Math.random() < r.bassChance,
    percussion: pick(r.percussion),
    progression: Math.floor(Math.random() * PROGRESSION_COUNT),
    melody: Math.random() < (section === 'rest' ? 0.5 : 0.6),
    instrument: pick(INSTRUMENTS),
  };
}

/**
 * Build the next spec for a section. Exploration (a fresh random piece) shrinks
 * as ratings accumulate but never stops, so taste keeps evolving. Otherwise the
 * piece is centered on the user's liked specs, weighted toward recent feedback,
 * using their best net-liked categorical traits. binauralHz always stays within
 * the section's researched band, so the entrainment benefit is never lost.
 */
export function nextSpec(section: Section, ratings: PieceRating[]): PieceSpec {
  const here = ratings.filter((rt) => rt.section === section).sort((a, b) => a.at - b.at);
  const liked = here.filter((rt) => rt.score > 0);

  const exploreRate = Math.max(EXPLORE_MIN, EXPLORE_MAX - here.length * 0.015);
  if (liked.length === 0 || Math.random() < exploreRate) {
    return randomSpec(section);
  }

  const r = RANGES[section];
  // Recency weight per rating: newest ≈ 1, halving every RECENCY_HALF_LIFE.
  const n = here.length;
  const wAt = (i: number) => Math.pow(0.5, (n - 1 - i) / RECENCY_HALF_LIFE);

  // Recency-weighted mean over the liked pieces.
  const mean = (sel: (s: PieceSpec) => number) => {
    let s = 0;
    let w = 0;
    here.forEach((rt, i) => {
      if (rt.score > 0) {
        s += wAt(i) * sel(rt.spec);
        w += wAt(i);
      }
    });
    return w > 0 ? s / w : 0;
  };

  // Categorical: the value with the best recency-weighted net score — only
  // commit when it's genuinely net-positive, else fall back to a fresh pick.
  const bestBy = <T>(get: (s: PieceSpec) => T, fallback: T): T => {
    const score = new Map<T, number>();
    here.forEach((rt, i) => {
      const v = get(rt.spec);
      score.set(v, (score.get(v) ?? 0) + wAt(i) * rt.score);
    });
    let bestVal = fallback;
    let best = 0;
    for (const [val, sc] of score) {
      if (sc > best) {
        best = sc;
        bestVal = val;
      }
    }
    return bestVal;
  };

  // Booleans: lean toward what recent liked pieces mostly had.
  const likedMajority = (get: (s: PieceSpec) => boolean, chance: number): boolean => {
    let yes = 0;
    let tot = 0;
    here.forEach((rt, i) => {
      if (rt.score > 0) {
        tot += wAt(i);
        if (get(rt.spec)) yes += wAt(i);
      }
    });
    return tot > 0 && yes * 2 >= tot ? Math.random() < 0.85 : Math.random() < chance * 0.4;
  };

  const jitter = (amt: number) => (Math.random() * 2 - 1) * amt;
  const likedBinaurals = liked.map((rt) => rt.spec.binauralHz);

  return {
    seed: Math.floor(Math.random() * 1e9),
    section,
    scale: bestBy((s) => s.scale, pick(SCALES)),
    root: Math.round(clamp(mean((s) => s.root) + jitter(1.5), r.rootMin, r.rootMax)),
    brightness: clamp(mean((s) => s.brightness) + jitter(0.1), r.brightMin, r.brightMax),
    chordChangeSec: clamp(mean((s) => s.chordChangeSec) + jitter(2), r.chordMin, r.chordMax),
    binauralHz: likedBinaurals.length ? pick(likedBinaurals) : pick(r.binaurals),
    chimeDensity: clamp(mean((s) => s.chimeDensity) + jitter(0.08), 0, r.chimeMax),
    tempo: Math.round(clamp(mean((s) => s.tempo) + jitter(4), r.tempoMin, r.tempoMax)),
    pulseDepth: r.pulseMax > 0 ? clamp(mean((s) => s.pulseDepth) + jitter(0.05), 0, r.pulseMax) : 0,
    wave: bestBy((s) => s.wave, pick(WAVES)),
    arp: likedMajority((s) => s.arp, r.arpChance),
    bass: likedMajority((s) => s.bass, r.bassChance),
    percussion: bestBy((s) => s.percussion, pick(r.percussion)),
    progression: bestBy((s) => s.progression, Math.floor(Math.random() * PROGRESSION_COUNT)),
    melody: likedMajority((s) => s.melody, section === 'rest' ? 0.5 : 0.6),
    instrument: bestBy((s) => s.instrument, pick(INSTRUMENTS)),
  };
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** A short "now playing" description of a piece, e.g. "D dorian · heartbeat". */
export function describeSpec(spec: PieceSpec): string {
  const note = NOTE_NAMES[(((spec.root % 12) + 12) % 12)];
  const parts = [`${note} ${spec.scale.replace('_', ' ')}`];
  parts.push(spec.instrument);
  if (spec.melody) parts.push('melody');
  if (spec.percussion !== 'none') parts.push(spec.percussion);
  else if (spec.arp) parts.push('arp');
  return parts.join(' · ');
}

/** A short human-readable summary of learned taste, for the Settings screen. */
export function summarizePreference(section: Section, ratings: PieceRating[]): string | null {
  const here = ratings.filter((rt) => rt.section === section);
  if (here.length === 0) return null;
  const likes = here.filter((rt) => rt.score > 0).length;
  const scaleScore = new Map<string, number>();
  for (const rt of here) {
    scaleScore.set(rt.spec.scale, (scaleScore.get(rt.spec.scale) ?? 0) + rt.score);
  }
  let bestScale: string | null = null;
  let best = -Infinity;
  for (const [scale, sc] of scaleScore) {
    if (sc > best) {
      best = sc;
      bestScale = scale;
    }
  }
  const scaleName = bestScale ? bestScale.replace('_', ' ') : 'varied';
  return `${likes}/${here.length} liked · leaning ${scaleName}`;
}
