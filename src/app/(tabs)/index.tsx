import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { BreathingOrb } from '@/components/BreathingOrb';
import { DurationPicker } from '@/components/DurationPicker';
import { GlassFill } from '@/components/GlassFill';
import { Screen } from '@/components/Screen';
import { useThemeColors } from '@/hooks/useThemeColors';
import { greeting, soundMeta } from '@/lib/catalog';
import { GENERATIVE_SUPPORTED, prefetchGenerative } from '@/lib/generative';
import type { AmbientSound } from '@/lib/types';
import { isGenerative, sectionFor } from '@/lib/types';
import { categoryStyle } from '@/theme/categories';
import { useAppData } from '@/store/AppData';
import { radius, spacing } from '@/theme';

/**
 * Calm-first home: a single breathing orb and one obvious action. The full
 * sound library lives one tap away behind "Browse", so opening the app feels
 * like arriving somewhere quiet — not facing a wall of choices.
 */
export default function HomeScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { settings, stats, updateSettings, addRecent } = useAppData();

  // The whole screen's accent follows the chosen sound's category.
  const cat = categoryStyle(settings.ambient);
  const sel = soundMeta(settings.ambient);
  // Generative pieces play open-ended, so there's no session length to set.
  const generative = isGenerative(settings.ambient);

  const [pickerOpen, setPickerOpen] = useState(false);

  // Pre-render the next generative piece in the background while the user is
  // here, so starting a session is instant instead of stalling on the
  // "Composing…" screen. Runs on focus (not just mount) so the *next* session
  // is also prepared after returning from one. The render runs off the JS
  // thread and is a no-op on web, so this never blocks the home screen.
  useFocusEffect(
    useCallback(() => {
      if (GENERATIVE_SUPPORTED && isGenerative(settings.ambient)) {
        void prefetchGenerative(sectionFor(settings.ambient));
      }
    }, [settings.ambient]),
  );

  const tap = () => Haptics.selectionAsync().catch(() => {});

  const begin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    addRecent(settings.ambient);
    router.push({
      pathname: '/session',
      params: { duration: String(settings.durationMin), ambient: settings.ambient },
    });
  };

  const openBrowse = () => {
    tap();
    router.push('/browse');
  };

  const openPicker = () => {
    tap();
    setPickerOpen(true);
  };

  return (
    <Screen>
      <View style={styles.root}>
        <Animated.View style={styles.header} entering={FadeInDown.duration(600)}>
          <AppText variant="label" color={colors.accent}>
            {greeting().toUpperCase()}
          </AppText>
          <AppText variant="title">Take a breath</AppText>
          {stats.currentStreak > 0 && (
            <AppText variant="caption" muted style={styles.streak}>
              {stats.currentStreak}-day streak
            </AppText>
          )}
        </Animated.View>

        <View style={styles.center}>
          <Animated.View entering={FadeIn.duration(1100)}>
            <BreathingOrb still core={cat.accent} halo={cat.colors[0]} colors={cat.colors}>
              <Ionicons name={sel.icon} size={44} color="#FFFFFF" />
            </BreathingOrb>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(700).delay(250)}>
            <Pressable
              onPress={begin}
              accessibilityRole="button"
              accessibilityLabel={`Begin ${sel.label} session`}
              style={({ pressed }) => [styles.beginWrap, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
              <LinearGradient
                colors={cat.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.begin}>
                <AppText variant="label" color="#FFFFFF" style={styles.beginLabel}>
                  Begin
                </AppText>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>

        <Animated.View style={styles.controls} entering={FadeInUp.duration(700).delay(400)}>
          <View style={styles.chipsRow}>
            <Pressable
              onPress={openBrowse}
              accessibilityRole="button"
              accessibilityLabel={`Sound: ${sel.label}`}
              style={({ pressed }) => [styles.chip, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
              <GlassFill fallback={colors.surfaceMuted} radius={radius.pill} />
              <Ionicons name={sel.icon} size={18} color={cat.accent} />
              <AppText variant="body" numberOfLines={1}>
                {sel.label}
              </AppText>
            </Pressable>

            {generative ? (
              <View accessibilityLabel="Length: open-ended" style={styles.chip}>
                <GlassFill fallback={colors.surfaceMuted} radius={radius.pill} />
                <Ionicons name="infinite" size={18} color={cat.accent} />
                <AppText variant="body">Open-ended</AppText>
              </View>
            ) : (
              <Pressable
                onPress={openPicker}
                accessibilityRole="button"
                accessibilityLabel={`Length: ${settings.durationMin} minutes`}
                style={({ pressed }) => [styles.chip, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
                <GlassFill fallback={colors.surfaceMuted} radius={radius.pill} />
                <Ionicons name="timer-outline" size={18} color={cat.accent} />
                <AppText variant="body">{settings.durationMin} min</AppText>
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={() => {
              tap();
              router.push('/breathe');
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.breatheLink, { opacity: pressed ? 0.55 : 1 }]}>
            <AppText variant="label" muted>
              Breathing exercises
            </AppText>
          </Pressable>
        </Animated.View>
      </View>

      <DurationPicker
        visible={pickerOpen}
        value={settings.durationMin}
        onChange={(n) => updateSettings({ durationMin: n })}
        onClose={() => setPickerOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { gap: spacing.xs, marginTop: spacing.sm, alignItems: 'center' },
  streak: { marginTop: spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  beginWrap: { marginTop: spacing.sm },
  begin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.pill,
  },
  beginLabel: { fontSize: 17, letterSpacing: 0.3 },
  controls: { gap: spacing.md, paddingBottom: spacing.md, alignItems: 'center' },
  chipsRow: { flexDirection: 'row', gap: spacing.md, alignSelf: 'stretch' },
  chip: {
    flex: 1,
    minHeight: 52, // ≥ 44pt HIG touch target
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  breatheLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44, // ≥ 44pt HIG touch target
    paddingHorizontal: spacing.lg,
  },
});
