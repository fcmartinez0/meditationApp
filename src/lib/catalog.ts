/**
 * The sound catalog — one source of truth for the calm home screen and the
 * full browse library.
 */

import { Ionicons } from '@expo/vector-icons';

import type { SoundItem } from '@/components/SoundRow';
import type { AmbientSound } from '@/lib/types';

export interface Section {
  title: string;
  caption?: string;
  items: SoundItem[];
}

export const DURATIONS = [3, 5, 10, 15, 20, 30];

export const SECTIONS: Section[] = [
  {
    title: 'Ambient',
    items: [
      { key: 'none', label: 'Silence', icon: 'moon-outline', hint: 'No background sound' },
      { key: 'rain', label: 'Rain', icon: 'rainy-outline', hint: 'Steady rainfall' },
      { key: 'ocean', label: 'Ocean', icon: 'water-outline', hint: 'Slow ocean swells' },
      { key: 'forest', label: 'Forest', icon: 'leaf-outline', hint: 'Soft wind & forest' },
      { key: 'stream', label: 'Stream', icon: 'rainy-outline', hint: 'Babbling brook' },
      { key: 'fire', label: 'Campfire', icon: 'flame-outline', hint: 'Warm crackling fire' },
      { key: 'night', label: 'Night', icon: 'moon-outline', hint: 'Crickets under a quiet night' },
      { key: 'brown', label: 'Brown Noise', icon: 'cloudy-outline', hint: 'Deep, even hush' },
      { key: 'pink', label: 'Pink Noise', icon: 'cloud-outline', hint: 'Soft, balanced hush' },
      { key: 'white', label: 'White Noise', icon: 'cloud-outline', hint: 'Bright, even hush' },
      { key: 'purr', label: 'Cat Purr', icon: 'paw-outline', hint: "~25 Hz · a cat's calming purr" },
    ],
  },
  {
    title: 'Frequencies',
    caption:
      'Calm, Focus and Deep are binaural beats — use headphones for the full effect. A wellness aid, not medical treatment.',
    items: [
      { key: 'calm', label: 'Calm', icon: 'heart-outline', hint: '7.83 Hz · grounding (432 Hz tuned)' },
      { key: 'clarity', label: 'Clarity', icon: 'flash-outline', hint: '10 Hz · relaxed, clear presence' },
      { key: 'focus', label: 'Focus', icon: 'bulb-outline', hint: '14 Hz · alert concentration' },
      { key: 'dream', label: 'Dream', icon: 'cloud-outline', hint: '6 Hz · dreamy & meditative' },
      { key: 'deep', label: 'Deep', icon: 'bed-outline', hint: '3 Hz · deep rest & sleep' },
    ],
  },
  {
    title: 'Generative',
    caption:
      'Composed live and never the same twice. Like or rate a piece and it learns what you enjoy.',
    items: [
      { key: 'gen_rest', label: 'Rest', icon: 'sparkles-outline', hint: 'live generative ambient' },
      { key: 'gen_chill', label: 'Flow', icon: 'infinite-outline', hint: 'live generative groove' },
    ],
  },
  {
    title: 'Beats',
    caption: 'Instrumental grooves modeled on artists we love. Stereo — headphones recommended.',
    items: [
      { key: 'melodic', label: 'Melodic House', icon: 'sunny-outline', hint: '123 BPM · euphoric (RÜFÜS vibe)' },
      { key: 'deephouse', label: 'Deep House', icon: 'moon-outline', hint: '122 BPM · dark (ZHU vibe)' },
      { key: 'techno', label: 'Ambient Techno', icon: 'pulse-outline', hint: '122 BPM · hypnotic (Jon Hopkins vibe)' },
      { key: 'lofi', label: 'Lo-Fi', icon: 'cafe-outline', hint: '85 BPM · jazzy (Nujabes vibe)' },
      { key: 'liquid', label: 'Liquid', icon: 'water-outline', hint: '172 BPM · liquid drum & bass' },
      { key: 'chillstep', label: 'Chillstep', icon: 'rainy-outline', hint: '140 BPM · future garage (Burial)' },
      { key: 'downtempo', label: 'Downtempo', icon: 'partly-sunny-outline', hint: '98 BPM · dreamy (Tycho vibe)' },
    ],
  },
];

/** Flat lookup of every sound's label + icon. */
export const SOUND_INDEX: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {};
for (const s of SECTIONS) for (const it of s.items) SOUND_INDEX[it.key] = { label: it.label, icon: it.icon };

export function soundMeta(key: AmbientSound): { label: string; icon: keyof typeof Ionicons.glyphMap } {
  return SOUND_INDEX[key] ?? { label: 'Silence', icon: 'moon-outline' };
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// A gently-rotating "featured today" pick, stable within a day.
export const FEATURED: { key: AmbientSound; blurb: string }[] = [
  { key: 'gen_rest', blurb: 'A fresh, never-repeating ambient piece — composed live, just for now.' },
  { key: 'rain', blurb: 'Steady rainfall to soften the edges of a busy day.' },
  { key: 'calm', blurb: '7.83 Hz grounding tones, tuned to 432 Hz. Best with headphones.' },
  { key: 'fire', blurb: 'A warm, crackling fire for slow, cozy stillness.' },
  { key: 'melodic', blurb: 'Euphoric melodic house to lift a flat afternoon.' },
  { key: 'ocean', blurb: 'Slow ocean swells to pace a long, easy exhale.' },
  { key: 'gen_chill', blurb: 'A live generative groove that drifts and quietly evolves.' },
];

export function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

export function featuredToday() {
  const pick = FEATURED[dayOfYear() % FEATURED.length];
  return { ...pick, ...soundMeta(pick.key) };
}
