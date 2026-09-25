import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { formatMinutes, spokenMinutes } from '@/components/progressFormat';
import { useThemeColors } from '@/hooks/useThemeColors';
import { WEEKDAY_LABELS } from '@/lib/date';
import { radius, spacing } from '@/theme';
import { withAlpha } from '@/theme/categories';

const BAR_MAX = 100;
/** Room above the bars for the per-bar minute labels. */
const VALUE_H = 18;
const DAY_H = 20;
const MIN_BAR = 6;

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface WeekChartProps {
  /** Minutes per weekday, Monday first. */
  weekMinutes: number[];
  /** Index (Mon = 0) of today, highlighted in the chart. */
  todayIndex: number;
}

/**
 * The week at a glance: one bar per day, each labelled with its own minutes so a
 * bar is readable as a value rather than just a shape, sitting on a baseline so
 * a day with no practice still has a place on the chart (a faint tick) instead
 * of a stub that looks like a rendering artifact.
 */
export function WeekChart({ weekMinutes, todayIndex }: WeekChartProps) {
  const colors = useThemeColors();

  const peak = Math.max(...weekMinutes, 1);
  const total = weekMinutes.reduce((sum, m) => sum + m, 0);
  const activeDays = weekMinutes.filter((m) => m > 0).length;
  const average = activeDays > 0 ? total / activeDays : 0;

  // With nothing logged the full-height plot is just an empty box, so the chart
  // collapses to its baseline and rest ticks — quiet, but still composed.
  const compact = total === 0;
  const barMax = compact ? 28 : BAR_MAX;
  const valueH = compact ? 0 : VALUE_H;

  const summary =
    total > 0 ? `${formatMinutes(total)} · ${formatMinutes(average)} avg` : 'Nothing logged yet';
  const summaryLabel =
    total > 0
      ? `${spokenMinutes(total)} this week, averaging ${spokenMinutes(average)} on the ${activeDays} day${
          activeDays === 1 ? '' : 's'
        } you practised`
      : 'No minutes logged this week yet';

  return (
    <>
      <View style={styles.header}>
        <AppText variant="heading">This week</AppText>
        <AppText variant="caption" muted accessibilityLabel={summaryLabel}>
          {summary}
        </AppText>
      </View>

      <View style={[styles.plot, { height: valueH + barMax + spacing.sm + DAY_H }]}>
        {weekMinutes.map((minutes, i) => {
          const isToday = i === todayIndex;
          const height = minutes > 0 ? MIN_BAR + (minutes / peak) * (barMax - MIN_BAR) : 0;
          return (
            <View
              key={i}
              style={styles.column}
              accessible
              accessibilityLabel={`${DAY_NAMES[i]}${isToday ? ', today' : ''}, ${spokenMinutes(minutes)}`}>
              {isToday ? (
                <View
                  style={[styles.todayWash, { backgroundColor: withAlpha(colors.accent, 0.09) }]}
                  pointerEvents="none"
                />
              ) : null}

              <View style={[styles.valueSlot, { height: valueH }]}>
                {minutes > 0 ? (
                  <AppText
                    variant="caption"
                    color={isToday ? colors.accent : colors.textSecondary}
                    style={styles.value}>
                    {minutes}
                  </AppText>
                ) : null}
              </View>

              <View style={[styles.barArea, { height: barMax }]}>
                {minutes > 0 ? (
                  <LinearGradient
                    colors={[colors.auroraEnd, colors.accent]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[styles.bar, { height }]}
                  />
                ) : (
                  // A deliberate "rested" mark: a faint tick on the baseline, so
                  // an empty day reads as a choice rather than a broken bar.
                  <View
                    style={[
                      styles.restTick,
                      {
                        backgroundColor: withAlpha(
                          isToday ? colors.accent : colors.textSecondary,
                          isToday ? 0.55 : 0.35,
                        ),
                      },
                    ]}
                  />
                )}
              </View>

              <AppText
                variant="caption"
                color={isToday ? colors.accent : colors.textSecondary}
                style={[styles.day, isToday ? styles.todayLabel : null]}>
                {WEEKDAY_LABELS[i]}
              </AppText>
            </View>
          );
        })}

        {/* Drawn last so it sits above the today wash. */}
        <View
          style={[styles.baseline, { backgroundColor: withAlpha(colors.border, 0.9) }]}
          pointerEvents="none"
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  plot: { flexDirection: 'row', alignItems: 'flex-end' },
  column: { flex: 1, alignItems: 'center' },
  todayWash: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 2,
    right: 2,
    borderRadius: radius.md,
  },
  valueSlot: { justifyContent: 'flex-end' },
  value: { fontVariant: ['tabular-nums'] },
  barArea: { justifyContent: 'flex-end' },
  bar: { width: 18, borderRadius: radius.sm },
  restTick: { width: 10, height: 3, borderRadius: radius.pill },
  day: { height: DAY_H, lineHeight: DAY_H, textAlign: 'center', marginTop: spacing.sm },
  todayLabel: { fontWeight: '800' },
  baseline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: DAY_H + spacing.sm - 1,
    height: 1,
  },
});
