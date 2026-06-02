import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { AmbientSound } from '@/lib/types';
import { useAppData } from '@/store/AppData';
import { radius, spacing } from '@/theme';

const DURATIONS = [3, 5, 10, 15, 20, 30];

const AMBIENTS: { key: AmbientSound; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'none', label: 'Silence', icon: 'moon-outline' },
  { key: 'rain', label: 'Rain', icon: 'rainy-outline' },
  { key: 'ocean', label: 'Ocean', icon: 'water-outline' },
  { key: 'forest', label: 'Forest', icon: 'leaf-outline' },
];

const MUSIC: {
  key: AmbientSound;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  hint: string;
}[] = [
  { key: 'calm', label: 'Calm', icon: 'heart-outline', hint: '7.83 Hz · grounding (432 Hz tuned)' },
  { key: 'focus', label: 'Focus', icon: 'bulb-outline', hint: '14 Hz · alert concentration' },
  { key: 'deep', label: 'Deep', icon: 'bed-outline', hint: '3 Hz · deep rest & sleep' },
];

const BEATS: {
  key: AmbientSound;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  hint: string;
}[] = [
  { key: 'lofi', label: 'Lo-Fi', icon: 'cafe-outline', hint: '85 BPM · jazzy lo-fi (Nujabes vibe)' },
  { key: 'liquid', label: 'Liquid', icon: 'water-outline', hint: '172 BPM · liquid drum & bass (LTJ Bukem)' },
  { key: 'chillstep', label: 'Chillstep', icon: 'rainy-outline', hint: '140 BPM · future garage (Burial vibe)' },
  { key: 'downtempo', label: 'Downtempo', icon: 'partly-sunny-outline', hint: '98 BPM · dreamy arps (Tycho vibe)' },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

type Track = { key: AmbientSound; label: string; icon: keyof typeof Ionicons.glyphMap; hint: string };

/** A selectable list of music/beat tracks, each with a label and a description. */
function TrackList({ items }: { items: Track[] }) {
  const colors = useThemeColors();
  const { settings, updateSettings } = useAppData();
  return (
    <View style={styles.musicList}>
      {items.map((m) => {
        const selected = settings.ambient === m.key;
        return (
          <Pressable
            key={m.key}
            onPress={() => updateSettings({ ambient: m.key })}
            style={[
              styles.musicRow,
              {
                backgroundColor: selected ? colors.accent : colors.surface,
                borderColor: selected ? colors.accent : colors.border,
              },
            ]}>
            <Ionicons name={m.icon} size={22} color={selected ? colors.textOnAccent : colors.accent} />
            <View style={{ flex: 1 }}>
              <AppText variant="body" color={selected ? colors.textOnAccent : colors.text}>
                {m.label}
              </AppText>
              <AppText variant="caption" color={selected ? colors.textOnAccent : colors.textSecondary}>
                {m.hint}
              </AppText>
            </View>
            {selected && <Ionicons name="checkmark" size={20} color={colors.textOnAccent} />}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function MeditateScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { settings, stats, updateSettings } = useAppData();

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
              {stats.currentStreak > 0
                ? `${stats.currentStreak}-day streak`
                : 'Start your streak'}
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
                    backgroundColor: selected ? colors.accent : colors.surface,
                    borderColor: selected ? colors.accent : colors.border,
                  },
                ]}>
                <AppText
                  variant="heading"
                  color={selected ? colors.textOnAccent : colors.text}>
                  {min}
                </AppText>
                <AppText
                  variant="caption"
                  color={selected ? colors.textOnAccent : colors.textSecondary}>
                  min
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="label" muted>
          AMBIENT SOUND
        </AppText>
        <View style={styles.chipWrap}>
          {AMBIENTS.map((a) => {
            const selected = settings.ambient === a.key;
            return (
              <Pressable
                key={a.key}
                onPress={() => updateSettings({ ambient: a.key })}
                style={[
                  styles.ambientChip,
                  {
                    backgroundColor: selected ? colors.accent : colors.surface,
                    borderColor: selected ? colors.accent : colors.border,
                  },
                ]}>
                <Ionicons
                  name={a.icon}
                  size={20}
                  color={selected ? colors.textOnAccent : colors.textSecondary}
                />
                <AppText
                  variant="caption"
                  color={selected ? colors.textOnAccent : colors.text}>
                  {a.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="label" muted>
          FOCUS & CALM MUSIC
        </AppText>
        <TrackList items={MUSIC} />
        <AppText variant="caption" muted>
          Calm, Focus and Deep are binaural beats — use headphones for the full effect. A wellness
          aid, not medical treatment.
        </AppText>
      </View>

      <View style={styles.section}>
        <AppText variant="label" muted>
          BEATS
        </AppText>
        <TrackList items={BEATS} />
        <AppText variant="caption" muted>
          Instrumental grooves modeled on artists we love. Stereo — headphones recommended.
        </AppText>
      </View>

      <Button label="Begin session" onPress={begin} style={styles.begin} />
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
  ambientChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  musicList: { gap: spacing.md },
  musicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  begin: { marginTop: spacing.sm },
});
