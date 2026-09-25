import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { GlassFill } from '@/components/GlassFill';
import { useThemeColors } from '@/hooks/useThemeColors';
import { radius, spacing } from '@/theme';
import { withAlpha } from '@/theme/categories';

/**
 * What a phase does to the breath. The pace bar reads this (plus the seconds)
 * to draw a rhythm's silhouette, so it is real timing data rather than art.
 */
export type BreathPhaseKind = 'in' | 'hold' | 'out';

export interface BreathPhase {
  label: string;
  seconds: number;
  kind: BreathPhaseKind;
}

/** Total seconds of one full cycle, summed from the phases. */
export function cycleSeconds(phases: readonly BreathPhase[]): number {
  return phases.reduce((total, p) => total + p.seconds, 0);
}

/** "4-7-8" — the pattern spelled from the phase durations. */
export function patternDigits(phases: readonly BreathPhase[]): string {
  return phases.map((p) => p.seconds).join('-');
}

/**
 * How full the lungs are at the END of each phase (1 = full, 0 = empty).
 * Inhale fills, exhale empties, a hold keeps whatever the phase before it left —
 * which is exactly what the runner's circle scale does, so the bar's silhouette
 * matches the orb people will actually watch.
 */
export function phaseLevels(phases: readonly BreathPhase[]): number[] {
  let level = 0;
  return phases.map((p) => {
    if (p.kind === 'in') level = 1;
    else if (p.kind === 'out') level = 0;
    return level;
  });
}

const BAR_HIGH = 26;
const BAR_LOW = 9;

/**
 * A rhythm's signature: one block per phase, width proportional to its seconds
 * and height set by how full the breath is during it. Box breathing reads as an
 * even square wave; 4-7-8 as a long held plateau trailing into a long low
 * exhale — two rhythms are told apart at a glance, from the numbers alone.
 */
export function BreathPaceBar({ phases }: { phases: readonly BreathPhase[] }) {
  const colors = useThemeColors();
  const levels = phaseLevels(phases);
  const tint = (kind: BreathPhaseKind) =>
    kind === 'in' ? colors.accent : kind === 'out' ? colors.auroraEnd : withAlpha(colors.accent, 0.32);

  return (
    <View style={styles.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {phases.map((p, i) => (
        <View key={`${p.label}-${i}`} style={[styles.column, { flex: p.seconds }]}>
          <View
            style={[
              styles.block,
              { height: levels[i] === 1 ? BAR_HIGH : BAR_LOW, backgroundColor: tint(p.kind) },
            ]}
          />
          <AppText variant="caption" muted center style={styles.tick}>
            {p.seconds}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** The colour key for the pace bars — quiet, and shown once for the whole list. */
export function BreathPaceLegend() {
  const colors = useThemeColors();
  const items: { label: string; color: string }[] = [
    { label: 'in', color: colors.accent },
    { label: 'hold', color: withAlpha(colors.accent, 0.32) },
    { label: 'out', color: colors.auroraEnd },
  ];
  return (
    <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {items.map((it) => (
        <View key={it.label} style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: it.color }]} />
          <AppText variant="caption" muted>
            {it.label}
          </AppText>
        </View>
      ))}
      <AppText variant="caption" muted style={styles.legendNote}>
        · numbers are seconds
      </AppText>
    </View>
  );
}

interface BreathRhythmCardProps {
  label: string;
  /** One short line on how this rhythm feels — not a claim about outcomes. */
  hint: string;
  phases: readonly BreathPhase[];
  /** Marks the rhythm nudged for the current time of day. */
  suggested?: boolean;
  onPress: () => void;
}

export function BreathRhythmCard({ label, hint, phases, suggested = false, onPress }: BreathRhythmCardProps) {
  const colors = useThemeColors();
  const cycle = cycleSeconds(phases);
  const digits = patternDigits(phases);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${digits}, ${cycle} second cycle. ${hint}${suggested ? ' Suggested for now.' : ''}`}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: suggested ? withAlpha(colors.accent, 0.5) : colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <GlassFill fallback={colors.surface} radius={radius.md} />

      <View style={styles.head}>
        <AppText variant="body" style={styles.cardTitle}>
          {label}
        </AppText>
        {suggested ? (
          <View style={[styles.tag, { backgroundColor: withAlpha(colors.accent, 0.18) }]}>
            <AppText variant="caption" color={colors.accent}>
              for now
            </AppText>
          </View>
        ) : null}
        <AppText variant="caption" muted>
          {cycle}s cycle
        </AppText>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </View>

      <BreathPaceBar phases={phases} />

      <AppText variant="caption" muted>
        {hint}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { flex: 1 },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 1, borderRadius: radius.pill },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: BAR_HIGH + 15 },
  column: { justifyContent: 'flex-end' },
  block: { borderRadius: 4, width: '100%' },
  tick: { marginTop: 2, fontSize: 11, lineHeight: 14 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendNote: { marginLeft: -spacing.sm },
});
