/**
 * Category color system for the sound picker. Each sound belongs to a category,
 * and the category supplies a simple two-stop gradient (used as "album art") and
 * an accent color that the screen adopts when a sound from it is selected.
 */

import type { AmbientSound } from '@/lib/types';

export type Category = 'silence' | 'ambient' | 'frequency' | 'generative' | 'beats';

export interface CategoryStyle {
  label: string;
  /** Gradient stops for the art swatch / Begin button. */
  colors: readonly [string, string];
  /** Single accent used for highlights and the active UI tint. */
  accent: string;
}

export const CATEGORY_STYLES: Record<Category, CategoryStyle> = {
  silence: { label: 'Silence', colors: ['#94A3B8', '#64748B'], accent: '#64748B' },
  ambient: { label: 'Ambient', colors: ['#2DD4BF', '#0EA5E9'], accent: '#0EA5E9' },
  frequency: { label: 'Frequencies', colors: ['#8B9DF0', '#6366F1'], accent: '#6366F1' },
  generative: { label: 'Generative', colors: ['#C084FC', '#7C3AED'], accent: '#8B5CF6' },
  beats: { label: 'Beats', colors: ['#FBBF24', '#FB7185'], accent: '#F472B6' },
};

const CATEGORY_OF: Record<AmbientSound, Category> = {
  none: 'silence',
  rain: 'ambient',
  ocean: 'ambient',
  forest: 'ambient',
  stream: 'ambient',
  fire: 'ambient',
  night: 'ambient',
  brown: 'ambient',
  white: 'ambient',
  pink: 'ambient',
  purr: 'ambient',
  calm: 'frequency',
  focus: 'frequency',
  deep: 'frequency',
  dream: 'frequency',
  clarity: 'frequency',
  gen_rest: 'generative',
  gen_chill: 'generative',
  lofi: 'beats',
  liquid: 'beats',
  chillstep: 'beats',
  downtempo: 'beats',
  deephouse: 'beats',
  melodic: 'beats',
  techno: 'beats',
  triphop: 'beats',
  synthwave: 'beats',
};

export function categoryFor(sound: AmbientSound): Category {
  return CATEGORY_OF[sound] ?? 'silence';
}

export function categoryStyle(sound: AmbientSound): CategoryStyle {
  return CATEGORY_STYLES[categoryFor(sound)];
}

/** Hex (#rrggbb) + alpha (0..1) -> rgba() string. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
