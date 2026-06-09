import { useColorScheme } from 'react-native';

import { getColors, type ThemeColors } from '@/theme';

/** Returns the active color palette based on the device color scheme. */
export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme();
  return getColors(scheme === 'dark' ? 'dark' : 'light');
}
