import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { SoundRow, type SoundItem } from '@/components/SoundRow';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppData } from '@/store/AppData';
import { radius, spacing } from '@/theme';
import { categoryStyle } from '@/theme/categories';

const DURATIONS = [3, 5, 10, 15, 20, 30];

interface Section {
  title: string;
  caption?: string;
  items: SoundItem[];
}

const SECTIONS: Section[] = [
  {
    title: 'Ambient',
    items: [
      { key: 'none', label: 'Silence', icon: 'moon-outline', hint: 'No background sound' },
      { key: 'rain', label: 'Rain', icon: 'rainy-outline', hint: 'Steady rainfall' },
      { key: 'ocean', label: 'Ocean', icon: 'water-outline', hint: 'Slow ocean swells' },
      { key: 'forest', label: 'Forest', icon: 'leaf-outline', hint: 'Soft wind & forest' },
      { key: 'purr', label: 'Cat Purr', icon: 'paw-outline', hint: "~25 Hz · a cat's calming purr" },
    ],
  },
  {
    title: 'Frequencies',
    caption:
      'Calm, Focus and Deep are binaural beats — use headphones for the full effect. A wellness aid, not medical treatment.',
    items: [
      { key: 'calm', label: 'Calm', icon: 'heart-outline', hint: '7.83 Hz · grounding (432 Hz tuned)' },
      { key: 'focus', label: 'Focus', icon: 'bulb-outline', hint: '14 Hz · alert concentration' },
      { key: 'deep', label: 'Deep', icon: 'bed-outline', hint: '3 Hz · deep rest & sleep' },
    ],
  },
  {
    title: 'Generative',
    caption:
      'Composed live and never the same twice. Like or rate a piece and it learns what you enjoy.',
    items: [
      { key: 'gen_rest', label: 'Rest', icon: 'sparkles-outline', hint: 'live generative ambient' },
      { key: 'gen_chill', label: 'Flow', icon: 'infinite-outline', hint: 'live generative groove' },
    ],
  },
  {
    title: 'Beats',
    caption: 'Instrumental grooves modeled on artists we love. Stereo — headphones recommended.',
    items: [
      { key: 'melodic', label: 'Melodic House', icon: 'sunny-outline', hint: '123 BPM · euphoric (RÜFÜS vibe)' },
      { key: 'deephouse', label: 'Deep House', icon: 'moon-outline', hint: '122 BPM · dark (ZHU vibe)' },
      { key: 'lofi', label: 'Lo-Fi', icon: 'cafe-outline', hint: '85 BPM · jazzy (Nujabes vibe)' },
      { key: 'liquid', label: 'Liquid', icon: 'water-outline', hint: '172 BPM · liquid drum & bass' },
      { key: 'chillstep', label: 'Chillstep', icon: 'rainy-outline', hint: '140 BPM · future garage (Burial)' },
      { key: 'downtempo', label: 'Downtempo', icon: 'partly-sunny-outline', hint: '98 BPM · dreamy (Tycho vibe)' },
    ],
  },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function MeditateScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { settings, stats, updateSettings } = useAppData();

  // The app's accent follows the selected sound's category.
  const active = categoryStyle(settings.ambient);

  const begin = () => {
    router.push({
      pathname: '/session',
      params: { duration: String(settings.durationMin), ambient: settings.ambient },
    });
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AppText variant="label" muted>
          {greeting().toUpperCase()}
        </AppText>
        <AppText variant="title">Take a moment to breathe</AppText>
      </View>

      <Card style={styles.streakCard}>
        <View style={styles.streakRow}>
          <Ionicons name="flame" size={28} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <AppText variant="heading">
              {stats.currentStreak > 0 ? `${stats.currentStreak}-day streak` : 'Start your streak'}
            </AppText>
            <AppText variant="caption" muted>
              {stats.meditatedToday
                ? "You've meditated today. Beautiful."
                : 'A few minutes is all it takes.'}
            </AppText>
          </View>
          {stats.meditatedToday && (
            <Ionicons name="checkmark-circle" size={24} color={colors.success} />
          )}
        </View>
      </Card>

      <View style={styles.section}>
        <AppText variant="label" muted>
          SESSION LENGTH
        </AppText>
        <View style={styles.chipWrap}>
          {DURATIONS.map((min) => {
            const selected = settings.durationMin === min;
            return (
              <Pressable
                key={min}
                onPress={() => updateSettings({ durationMin: min })}
                style={[
                  styles.durationChip,
                  {
                    backgroundColor: selected ? active.accent : colors.surface,
                    borderColor: selected ? active.accent : colors.border,
                  },
                ]}>
                <AppText variant="heading" color={selected ? '#FFFFFF' : colors.text}>
                  {min}
                </AppText>
                <AppText variant="caption" color={selected ? '#FFFFFF' : colors.textSecondary}>
                  min
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <AppText variant="heading">{section.title}</AppText>
          <View style={styles.list}>
            {section.items.map((item) => (
              <SoundRow
                key={item.key}
                item={item}
                selected={settings.ambient === item.key}
                onPress={() => updateSettings({ ambient: item.key })}
              />
            ))}
          </View>
          {section.caption ? (
            <AppText variant="caption" muted>
              {section.caption}
            </AppText>
          ) : null}
        </View>
      ))}

      <Pressable onPress={begin} accessibilityRole="button" style={styles.beginWrap}>
        <LinearGradient
          colors={active.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.beginBtn}>
          <Ionicons name="play" size={18} color="#FFFFFF" />
          <AppText variant="label" color="#FFFFFF" style={styles.beginLabel}>
            Begin session
          </AppText>
        </LinearGradient>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, marginTop: spacing.sm },
  streakCard: { paddingVertical: spacing.lg },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  section: { gap: spacing.md },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  durationChip: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { gap: spacing.sm },
  beginWrap: { marginTop: spacing.sm },
  beginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
  },
  beginLabel: { fontSize: 16, letterSpacing: 0.3 },
});
