import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { GlassFill } from '@/components/GlassFill';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatClock } from '@/lib/date';
import { radius, spacing } from '@/theme';
import { withAlpha } from '@/theme/categories';

interface Phase {
  label: string;
  seconds: number;
  to: number; // target circle scale at the end of this phase
}

const PATTERNS: Record<string, { label: string; hint: string; phases: Phase[] }> = {
  box: {
    label: 'Box',
    hint: '4-4-4-4 · steady focus',
    phases: [
      { label: 'Breathe in', seconds: 4, to: 1 },
      { label: 'Hold', seconds: 4, to: 1 },
      { label: 'Breathe out', seconds: 4, to: 0.45 },
      { label: 'Hold', seconds: 4, to: 0.45 },
    ],
  },
  relax: {
    label: '4-7-8',
    hint: 'calming · for sleep',
    phases: [
      { label: 'Breathe in', seconds: 4, to: 1 },
      { label: 'Hold', seconds: 7, to: 1 },
      { label: 'Breathe out', seconds: 8, to: 0.45 },
    ],
  },
  calm: {
    label: 'Calm',
    hint: '4-6 · gentle exhale',
    phases: [
      { label: 'Breathe in', seconds: 4, to: 1 },
      { label: 'Breathe out', seconds: 6, to: 0.45 },
    ],
  },
  coherent: {
    label: 'Coherent',
    hint: '5-5 · balance',
    phases: [
      { label: 'Breathe in', seconds: 5, to: 1 },
      { label: 'Breathe out', seconds: 5, to: 0.45 },
    ],
  },
};

export default function BreatheScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [patternKey, setPatternKey] = useState<string | null>(null);

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
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
          <View style={styles.select}>
            <View style={styles.selectHead}>
              <AppText variant="label" muted>
                BREATHE
              </AppText>
              <AppText variant="title">Choose a rhythm</AppText>
            </View>
            {Object.entries(PATTERNS).map(([key, p]) => (
              <Pressable
                key={key}
                onPress={() => setPatternKey(key)}
                style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
                <GlassFill fallback={colors.surface} radius={radius.md} />
                <View style={{ flex: 1 }}>
                  <AppText variant="body">{p.label}</AppText>
                  <AppText variant="caption" muted>
                    {p.hint}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </Pressable>
            ))}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

function BreathingRunner({ pattern, onEnd }: { pattern: { label: string; phases: Phase[] }; onEnd: () => void }) {
  useKeepAwake();
  const colors = useThemeColors();
  const scale = useSharedValue(0.45);
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
      scale.value = withTiming(ph.to, { duration: ph.seconds * 1000, easing: Easing.inOut(Easing.ease) });
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

  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.7 + scale.value * 0.5 }],
    opacity: 0.12 + scale.value * 0.12,
  }));

  return (
    <View style={styles.runner}>
      <View style={styles.orbArea}>
        <Animated.View style={[styles.halo, { backgroundColor: colors.auroraEnd }, haloStyle]} />
        <Animated.View style={[styles.ring, { borderColor: withAlpha(colors.accentSoft, 0.6) }, circleStyle]} />
        <Animated.View style={[styles.circle, circleStyle]}>
          <LinearGradient
            colors={[colors.accentSoft, colors.auroraEnd]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={styles.circleFill}
          />
          <LinearGradient
            colors={[withAlpha('#FFFFFF', 0.5), 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.7 }}
            style={styles.gloss}
            pointerEvents="none"
          />
        </Animated.View>
        <View style={styles.orbCenter}>
          <AppText variant="heading" color="#FFFFFF">
            {label}
          </AppText>
          <AppText variant="display" color="#FFFFFF" style={styles.count}>
            {count}
          </AppText>
        </View>
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

const SIZE = 240;

const styles = StyleSheet.create({
  fill: { flex: 1 },
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
  select: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.md },
  selectHead: { gap: spacing.xs, marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  runner: { flex: 1, justifyContent: 'space-between', paddingBottom: spacing.xl },
  orbArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
  ring: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 1.5 },
  circle: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden', opacity: 0.95 },
  circleFill: { width: '100%', height: '100%' },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: SIZE * 0.55 },
  orbCenter: { alignItems: 'center', gap: spacing.xs },
  count: { fontWeight: '200' },
  runnerFooter: { paddingHorizontal: spacing.xl, gap: spacing.md },
});
