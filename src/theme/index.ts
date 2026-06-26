/**
 * Calming design tokens for the focus / sleep / rest app.
 *
 * A single source of truth for colors (light + dark), spacing, radii,
 * typography and the gradients used across screens.
 */

import { Platform } from 'react-native';

export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  textOnAccent: string;
  accent: string;
  accentSoft: string;
  success: string;
  warning: string;
  border: string;
  /** Background gradient stops (at least two). */
  gradient: readonly [string, string, ...string[]];
  auroraStart: string;
  auroraEnd: string;
}

const palette: Record<ColorScheme, ThemeColors> = {
  light: {
    background: '#EEF1FB',
    surface: '#FFFFFF',
    surfaceMuted: '#E6EAF7',
    text: '#1C2233',
    textSecondary: '#5B6275',
    textOnAccent: '#FFFFFF',
    accent: '#5B6CF0',
    accentSoft: '#8B9DF0',
    success: '#3CB99A',
    warning: '#E8A33D',
    border: '#D8DEF0',
    // Background gradient (calm daytime sky).
    gradient: ['#E9ECFB', '#DCE6FA', '#D6F0F0'] as const,
    // Decorative gradients.
    auroraStart: '#8B9DF0',
    auroraEnd: '#6FD6C7',
  },
  dark: {
    background: '#0E1020',
    surface: '#191C32',
    surfaceMuted: '#232745',
    text: '#F2F4FF',
    textSecondary: '#A6ABC8',
    textOnAccent: '#0E1020',
    accent: '#8B9DF0',
    accentSoft: '#6F7BD6',
    success: '#5BD3B4',
    warning: '#F0B860',
    border: '#2C3056',
    // Background gradient (deep night sky).
    gradient: ['#0E1020', '#161A33', '#1B2140'] as const,
    auroraStart: '#6F7BD6',
    auroraEnd: '#4FB6A8',
  },
};

export function getColors(scheme: ColorScheme | null | undefined): ThemeColors {
  return scheme === 'dark' ? palette.dark : palette.light;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 26,
  xxl: 34,
  display: 56,
} as const;

export const fonts = Platform.select({
  ios: { rounded: 'ui-rounded', sans: 'system-ui' },
  default: { rounded: 'normal', sans: 'normal' },
  web: { rounded: 'system-ui', sans: 'system-ui' },
})!;
