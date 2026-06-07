import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BreathingOrb } from '@/components/BreathingOrb';
import { Screen } from '@/components/Screen';
import { useThemeColors } from '@/hooks/useThemeColors';
import { DURATIONS, greeting, soundMeta } from '@/lib/catalog';
import type { AmbientSound } from '@/lib/types';
import { categoryFor, categoryStyle } from '@/theme/categories';
import { useAppData } from '@/store/AppData';
import { radius, spacing } from '@/theme';

/**
 * Calm-first home: a single breathing orb and one obvious action. The full
 * sound library lives one tap away behind "Browse", so opening the app feels
 * like arriving somewhere quiet — not facing a wall of choices.
 */
export default function MeditateScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { settings, stats, updateSettings } = useAppData();

  // The whole screen's accent follows the chosen sound's category.
  const cat = categoryStyle(settings.ambient);
  const kind = categoryFor(settings.ambient);
  const headphones = kind === 'frequency' || kind === 'generative' || settings.ambient === 'purr';
  const sel = soundMeta(settings.ambient);

  const tap = () => Haptics.selectionAsync().catch(() => {});

  const begin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    router.push({
      pathname: '/session',
      params: { duration: String(settings.durationMin), ambient: settings.ambient },
    });
  };

  const selectDuration = (min: number) => {
    tap();
    updateSettings({ durationMin: min });
  };

  const openBrowse = () => {
    tap();
    router.push('/browse');
  };

  return (
    <Screen>
      <View style={styles.root}>
        <View style={styles.header}>
          <AppText variant="label" muted>
            {greeting().toUpperCase()}
          </AppText>
          <AppText variant="title">Take a breath</AppText>
          {stats.currentStreak > 0 && (
            <View style={styles.streak}>
              <Ionicons name="flame" size={15} color={colors.warning} />
              <AppText variant="caption" muted>
                {stats.currentStreak}-day streak{stats.meditatedToday ? ' · today ✓' : ''}
              </AppText>
            </View>
          )}
        </View>

        <View style={styles.center}>
          <BreathingOrb active core={cat.accent} halo={cat.colors[0]}>
            <Ionicons name={sel.icon} size={44} color="#FFFFFF" />
          </BreathingOrb>

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
              <Ionicons name="play" size={20} color="#FFFFFF" />
              <AppText variant="label" color="#FFFFFF" style={styles.beginLabel}>
                Begin
              </AppText>
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={openBrowse}
            accessibilityRole="button"
            accessibilityLabel="Change sound"
            style={({ pressed }) => [styles.pick, { opacity: pressed ? 0.6 : 1 }]}>
            <AppText variant="body" color={cat.accent}>
              {sel.label}
            </AppText>
            <AppText variant="body" muted>
              · {settings.durationMin} min
            </AppText>
            {headphones && <Ionicons name="headset-outline" size={14} color={colors.textSecondary} />}
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.controls}>
          <View style={styles.durationRow}>
            {DURATIONS.map((min) => {
              const selected = settings.durationMin === min;
              return (
                <Pressable
                  key={min}
                  onPress={() => selectDuration(min)}
                  accessibilityLabel={`${min} minutes`}
                  style={({ pressed }) => [
                    styles.durationPill,
                    {
                      backgroundColor: selected ? cat.accent : colors.surfaceMuted,
                      transform: [{ scale: pressed ? 0.94 : 1 }],
                    },
                  ]}>
                  <AppText variant="caption" color={selected ? '#FFFFFF' : colors.textSecondary}>
                    {min}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.links}>
            <LinkPill icon="albums-outline" label="Browse sounds" onPress={openBrowse} />
            <LinkPill
              icon="ellipse-outline"
              label="Breathe"
              onPress={() => {
                tap();
                router.push('/breathe');
              }}
            />
          </View>
        </View>
      </View>
    </Screen>
  );
}

function LinkPill({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.linkPill,
        { borderColor: colors.border, opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}>
      <Ionicons name={icon} size={16} color={colors.textSecondary} />
      <AppText variant="caption" muted>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { gap: spacing.xs, marginTop: spacing.sm, alignItems: 'center' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
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
  pick: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  controls: { gap: spacing.lg, paddingBottom: spacing.md },
  durationRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  durationPill: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  links: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
  linkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
