import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { spacing } from '@/theme';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
}

/**
 * A content section. Rather than a boxed surface, sections now blend into the
 * background — just grouped, breathing content over the app's starry backdrop,
 * delineated by their (colourful) headers and spacing. Works in light and dark.
 */
export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
});
