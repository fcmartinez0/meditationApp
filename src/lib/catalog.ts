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
    title: 'Generative',
    caption:
      'Composed live, never the same twice — with a binaural beat woven in. Headphones recommended; it learns what you like.',
    items: [
      { key: 'gen_rest', label: 'Rest', icon: 'sparkles-outline', hint: 'live ambient · 3–6 Hz deep rest' },
      { key: 'gen_chill', label: 'Flow', icon: 'infinite-outline', hint: 'live groove · 10 Hz alpha' },
    ],
  },
  {
    title: 'Frequencies',
    caption:
      'Binaural beats — use headphones for the full effect. A wellness aid, not medical treatment.',
    items: [
      { key: 'calm', label: 'Calm', icon: 'heart-outline', hint: '7.83 Hz · grounding (432 Hz tuned)' },
      { key: 'clarity', label: 'Clarity', icon: 'flash-outline', hint: '10 Hz · relaxed, clear presence' },
      { key: 'focus', label: 'Focus', icon: 'bulb-outline', hint: '14 Hz · alert concentration' },
      { key: 'dream', label: 'Dream', icon: 'cloud-outline', hint: '6 Hz · dreamy & meditative' },
      { key: 'deep', label: 'Deep', icon: 'bed-outline', hint: '3 Hz · deep rest & sleep' },
    ],
  },
  {
    title: 'Beats',
    caption: 'Instrumental grooves to focus or unwind. Stereo — headphones recommended.',
    items: [
      { key: 'melodic', label: 'Melodic House', icon: 'sunny-outline', hint: '123 BPM · warm & euphoric' },
      { key: 'deephouse', label: 'Deep House', icon: 'moon-outline', hint: '122 BPM · dark & sultry' },
      { key: 'techno', label: 'Ambient Techno', icon: 'pulse-outline', hint: '122 BPM · hypnotic & rolling' },
      { key: 'lofi', label: 'Lo-Fi', icon: 'cafe-outline', hint: '85 BPM · jazzy & dusty' },
      { key: 'liquid', label: 'Liquid', icon: 'water-outline', hint: '172 BPM · lush drum & bass' },
      { key: 'chillstep', label: 'Chillstep', icon: 'rainy-outline', hint: '140 BPM · smoky future garage' },
      { key: 'downtempo', label: 'Downtempo', icon: 'partly-sunny-outline', hint: '98 BPM · dreamy & melodic' },
      { key: 'triphop', label: 'Trip-Hop', icon: 'cloudy-night-outline', hint: '80 BPM · dark & cinematic' },
      { key: 'synthwave', label: 'Synthwave', icon: 'planet-outline', hint: '84 BPM · dreamy retro arps' },
    ],
  },
  {
    title: 'Ambient',
    caption: 'Background textures to settle into.',
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
