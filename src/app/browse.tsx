import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Backdrop } from '@/components/Backdrop';
import { GlassFill } from '@/components/GlassFill';
import { SoundCard } from '@/components/SoundCard';
import type { SoundItem } from '@/components/SoundRow';
import { useThemeColors } from '@/hooks/useThemeColors';
import { SECTIONS } from '@/lib/catalog';
import type { AmbientSound } from '@/lib/types';
import { useAppData } from '@/store/AppData';
import { radius, spacing } from '@/theme';
import { CATEGORY_STYLES, type Category } from '@/theme/categories';

const ALL = 'All';

// Each library section maps to a category colour for its filter chip.
const SECTION_CAT: Record<string, Category> = {
  Generative: 'generative',
  Frequencies: 'frequency',
  Beats: 'beats',
  Ambient: 'ambient',
};

/** The full sound library — opened from the home. A sticky category filter lets
 *  you jump straight to a group instead of scrolling the whole list. */
export default function BrowseScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { settings, updateSettings } = useAppData();

  // Open on the group that holds the current sound, so you land where you are.
  const initial = useMemo(() => {
    const found = SECTIONS.find((s) => s.items.some((it) => it.key === settings.ambient));
    return found?.title ?? ALL;
  }, [settings.ambient]);
  const [filter, setFilter] = useState<string>(initial);

  const filters = useMemo(() => [ALL, ...SECTIONS.map((s) => s.title)], []);
  const shown = filter === ALL ? SECTIONS : SECTIONS.filter((s) => s.title === filter);

  // Flat lookup so a recent key resolves to its full card (label, icon, hint).
  const itemByKey = useMemo(() => {
    const map: Record<string, SoundItem> = {};
    for (const s of SECTIONS) for (const it of s.items) map[it.key] = it;
    return map;
  }, []);
  const recents = useMemo(
    () => settings.recents.map((k) => itemByKey[k]).filter(Boolean).slice(0, 6),
    [settings.recents, itemByKey],
  );

  // Pick a sound and return to the calm home, ready to begin.
  const choose = (key: AmbientSound) => {
    Haptics.selectionAsync().catch(() => {});
    updateSettings({ ambient: key });
    router.back();
  };

  const tapFilter = (f: string) => {
    if (f === filter) return;
    Haptics.selectionAsync().catch(() => {});
    setFilter(f);
  };

  return (
    <View style={[styles.fill, styles.clip, { backgroundColor: colors.background }]}>
      <Backdrop count={90} />
      <SafeAreaView style={styles.fill} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <AppText variant="title">Sounds</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => router.back()}
            hitSlop={16}
            style={styles.close}>
            <Ionicons name="close" size={26} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Recently used — pinned at the top so it's one tap away regardless of
            the active category filter. */}
        {recents.length > 0 && (
          <Animated.View entering={FadeIn.duration(360)}>
            <AppText variant="label" muted style={styles.recentLabel}>
              RECENT
            </AppText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentRow}>
              {recents.map((item) => (
                <View key={item.key} style={styles.recentCell}>
                  <SoundCard
                    item={item}
                    selected={settings.ambient === item.key}
                    onPress={() => choose(item.key)}
                  />
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* Sticky category filter — stays put while the list scrolls. */}
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            {filters.map((f) => {
              const active = f === filter;
              const accent = f === ALL ? colors.accent : CATEGORY_STYLES[SECTION_CAT[f]].accent;
              return (
                <Pressable
                  key={f}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Show ${f}`}
                  onPress={() => tapFilter(f)}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: active ? accent : 'transparent',
                      borderColor: active ? accent : colors.border,
                      transform: [{ scale: pressed ? 0.96 : 1 }],
                    },
                  ]}>
                  {!active && <GlassFill fallback={colors.surfaceMuted} radius={radius.pill} />}
                  <AppText
                    variant="label"
                    color={active ? '#FFFFFF' : colors.textSecondary}
                    style={styles.chipLabel}>
                    {f}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Re-keyed by filter so the grid fades in fresh on each switch. */}
        <ScrollView
          key={filter}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}>
          {shown.map((section, si) => (
            <Animated.View
              key={section.title}
              style={styles.section}
              entering={FadeInDown.duration(380).delay(si * 60)}>
              {filter === ALL && <AppText variant="heading">{section.title}</AppText>}
              {section.caption ? (
                <AppText variant="caption" muted>
                  {section.caption}
                </AppText>
              ) : null}
              <View style={styles.grid}>
                {section.items.map((item, ii) => (
                  <Animated.View
                    key={item.key}
                    style={styles.cell}
                    entering={FadeIn.duration(300).delay(si * 60 + ii * 25)}>
                    <SoundCard
                      item={item}
                      selected={settings.ambient === item.key}
                      onPress={() => choose(item.key)}
                    />
                  </Animated.View>
                ))}
              </View>
            </Animated.View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  clip: { overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  recentLabel: { paddingHorizontal: spacing.xl, marginTop: spacing.xs, marginBottom: spacing.sm },
  recentRow: { paddingHorizontal: spacing.xl, gap: spacing.md },
  recentCell: { width: 128 },
  chips: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, gap: spacing.sm },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipLabel: { letterSpacing: 0.3 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing.xxxl, gap: spacing.xl },
  section: { gap: spacing.sm },
  // Two-column vertical grid — no horizontal scrolling.
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  cell: { width: '47%' },
});
