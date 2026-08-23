import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { GlassFill } from '@/components/GlassFill';
import { useThemeColors } from '@/hooks/useThemeColors';
import { radius, spacing } from '@/theme';
import { withAlpha } from '@/theme/categories';

/**
 * A translucent panel that floats over the animated starfield.
 *
 * Most sections in the app are deliberately borderless (see `Card`) — they read
 * as content breathing over the night sky. Progress is the one screen that puts
 * dense numerals and a chart on screen, and the drifting constellation lines cut
 * straight through them, so these sections get a real (if barely-there)
 * material to sit on: Liquid Glass on iOS 26, a translucent surface elsewhere.
 */
export function Surface({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const colors = useThemeColors();

  return (
    <View style={[styles.surface, { borderColor: withAlpha(colors.border, 0.9) }, style]}>
      <GlassFill fallback={withAlpha(colors.surface, 0.82)} radius={radius.lg} />
      {children}
    </View>
  );
}

/** A hairline rule used to separate blocks inside a Surface. */
export function Divider() {
  const colors = useThemeColors();
  return <View style={[styles.divider, { backgroundColor: withAlpha(colors.border, 0.8) }]} />;
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.md,
    overflow: 'hidden',
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
});
