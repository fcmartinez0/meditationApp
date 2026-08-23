import { Ionicons } from '@expo/vector-icons';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Divider } from '@/components/Surface';
import { clockOf, formatMinutes, relativeDay, spokenMinutes } from '@/components/progressFormat';
import { useThemeColors } from '@/hooks/useThemeColors';
import { soundMeta } from '@/lib/catalog';
import type { SessionRecord } from '@/lib/types';
import { radius, spacing } from '@/theme';
import { categoryStyle, withAlpha } from '@/theme/categories';

interface RecentSessionsProps {
  /** Full history, oldest first (as stored). */
  sessions: SessionRecord[];
  /** How many of the most recent sessions to show. */
  limit?: number;
}

/**
 * The last few sittings — what was played, how long, and when. The numbers above
 * say how much; this says what it actually looked like.
 */
export function RecentSessions({ sessions, limit = 5 }: RecentSessionsProps) {
  const colors = useThemeColors();

  const recent = [...sessions].sort((a, b) => b.endedAt - a.endedAt).slice(0, limit);
  const hidden = sessions.length - recent.length;

  return (
    <>
      <View style={styles.header}>
        <AppText variant="heading">Recent sessions</AppText>
        {hidden > 0 ? (
          <AppText variant="caption" muted accessibilityLabel={`${hidden} earlier sessions not shown`}>
            +{hidden} earlier
          </AppText>
        ) : null}
      </View>

      <View>
        {recent.map((s, i) => {
          const meta = soundMeta(s.ambient);
          const cat = categoryStyle(s.ambient);
          const minutes = Math.max(1, Math.round(s.durationSec / 60));
          const when = relativeDay(s.day);
          const time = clockOf(s.endedAt);
          // An early finish matters more than the clock time, and keeping the
          // line to two parts means neither gets truncated on a narrow phone.
          const detail = s.completed ? `${when} · ${time}` : `${when} · ended early`;

          return (
            <Fragment key={`${s.endedAt}-${i}`}>
              {i > 0 ? <Divider /> : null}
              <View
                style={styles.row}
                accessible
                accessibilityLabel={`${meta.label}, ${spokenMinutes(minutes)}, ${when} at ${time}${
                  s.completed ? '' : ', ended early'
                }`}>
                <View style={[styles.badge, { backgroundColor: withAlpha(cat.accent, 0.18) }]}>
                  <Ionicons name={meta.icon} size={16} color={cat.accent} />
                </View>
                <View style={styles.rowText}>
                  <AppText variant="body" numberOfLines={1}>
                    {meta.label}
                  </AppText>
                  <AppText variant="caption" muted numberOfLines={1}>
                    {detail}
                  </AppText>
                </View>
                <AppText variant="body" color={colors.textSecondary} style={styles.duration}>
                  {formatMinutes(minutes)}
                </AppText>
              </View>
            </Fragment>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  badge: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 1 },
  duration: { fontVariant: ['tabular-nums'] },
});
