import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemeColors } from '@/hooks/useThemeColors';
import { spacing } from '@/theme';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /** Remove default horizontal padding (e.g. full-bleed session screen). */
  bare?: boolean;
  contentStyle?: ViewStyle;
  /** A fixed element pinned below the scroll area (e.g. a sticky action bar). */
  footer?: ReactNode;
}

/** Full-screen calming gradient background with a safe-area content area. */
export function Screen({ children, scroll = false, bare = false, contentStyle, footer }: ScreenProps) {
  const colors = useThemeColors();
  const padding = bare ? undefined : styles.padded;

  return (
    <LinearGradient colors={colors.gradient} style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top', 'left', 'right']}>
        {scroll ? (
          <ScrollView
            style={styles.fill}
            contentContainerStyle={[styles.scrollContent, padding, contentStyle]}
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.fill, padding, contentStyle]}>{children}</View>
        )}
        {footer}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  padded: { paddingHorizontal: spacing.xl },
  scrollContent: { paddingBottom: spacing.xxxl, gap: spacing.lg },
});
