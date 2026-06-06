import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { SoundRow, type SoundItem } from '@/components/SoundRow';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { AmbientSound } from '@/lib/types';
import { useAppData } from '@/store/AppData';
import { radius, spacing } from '@/theme';
import { categoryFor, categoryStyle } from '@/theme/categories';

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
      { key: 'stream', label: 'Stream', icon: 'rainy-outline', hint: 'Babbling brook' },
      { key: 'fire', label: 'Campfire', icon: 'flame-outline', hint: 'Warm crackling fire' },
      { key: 'night', label: 'Night', icon: 'moon-outline', hint: 'Crickets under a quiet night' },
      { key: 'brown', label: 'Brown Noise', icon: 'cloudy-outline', hint: 'Deep, even hush' },
      { key: 'pink', label: 'Pink Noise', icon: 'cloud-outline', hint: 'Soft, balanced hush' },
      { key: 'white', label: 'White Noise', icon: 'cloud-outline', hint: 'Bright, even hush' },
      { key: 'purr', label: 'Cat Purr', icon: 'paw-outline', hint: "~25 Hz · a cat's calming purr" },
    ],
  },
  {
    title: 'Frequencies',
    caption:
      'Calm, Focus and Deep are binaural beats — use headphones for the full effect. A wellness aid, not medical treatment.',
    items: [
      { key: 'calm', label: 'Calm', icon: 'heart-outline', hint: '7.83 Hz · grounding (432 Hz tuned)' },
      { key: 'clarity', label: 'Clarity', icon: 'flash-outline', hint: '10 Hz · relaxed, clear presence' },
      { key: 'focus', label: 'Focus', icon: 'bulb-outline', hint: '14 Hz · alert concentration' },
      { key: 'dream', label: 'Dream', icon: 'cloud-outline', hint: '6 Hz · dreamy & meditative' },
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
      { key: 'techno', label: 'Ambient Techno', icon: 'pulse-outline', hint: '122 BPM · hypnotic (Jon Hopkins vibe)' },
      { key: 'lofi', label: 'Lo-Fi', icon: 'cafe-outline', hint: '85 BPM · jazzy (Nujabes vibe)' },
      { key: 'liquid', label: 'Liquid', icon: 'water-outline', hint: '172 BPM · liquid drum & bass' },
      { key: 'chillstep', label: 'Chillstep', icon: 'rainy-outline', hint: '140 BPM · future garage (Burial)' },
      { key: 'downtempo', label: 'Downtempo', icon: 'partly-sunny-outline', hint: '98 BPM · dreamy (Tycho vibe)' },
    ],
  },
];

/** Flat lookup of every sound's label + icon, for the sticky "ready" bar. */
const SOUND_INDEX: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {};
for (const s of SECTIONS) for (const it of s.items) SOUND_INDEX[it.key] = { label: it.label, icon: it.icon };

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
  const cat = categoryFor(settings.ambient);
  const headphonesHelp = cat === 'frequency' || cat === 'generative' || settings.ambient === 'purr';

  const tap = () => Haptics.selectionAsync().catch(() => {});

  const selectSound = (key: AmbientSound) => {
    tap();
    updateSettings({ ambient: key });
  };

  const selectDuration = (min: number) => {
    tap();
    updateSettings({ durationMin: min });
  };

  const begin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    router.push({
      pathname: '/session',
      params: { duration: String(settings.durationMin), ambient: settings.ambient },
    });
  };

  const sel = SOUND_INDEX[settings.ambient] ?? { label: 'Silence', icon: 'moon-outline' as const };

  // Always-visible "ready" bar — pick length and start without scrolling.
  const readyBar = (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      <View style={styles.durationRow}>
        {DURATIONS.map((min) => {
          const selected = settings.durationMin === min;
          return (
            <Pressable
              key={min}
              onPress={() => selectDuration(min)}
              accessibilityLabel={`${min} minutes`}
              style={[
                styles.durationPill,
                { backgroundColor: selected ? active.accent : colors.surfaceMuted },
              ]}>
              <AppText variant="caption" color={selected ? '#FFFFFF' : colors.textSecondary}>
                {min}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.beginRow}>
        <LinearGradient
          colors={active.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.barArt}>
          <Ionicons name={sel.icon} size={20} color="#FFFFFF" />
        </LinearGradient>
        <View style={styles.barText}>
          <AppText variant="body" numberOfLines={1}>
            {sel.label}
          </AppText>
          <View style={styles.barSub}>
            <AppText variant="caption" muted>
              {settings.durationMin} min
            </AppText>
            {headphonesHelp && (
              <Ionicons name="headset-outline" size={12} color={colors.textSecondary} />
            )}
          </View>
        </View>
        <Pressable onPress={begin} accessibilityRole="button" accessibilityLabel="Begin session">
          <LinearGradient
            colors={active.colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.barBegin}>
            <Ionicons name="play" size={18} color="#FFFFFF" />
            <AppText variant="label" color="#FFFFFF" style={styles.beginLabel}>
              Begin
            </AppText>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Screen scroll footer={readyBar}>
      <View style={styles.header}>
        <AppText variant="label" muted>
          {greeting().toUpperCase()}
        </AppText>
        <AppText variant="title">Take a moment to breathe</AppText>
      </View>

      <View style={styles.streakRow}>
        <Ionicons name="flame" size={26} color={colors.warning} />
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

      <Pressable
        onPress={() => { tap(); router.push('/breathe'); }}
        accessibilityRole="button"
        style={({ pressed }) => [styles.breatheRow, { opacity: pressed ? 0.6 : 1 }]}>
        <Ionicons name="ellipse-outline" size={24} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <AppText variant="heading">Breathing exercises</AppText>
          <AppText variant="caption" muted>
            Box · 4-7-8 · Calm · Coherent
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </Pressable>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <AppText variant="heading">{section.title}</AppText>
          <View style={styles.list}>
            {section.items.map((item) => (
              <SoundRow
                key={item.key}
                item={item}
                selected={settings.ambient === item.key}
                onPress={() => selectSound(item.key)}
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

    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, marginTop: spacing.sm },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  breatheRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
  section: { gap: spacing.sm },
  list: { gap: spacing.xs },
  bar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  durationRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  durationPill: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  beginRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  barArt: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barText: { flex: 1, gap: 2 },
  barSub: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  barBegin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  beginLabel: { fontSize: 16, letterSpacing: 0.3 },
});
