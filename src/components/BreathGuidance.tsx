import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useThemeColors } from '@/hooks/useThemeColors';
import { spacing } from '@/theme';

/** The rhythm keys the Breathe screen offers. */
export type BreathRhythmKey = 'box' | 'relax' | 'calm' | 'coherent';

interface Suggestion {
  key: BreathRhythmKey;
  /** A short reason, phrased as a nudge rather than a prescription. */
  note: string;
}

/**
 * A gentle time-of-day nudge, so the screen has an opinion when you don't.
 * Deliberately soft: it only points at one of the four, and every rhythm stays
 * one tap away.
 */
export function suggestRhythm(now: Date = new Date()): Suggestion {
  const hour = now.getHours();
  if (hour < 5) return { key: 'relax', note: 'Late night · a long exhale to settle down' };
  if (hour < 10) return { key: 'coherent', note: 'Morning · an even 5-5 is an easy way in' };
  if (hour < 16) return { key: 'box', note: 'Midday · equal sides for a steady stretch' };
  if (hour < 21) return { key: 'calm', note: 'Evening · a softer, longer exhale' };
  return { key: 'relax', note: 'Winding down · the longest exhale of the four' };
}

/** The time-of-day nudge as one quiet line under the title. */
export function BreathSuggestionLine({ note }: { note: string }) {
  const colors = useThemeColors();
  return (
    <View style={styles.suggestion}>
      <Ionicons name="moon-outline" size={14} color={colors.accent} />
      <AppText variant="caption" color={colors.accent} style={styles.suggestionText}>
        {note}
      </AppText>
    </View>
  );
}

/**
 * How to use the rhythms, and the app's standing wellness caveat. Kept to two
 * short lines: comfort over precision, and no medical claims (see /legal).
 */
export function BreathGuidanceNote() {
  const colors = useThemeColors();
  return (
    <View style={[styles.note, { borderTopColor: colors.border }]}>
      <AppText variant="caption" muted style={styles.line}>
        Breathe through your nose, and ease off if a count feels long. A wellness practice, not
        medical treatment.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  suggestionText: { flex: 1 },
  note: { gap: spacing.xs, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  line: { lineHeight: 19 },
});
