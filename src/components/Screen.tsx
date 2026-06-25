import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GeometricFlair } from '@/components/GeometricFlair';
import { StarField } from '@/components/StarField';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppData } from '@/store/AppData';
import { spacing } from '@/theme';
import { withAlpha } from '@/theme/categories';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /** Remove default horizontal padding (e.g. full-bleed session screen). */
  bare?: boolean;
  contentStyle?: ViewStyle;
  /** A fixed element pinned below the scroll area (e.g. a sticky action bar). */
  footer?: ReactNode;
}

/**
 * Full-screen calm background with a safe-area content area. Uses a flat theme
 * colour by default, or the user's chosen background image (with a scrim for
 * legibility) when one is set in Settings.
 */
export function Screen({ children, scroll = false, bare = false, contentStyle, footer }: ScreenProps) {
  const colors = useThemeColors();
  const { settings } = useAppData();
  const bg = settings.backgroundUri;
  const padding = bare ? undefined : styles.padded;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {bg ? (
        <>
          <Image source={{ uri: bg }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
          {/* Scrim so text/cards stay legible over any photo. */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(colors.background, 0.55) }]} />
        </>
      ) : null}
      {/* Faint rotating geometric watermark, echoing the session orb. */}
      {/* Ambient backdrop: a faint stardust field plus a geometric mandala, so
          screens never read as empty. */}
      <StarField color={colors.text} count={bg ? 70 : 130} />
      <GeometricFlair color={colors.accent} size={520} opacity={bg ? 0.18 : 0.32} style={styles.flair} />
      <GeometricFlair color={colors.accent} size={300} opacity={bg ? 0.12 : 0.2} style={styles.flairAlt} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Two mandalas bleeding off opposite corners so the backdrop feels balanced.
  flair: { position: 'absolute', top: -180, right: -180 },
  flairAlt: { position: 'absolute', bottom: -110, left: -120 },
  padded: { paddingHorizontal: spacing.xl },
  scrollContent: { paddingBottom: spacing.xxxl, gap: spacing.lg },
});
