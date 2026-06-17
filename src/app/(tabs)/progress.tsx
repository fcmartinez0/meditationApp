import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { useThemeColors } from '@/hooks/useThemeColors';
import { WEEKDAY_LABELS } from '@/lib/date';
import { todayWeekIndex } from '@/lib/stats';
import { useAppData } from '@/store/AppData';
import { radius, spacing } from '@/theme';

const MAX_BAR_HEIGHT = 120;

export default function ProgressScreen() {
  const colors = useThemeColors();
  const { stats } = useAppData();
  const today = todayWeekIndex();

  const maxMinutes = Math.max(...stats.weekMinutes, 1);
  const weekTotal = stats.weekMinutes.reduce((a, b) => a + b, 0);

  const tiles = [
    { icon: 'flame' as const, label: 'Current streak', value: `${stats.currentStreak}`, unit: 'days', color: colors.warning },
    { icon: 'trophy' as const, label: 'Longest streak', value: `${stats.longestStreak}`, unit: 'days', color: colors.accent },
    { icon: 'time' as const, label: 'Total time', value: `${stats.totalMinutes}`, unit: 'min', color: colors.success },
    { icon: 'leaf' as const, label: 'Sessions', value: `${stats.totalSessions}`, unit: 'total', color: colors.accentSoft },
  ];

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AppText variant="label" muted>
          YOUR JOURNEY
        </AppText>
        <AppText variant="title">Progress</AppText>
      </View>

      <View style={styles.grid}>
        {tiles.map((t) => (
          <Card key={t.label} style={styles.tile}>
            <Ionicons name={t.icon} size={24} color={t.color} />
            <View style={styles.tileValueRow}>
              <AppText variant="title" style={styles.tileValue}>
                {t.value}
              </AppText>
              <AppText variant="caption" muted>
                {t.unit}
              </AppText>
            </View>
            <AppText variant="caption" muted>
              {t.label}
            </AppText>
          </Card>
        ))}
      </View>

      <Card>
        <View style={styles.chartHeader}>
          <AppText variant="heading">This week</AppText>
          <AppText variant="caption" muted>
            {weekTotal} min total
          </AppText>
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
                  <View
                    style={[
                      styles.bar,
                      {
                        height,
                        backgroundColor: minutes > 0 ? colors.accent : colors.surfaceMuted,
                        opacity: minutes > 0 ? 1 : 0.6,
                      },
                    ]}
                  />
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

      {stats.totalSessions === 0 && (
        <Card style={styles.empty}>
          <Ionicons name="sparkles-outline" size={28} color={colors.accent} />
          <AppText variant="body" muted center>
            Your stats will appear here after your first session. Head to the Meditate tab to begin.
          </AppText>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, marginTop: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { width: '47%', flexGrow: 1, gap: spacing.sm, padding: spacing.lg },
  tileValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  tileValue: { fontSize: 30 },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
