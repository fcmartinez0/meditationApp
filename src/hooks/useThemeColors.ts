import { useSyncExternalStore } from 'react';
import { Appearance, Platform } from 'react-native';

import { getColors, type ColorScheme, type ThemeColors } from '@/theme';

/**
 * The color scheme as an external store. React Native's useColorScheme proved
 * unreliable on the static web export: the SSR pass bakes 'light', and because
 * the media query never *changes* after load, no change event fires to correct
 * the cached value — so a dark-mode visitor got the light navigation theme (a
 * glaring white tab bar over the night sky). Subscribing to the real source of
 * truth (matchMedia on web, Appearance natively) with useSyncExternalStore
 * gives every consumer the correct scheme on the very first client render.
 */
const scheme =
  Platform.OS === 'web'
    ? {
        subscribe(onChange: () => void): () => void {
          if (typeof window === 'undefined' || !window.matchMedia) return () => {};
          const mq = window.matchMedia('(prefers-color-scheme: dark)');
          mq.addEventListener('change', onChange);
          return () => mq.removeEventListener('change', onChange);
        },
        get(): ColorScheme {
          if (typeof window === 'undefined' || !window.matchMedia) return 'light';
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        },
        // Static rendering has no media query; 'light' matches the baked HTML.
        getServer(): ColorScheme {
          return 'light';
        },
      }
    : {
        subscribe(onChange: () => void): () => void {
          const sub = Appearance.addChangeListener(onChange);
          return () => sub.remove();
        },
        get(): ColorScheme {
          return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
        },
        getServer(): ColorScheme {
          return 'light';
        },
      };

/** The device color scheme, correct from the first client render on every platform. */
export function useAppColorScheme(): ColorScheme {
  return useSyncExternalStore(scheme.subscribe, scheme.get, scheme.getServer);
}

/** Returns the active color palette based on the device color scheme. */
export function useThemeColors(): ThemeColors {
  return getColors(useAppColorScheme());
}
