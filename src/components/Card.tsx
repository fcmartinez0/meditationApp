import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useThemeColors } from '@/hooks/useThemeColors';
import { radius } from '@/theme';
import { withAlpha } from '@/theme/categories';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
}

/**
 * A rounded surface panel grouping related content. On iOS 26 it uses Apple's
 * Liquid Glass material with a crisp hairline edge; elsewhere it falls back to a
 * flat surface with a hairline border.
 */
export function Card({ children, style }: CardProps) {
  const colors = useThemeColors();

  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle="regular"
        style={[styles.card, styles.glass, { borderColor: withAlpha('#FFFFFF', 0.18) }, style]}>
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // Glass needs its corners clipped and carries its own translucent fill.
  glass: {
    overflow: 'hidden',
  },
});
