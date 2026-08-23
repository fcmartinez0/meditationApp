import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, useReducedMotion } from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { RecentSessions } from '@/components/RecentSessions';
import { Screen } from '@/components/Screen';
import { Divider, Surface } from '@/components/Surface';
import { WeekChart } from '@/components/WeekChart';
import { spokenMinutes } from '@/components/progressFormat';
import { useThemeColors } from '@/hooks/useThemeColors';
import { todayWeekIndex } from '@/lib/stats';
import { loadSessions } from '@/lib/storage';
import type { SessionRecord } from '@/lib/types';
import { useAppData } from '@/store/AppData';
import { radius, spacing } from '@/theme';
import { withAlpha } from '@/theme/categories';

/** Session counts worth pausing on. The last one is the end of the ladder. */
const MILESTONES = [1, 3, 7, 14, 30, 60, 100, 200, 365];

/** A quiet "how far to the next marker" line, sat under the stat tiles. */
function Milestone({ totalSessions }: { totalSessions: number }) {
  const colors = useThemeColors();
  const next = MILESTONES.find((m) => m > totalSessions);
  // Measured from zero rather than from the previous marker, so the bar always
  // matches the "12 of 14" the row actually says.
  const progress = next ? totalSessions / next : 1;
  const value = next ? `${totalSessions} of ${next}` : `${totalSessions} sessions`;

  return (
    <View
      style={styles.milestone}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={
        next
          ? `Next milestone: ${totalSessions} of ${next} sessions`
          : `Every milestone reached: ${totalSessions} sessions`
      }
      accessibilityValue={{ min: 0, max: next ?? totalSessions, now: totalSessions }}>
      <View style={styles.milestoneRow}>
        <AppText variant="label" muted>
          {next ? 'NEXT MILESTONE' : 'ALL MILESTONES REACHED'}
        </AppText>
        <AppText variant="caption" muted style={styles.tabular}>
          {value}
        </AppText>
      </View>
      <View style={[styles.track, { backgroundColor: withAlpha(colors.textSecondary, 0.2) }]}>
        <View
          style={[
            styles.trackFill,
            { backgroundColor: colors.accent, width: `${Math.max(0, Math.min(1, progress)) * 100}%` },
          ]}
        />
      </View>
    </View>
  );
}

export default function ProgressScreen() {
  const colors = useThemeColors();
  const { stats } = useAppData();
  const reduced = useReducedMotion();
  const today = todayWeekIndex();

  // The store exposes derived stats but not the raw history, so the recent list
  // reads it straight from storage — refreshed on focus, the same way Settings
  // refreshes its learned-taste summaries. Sessions are only ever recorded on
  // another screen, so coming back here is exactly when this can be stale.
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadSessions().then((list) => {
        if (active) setSessions(list);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const hours = Math.floor(stats.totalMinutes / 60);
  // Past an hour the tile shows hours and minutes together ("1h" + "20m") rather
  // than whole hours — flooring read as a rounding bug next to the week
  // summary's exact "1h 20m" on the same screen.
  const restMinutes = stats.totalMinutes % 60;
  const tiles = [
    {
      icon: 'flame' as const,
      label: 'Current streak',
      value: `${stats.currentStreak}`,
      unit: stats.currentStreak === 1 ? 'day' : 'days',
      spoken: `${stats.currentStreak} day${stats.currentStreak === 1 ? '' : 's'}`,
      color: colors.warning,
    },
    {
      icon: 'trophy' as const,
      label: 'Longest streak',
      value: `${stats.longestStreak}`,
      unit: stats.longestStreak === 1 ? 'day' : 'days',
      spoken: `${stats.longestStreak} day${stats.longestStreak === 1 ? '' : 's'}`,
      color: colors.accent,
    },
    {
      icon: 'time' as const,
      // Minutes stay readable up to an hour; past that the numeral becomes hours
      // with the leftover minutes as the unit, so it never contradicts the exact
      // total shown in the week summary.
      label: 'Total time',
      value: hours >= 1 ? `${hours}h` : `${stats.totalMinutes}`,
      unit: hours >= 1 ? (restMinutes > 0 ? `${restMinutes}m` : 'total') : 'min',
      spoken: spokenMinutes(stats.totalMinutes),
      color: colors.success,
    },
    {
      icon: 'leaf' as const,
      label: 'Sessions',
      value: `${stats.totalSessions}`,
      unit: 'total',
      spoken: `${stats.totalSessions} total`,
      color: colors.accentSoft,
    },
  ];

  const hasHistory = stats.totalSessions > 0;

  return (
    <Screen scroll>
      <Animated.View style={styles.header} entering={reduced ? undefined : FadeInDown.duration(500)}>
        <AppText variant="label" color={colors.accent}>
          YOUR JOURNEY
        </AppText>
        <AppText variant="title">Progress</AppText>
      </Animated.View>

      <Animated.View entering={reduced ? undefined : FadeInUp.duration(600).delay(120)}>
        <Surface>
          <View style={styles.grid}>
            {tiles.map((t) => (
              <View key={t.label} style={styles.tile} accessible accessibilityLabel={`${t.label}: ${t.spoken}`}>
                <View style={[styles.badge, { backgroundColor: withAlpha(t.color, 0.18) }]}>
                  <Ionicons name={t.icon} size={18} color={t.color} />
                </View>
                <View style={styles.tileText}>
                  <View style={styles.tileValueRow}>
                    <AppText variant="title" style={styles.tabular}>
                      {t.value}
                    </AppText>
                    <AppText variant="caption" muted>
                      {t.unit}
                    </AppText>
                  </View>
                  <AppText variant="caption" muted numberOfLines={1}>
                    {t.label}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
          <Divider />
          <Milestone totalSessions={stats.totalSessions} />
        </Surface>
      </Animated.View>

      <Animated.View entering={reduced ? undefined : FadeInUp.duration(600).delay(200)}>
        <Surface>
          <WeekChart weekMinutes={stats.weekMinutes} todayIndex={today} />
        </Surface>
      </Animated.View>

      <Animated.View entering={reduced ? undefined : FadeInUp.duration(600).delay(280)}>
        {hasHistory ? (
          <Surface>
            <RecentSessions sessions={sessions} />
          </Surface>
        ) : (
          <Surface style={styles.empty}>
            <Ionicons name="sparkles-outline" size={28} color={colors.accent} />
            <AppText variant="heading" center>
              No sessions yet
            </AppText>
            <AppText variant="body" muted center>
              Your streak, your minutes and the sittings behind them appear here. Head to the Relax
              tab to begin.
            </AppText>
          </Surface>
        )}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, marginTop: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg, columnGap: spacing.md },
  tile: { width: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  tileText: { flex: 1, gap: 2 },
  tileValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  tabular: { fontVariant: ['tabular-nums'] },
  milestone: { gap: spacing.sm },
  milestoneRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  track: { height: 4, borderRadius: radius.pill, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: radius.pill },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
});
