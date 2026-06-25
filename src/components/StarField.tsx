import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
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

function TwinkleStar({ x, y, size, op, color, delay, dur }: { x: number; y: number; size: number; op: number; color: string; delay: number; dur: number }) {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      t.value = 0.6;
    } else {
      t.value = withDelay(delay, withRepeat(withTiming(1, { duration: dur, easing: Easing.inOut(Easing.ease) }), -1, true));
    }
    return () => cancelAnimation(t);
  }, [reduced, delay, dur, t]);
  const style = useAnimatedStyle(() => ({ opacity: op * (0.3 + 0.7 * t.value) }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', left: `${x}%`, top: `${y}%`, width: size, height: size, borderRadius: size, backgroundColor: color },
        style,
      ]}
    />
  );
}

function ShootingStar({ color, fromX, fromY, dx, dy, gap, delay }: { color: string; fromX: number; fromY: number; dx: number; dy: number; gap: number; delay: number }) {
  const p = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    p.value = withDelay(delay, withRepeat(withDelay(gap, withTiming(1, { duration: 1000, easing: Easing.in(Easing.quad) })), -1, false));
    return () => cancelAnimation(p);
  }, [reduced, gap, delay, p]);
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
 * positions never reflow; holds still for Reduce Motion.
 */
export function StarField({ color, count = 120, seed = 99 }: { color: string; count?: number; seed?: number }) {
  const { staticStars, twinkles, shooters } = useMemo(() => {
    const r = makeRng(seed);
    const staticStars: { left: number; top: number; size: number; op: number }[] = [];
    const twinkles: { x: number; y: number; size: number; op: number; delay: number; dur: number }[] = [];
    for (let i = 0; i < count; i++) {
      const big = r() < 0.18;
      const size = big ? 2.5 + r() * 2 : 1 + r() * 1.5;
      const op = big ? 0.5 + r() * 0.45 : 0.18 + r() * 0.4;
      const left = r() * 100;
      const top = r() * 100;
      // ~30% of stars twinkle; the rest stay static (keeps it light).
      if (r() < 0.3) twinkles.push({ x: left, y: top, size, op: Math.min(1, op + 0.15), delay: r() * 4000, dur: 1600 + r() * 2600 });
      else staticStars.push({ left, top, size, op });
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
        <TwinkleStar key={`t${i}`} x={s.x} y={s.y} size={s.size} op={s.op} color={color} delay={s.delay} dur={s.dur} />
      ))}
      {shooters.map((s, i) => (
        <ShootingStar key={`s${i}`} color={withAlpha(color, 0.85)} {...s} />
      ))}
    </View>
  );
}
