import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useThemeColors } from '@/hooks/useThemeColors';
import { radius } from '@/theme';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
}

/** A rounded surface panel used to group related content. */
export function Card({ children, style }: CardProps) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // Flat and quiet: a single hairline border, no drop shadow, gentler corners
    // and a touch less padding — lets content and whitespace carry the screen.
    borderRadius: radius.md,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
