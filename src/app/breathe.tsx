import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Backdrop } from '@/components/Backdrop';
import {
  BreathGuidanceNote,
  BreathSuggestionLine,
  suggestRhythm,
  type BreathRhythmKey,
} from '@/components/BreathGuidance';
import { BreathPaceLegend, BreathRhythmCard, type BreathPhase } from '@/components/BreathRhythmCard';
import { BreathingOrb } from '@/components/BreathingOrb';
import { Button } from '@/components/Button';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatClock } from '@/lib/date';
import { spacing } from '@/theme';

interface Phase extends BreathPhase {
  to: number; // target circle scale at the end of this phase
}

const PATTERNS: Record<BreathRhythmKey, { label: string; hint: string; phases: Phase[] }> = {
  box: {
    label: 'Box',
    hint: 'Four equal sides — nothing rushes or lingers.',
    phases: [
      { label: 'Breathe in', kind: 'in', seconds: 4, to: 1 },
      { label: 'Hold', kind: 'hold', seconds: 4, to: 1 },
      { label: 'Breathe out', kind: 'out', seconds: 4, to: 0.45 },
      { label: 'Hold', kind: 'hold', seconds: 4, to: 0.45 },
    ],
  },
  relax: {
    label: '4-7-8',
    hint: 'A long hold, then the slowest exhale here.',
    phases: [
      { label: 'Breathe in', kind: 'in', seconds: 4, to: 1 },
      { label: 'Hold', kind: 'hold', seconds: 7, to: 1 },
      { label: 'Breathe out', kind: 'out', seconds: 8, to: 0.45 },
    ],
  },
  calm: {
    label: 'Calm',
    hint: 'No holds — the exhale just runs longer.',
    phases: [
      { label: 'Breathe in', kind: 'in', seconds: 4, to: 1 },
      { label: 'Breathe out', kind: 'out', seconds: 6, to: 0.45 },
    ],
  },
  coherent: {
    label: 'Coherent',
    hint: 'Even in, even out — six breaths a minute.',
    phases: [
      { label: 'Breathe in', kind: 'in', seconds: 5, to: 1 },
      { label: 'Breathe out', kind: 'out', seconds: 5, to: 0.45 },
    ],
  },
};

const PATTERN_KEYS = Object.keys(PATTERNS) as BreathRhythmKey[];

export default function BreatheScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [patternKey, setPatternKey] = useState<BreathRhythmKey | null>(null);
  // Fixed for the life of the screen so the nudge can't shuffle under a thumb.
  const suggestion = useMemo(() => suggestRhythm(), []);

  return (
    <View style={[styles.fill, styles.clip, { backgroundColor: colors.background }]}>
      <Backdrop count={90} />
      <SafeAreaView style={styles.fill} edges={['left', 'right', 'bottom']}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 44) + spacing.xs }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => (patternKey ? setPatternKey(null) : router.back())}
            hitSlop={16}
            style={styles.close}>
            <Ionicons name={patternKey ? 'chevron-back' : 'close'} size={28} color={colors.textSecondary} />
          </Pressable>
        </View>

        {patternKey ? (
          <BreathingRunner pattern={PATTERNS[patternKey]} onEnd={() => router.back()} />
        ) : (
          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.select}
            showsVerticalScrollIndicator={false}>
            <View style={styles.selectHead}>
              <AppText variant="label" muted>
                BREATHE
              </AppText>
              <AppText variant="title">Choose a rhythm</AppText>
              <BreathSuggestionLine note={suggestion.note} />
            </View>

            <View style={styles.list}>
              {PATTERN_KEYS.map((key, i) => (
                <Animated.View
                  key={key}
                  entering={reduced ? undefined : FadeInDown.duration(420).delay(80 * i)}>
                  <BreathRhythmCard
                    label={PATTERNS[key].label}
                    hint={PATTERNS[key].hint}
                    phases={PATTERNS[key].phases}
                    suggested={key === suggestion.key}
                    onPress={() => setPatternKey(key)}
                  />
                </Animated.View>
              ))}
            </View>

            <BreathPaceLegend />
            <BreathGuidanceNote />
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

// Phase circle scale (0.45 contracted .. 1 expanded) → orb breath (0 .. 1).
const toBreath = (to: number) => (to - 0.45) / 0.55;

function BreathingRunner({ pattern, onEnd }: { pattern: { label: string; phases: Phase[] }; onEnd: () => void }) {
  useKeepAwake();
  const colors = useThemeColors();
  const breath = useSharedValue(0);
  const [label, setLabel] = useState(pattern.phases[0].label);
  const [count, setCount] = useState(pattern.phases[0].seconds);
  const [elapsed, setElapsed] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    let phaseIdx = 0;
    let phaseTimeout: ReturnType<typeof setTimeout>;
    let countInterval: ReturnType<typeof setInterval>;

    const runPhase = () => {
      if (cancelled.current) return;
      const ph = pattern.phases[phaseIdx % pattern.phases.length];
      setLabel(ph.label);
      setCount(ph.seconds);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      breath.value = withTiming(toBreath(ph.to), { duration: ph.seconds * 1000, easing: Easing.inOut(Easing.ease) });
      let left = ph.seconds;
      clearInterval(countInterval);
      countInterval = setInterval(() => {
        left -= 1;
        setCount(Math.max(0, left));
      }, 1000);
      phaseTimeout = setTimeout(() => {
        phaseIdx++;
        runPhase();
      }, ph.seconds * 1000);
    };
    runPhase();

    const startAt = Date.now();
    const elapsedInterval = setInterval(() => setElapsed(Math.floor((Date.now() - startAt) / 1000)), 1000);

    return () => {
      cancelled.current = true;
      clearTimeout(phaseTimeout);
      clearInterval(countInterval);
      clearInterval(elapsedInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.runner}>
      <View style={styles.orbArea}>
        <BreathingOrb
          active
          breath={breath}
          core={colors.accentSoft}
          halo={colors.auroraEnd}
          colors={[colors.accentSoft, colors.auroraEnd]}>
          <View style={styles.orbCenter}>
            <AppText variant="heading" color="#FFFFFF">
              {label}
            </AppText>
            <AppText variant="display" color="#FFFFFF" style={styles.count}>
              {count}
            </AppText>
          </View>
        </BreathingOrb>
      </View>

      <View style={styles.runnerFooter}>
        <AppText variant="caption" muted center>
          {pattern.label} · {formatClock(elapsed)}
        </AppText>
        <Button label="End" variant="secondary" onPress={onEnd} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  clip: { overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    minHeight: 48,
  },
  close: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  select: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  selectHead: { gap: spacing.xs },
  list: { gap: spacing.md },
  runner: { flex: 1, justifyContent: 'space-between', paddingBottom: spacing.xl },
  orbArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  orbCenter: { alignItems: 'center', gap: spacing.xs },
  count: { fontWeight: '200' },
  runnerFooter: { paddingHorizontal: spacing.xl, gap: spacing.md },
});
