import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { withAlpha } from '@/theme/categories';

function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

// A handful of shared twinkle clocks instead of one animator per star: dozens of
// concurrent UI-thread loops collapse to four, which is what low-end Android
// batteries notice during a 20-minute session. Co-prime-ish periods spanning
// the old per-star cycle range keep the field calm and never visibly repeating.
const PHASE_PERIODS_MS = [3400, 4600, 6200, 8200];

function TwinkleStar({
  x,
  y,
  size,
  op,
  color,
  phase,
  offset,
  reduced,
}: {
  x: number;
  y: number;
  size: number;
  op: number;
  color: string;
  phase: SharedValue<number>;
  offset: number;
  reduced: boolean;
}) {
  const style = useAnimatedStyle(() => {
    // The per-star constant offset de-syncs stars riding the same clock, so
    // they still twinkle organically rather than in lockstep groups. sin() is
    // periodic, so the clock wrapping never produces a visual jump.
    const wave = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(2 * Math.PI * (phase.value + offset));
    return { opacity: op * (0.3 + 0.7 * wave) };
  });
  return (
    <Animated.View
      style={[
        { position: 'absolute', left: `${x}%`, top: `${y}%`, width: size, height: size, borderRadius: size, backgroundColor: color },
        style,
      ]}
    />
  );
}

function ShootingStar({ color, fromX, fromY, dx, dy, gap, delay, paused }: { color: string; fromX: number; fromY: number; dx: number; dy: number; gap: number; delay: number; paused: boolean }) {
  const p = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced || paused) {
      cancelAnimation(p);
      // Park at 0 (fully transparent) so no half-flown streak hangs frozen on
      // screen when the tab regains focus.
      p.value = 0;
      return;
    }
    p.value = withDelay(delay, withRepeat(withDelay(gap, withTiming(1, { duration: 1000, easing: Easing.in(Easing.quad) })), -1, false));
    return () => cancelAnimation(p);
  }, [reduced, paused, gap, delay, p]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.12, 0.8, 1], [0, 0.9, 0.9, 0]),
    transform: [
      { translateX: interpolate(p.value, [0, 1], [0, dx]) },
      { translateY: interpolate(p.value, [0, 1], [0, dy]) },
      { rotate: `${(Math.atan2(dy, dx) * 180) / Math.PI}deg` },
    ],
  }));
  if (reduced) return null;
  return (
    <Animated.View style={[{ position: 'absolute', left: `${fromX}%`, top: `${fromY}%` }, style]}>
      <View style={{ width: 46, height: 1.6, borderRadius: 1, backgroundColor: color }} />
    </Animated.View>
  );
}

/**
 * A faint, living "stardust" field: scattered static specks, a set of slowly
 * twinkling stars, and the occasional shooting star. Deterministic (seeded) so
 * positions never reflow; holds still for Reduce Motion, and pauses entirely
 * while its screen is unfocused (expo-router keeps tab screens mounted, so
 * without this every backgrounded tab keeps burning battery).
 */
export function StarField({ color, count = 120, seed = 99 }: { color: string; count?: number; seed?: number }) {
  const reduced = useReducedMotion();
  const focused = useIsFocused();

  const phase0 = useSharedValue(0);
  const phase1 = useSharedValue(0);
  const phase2 = useSharedValue(0);
  const phase3 = useSharedValue(0);
  const phases = [phase0, phase1, phase2, phase3];

  useEffect(() => {
    const all = [phase0, phase1, phase2, phase3];
    if (reduced || !focused) {
      all.forEach(cancelAnimation);
      return;
    }
    all.forEach((p, i) => {
      // Animate from the frozen value to value+1 rather than resetting to 0:
      // sin(2π·phase) only cares about the fractional part, so both the repeat
      // wrap and a re-focus resume are seamless. The modulo keeps the value
      // bounded across arbitrarily many focus cycles.
      const from = p.value % 1;
      p.value = from;
      p.value = withRepeat(withTiming(from + 1, { duration: PHASE_PERIODS_MS[i], easing: Easing.linear }), -1, false);
    });
    return () => all.forEach(cancelAnimation);
  }, [reduced, focused, phase0, phase1, phase2, phase3]);

  const { staticStars, twinkles, shooters } = useMemo(() => {
    const r = makeRng(seed);
    const staticStars: { left: number; top: number; size: number; op: number }[] = [];
    const twinkles: { x: number; y: number; size: number; op: number; phaseIndex: number; offset: number }[] = [];
    for (let i = 0; i < count; i++) {
      const big = r() < 0.18;
      const size = big ? 2.5 + r() * 2 : 1 + r() * 1.5;
      const op = big ? 0.5 + r() * 0.45 : 0.18 + r() * 0.4;
      const left = r() * 100;
      const top = r() * 100;
      // ~30% of stars twinkle; the rest stay static (keeps it light). Each
      // twinkler is dealt round-robin onto a shared clock with a seeded phase
      // offset, so neighbours on the same clock never pulse together.
      if (r() < 0.3) {
        const offset = r();
        // Burn a second draw to keep the rng cadence identical to the old
        // delay+duration pair, so seeded star layouts don't shift.
        r();
        twinkles.push({ x: left, y: top, size, op: Math.min(1, op + 0.15), phaseIndex: twinkles.length % PHASE_PERIODS_MS.length, offset });
      } else {
        staticStars.push({ left, top, size, op });
      }
    }
    const shooters = [
      { fromX: 8, fromY: 12, dx: 150, dy: 90, gap: 7000, delay: 2500 },
      { fromX: 70, fromY: 8, dx: -170, dy: 120, gap: 11000, delay: 9000 },
    ];
    return { staticStars, twinkles, shooters };
  }, [count, seed]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {staticStars.map((s, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            borderRadius: s.size,
            backgroundColor: withAlpha(color, s.op),
          }}
        />
      ))}
      {twinkles.map((s, i) => (
        <TwinkleStar key={`t${i}`} x={s.x} y={s.y} size={s.size} op={s.op} color={color} phase={phases[s.phaseIndex]} offset={s.offset} reduced={reduced} />
      ))}
      {shooters.map((s, i) => (
        <ShootingStar key={`s${i}`} color={withAlpha(color, 0.85)} paused={!focused} {...s} />
      ))}
    </View>
  );
}
