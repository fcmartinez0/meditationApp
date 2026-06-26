import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { useThemeColors } from '@/hooks/useThemeColors';
import { WEEKDAY_LABELS } from '@/lib/date';
import { todayWeekIndex } from '@/lib/stats';
import { useAppData } from '@/store/AppData';
import { radius, spacing } from '@/theme';
import { withAlpha } from '@/theme/categories';

const MAX_BAR_HEIGHT = 120;

export default function ProgressScreen() {
  const colors = useThemeColors();
  const { stats } = useAppData();
  const today = todayWeekIndex();

  const maxMinutes = Math.max(...stats.weekMinutes, 1);

  const tiles = [
    { icon: 'flame' as const, label: 'Current streak', value: `${stats.currentStreak}`, unit: 'days', color: colors.warning },
    { icon: 'trophy' as const, label: 'Longest streak', value: `${stats.longestStreak}`, unit: 'days', color: colors.accent },
    { icon: 'time' as const, label: 'Total time', value: `${stats.totalMinutes}`, unit: 'min', color: colors.success },
    { icon: 'leaf' as const, label: 'Sessions', value: `${stats.totalSessions}`, unit: 'total', color: colors.accentSoft },
  ];

  return (
    <Screen scroll>
      <Animated.View style={styles.header} entering={FadeInDown.duration(500)}>
        <AppText variant="label" color={colors.accent}>
          YOUR JOURNEY
        </AppText>
        <AppText variant="title">Progress</AppText>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(600).delay(120)}>
      <Card>
        <View style={styles.grid}>
          {tiles.map((t) => (
            <View key={t.label} style={styles.tile}>
              <View style={[styles.badge, { backgroundColor: withAlpha(t.color, 0.18) }]}>
                <Ionicons name={t.icon} size={18} color={t.color} />
              </View>
              <View style={styles.tileText}>
                <View style={styles.tileValueRow}>
                  <AppText variant="title">{t.value}</AppText>
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
      </Card>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(600).delay(240)}>
      <Card>
        <View style={styles.chartHeader}>
          <AppText variant="heading">This week</AppText>
        </View>
        <View style={styles.chart}>
          {stats.weekMinutes.map((minutes, i) => {
            const height = Math.max(4, (minutes / maxMinutes) * MAX_BAR_HEIGHT);
            const isToday = i === today;
            return (
              <View
                key={i}
                style={styles.barColumn}
                accessible
                accessibilityLabel={`${WEEKDAY_LABELS[i]}${isToday ? ' (today)' : ''}, ${minutes} minute${minutes === 1 ? '' : 's'}`}>
                <View style={styles.barArea}>
                  {minutes > 0 ? (
                    <LinearGradient
                      colors={[colors.auroraEnd, colors.accent]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={[styles.bar, { height }]}
                    />
                  ) : (
                    <View style={[styles.bar, { height, backgroundColor: colors.surfaceMuted, opacity: 0.6 }]} />
                  )}
                </View>
                <AppText
                  variant="caption"
                  color={isToday ? colors.accent : colors.textSecondary}
                  style={isToday ? styles.todayLabel : undefined}>
                  {WEEKDAY_LABELS[i]}
                </AppText>
              </View>
            );
          })}
        </View>
      </Card>
      </Animated.View>

      {stats.totalSessions === 0 && (
        <Animated.View entering={FadeInUp.duration(600).delay(360)}>
        <Card style={styles.empty}>
          <Ionicons name="sparkles-outline" size={28} color={colors.accent} />
          <AppText variant="body" muted center>
            Your stats will appear here after your first session. Head to the Relax tab to begin.
          </AppText>
        </Card>
        </Animated.View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, marginTop: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.xl, columnGap: spacing.md },
  tile: { width: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  tileText: { flex: 1, gap: 2 },
  tileValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  chartHeader: {
    marginBottom: spacing.lg,
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: MAX_BAR_HEIGHT + 24,
  },
  barColumn: { flex: 1, alignItems: 'center', gap: spacing.sm },
  barArea: { height: MAX_BAR_HEIGHT, justifyContent: 'flex-end' },
  bar: { width: 18, borderRadius: radius.sm },
  todayLabel: { fontWeight: '800' },
  empty: { alignItems: 'center', gap: spacing.md },
});
