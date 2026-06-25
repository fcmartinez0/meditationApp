import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Polygon } from '@/components/Polygon';
import { withAlpha } from '@/theme/categories';

interface GeometricFlairProps {
  color: string;
  size?: number;
  style?: ViewStyle;
  opacity?: number;
}

/**
 * A slowly counter-rotating geometric mandala — a hexagon, a shifting hexagram
 * (two triangles), a fine tick ring and a circle — distilled from the session
 * orb to sit behind screen content as ambient flair. Decorative; holds still for
 * Reduce Motion.
 */
export function GeometricFlair({ color, size = 460, style, opacity = 0.22 }: GeometricFlairProps) {
  const reduced = useReducedMotion();
  const a = useSharedValue(0);
  const b = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      a.value = 0;
      b.value = 0;
      return;
    }
    a.value = withRepeat(withTiming(1, { duration: 95000, easing: Easing.linear }), -1, false);
    b.value = withRepeat(withTiming(1, { duration: 130000, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(a);
      cancelAnimation(b);
    };
  }, [reduced, a, b]);

  const styleA = useAnimatedStyle(() => ({ transform: [{ rotate: `${a.value * 360}deg` }] }));
  const styleB = useAnimatedStyle(() => ({ transform: [{ rotate: `${-b.value * 360}deg` }] }));

  const strong = withAlpha(color, 0.85);
  const soft = withAlpha(color, 0.5);
  const TICKS = 48;

  return (
    <View style={[{ width: size, height: size, opacity }, style]} pointerEvents="none">
      {/* Fine tick ring. */}
      <Animated.View style={styles.layer}>
        {Array.from({ length: TICKS }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.tick,
              {
                backgroundColor: soft,
                height: i % 4 === 0 ? 14 : 7,
                transform: [{ rotate: `${(360 / TICKS) * i}deg` }, { translateY: -size * 0.47 }],
              },
            ]}
          />
        ))}
      </Animated.View>
      <Animated.View style={[styles.layer, styleA]}>
        <Polygon sides={6} radius={size * 0.4} color={strong} strokeWidth={1.5} />
      </Animated.View>
      <Animated.View style={[styles.layer, styleB]}>
        <Polygon sides={3} radius={size * 0.34} color={strong} strokeWidth={1.5} />
      </Animated.View>
      <Animated.View style={[styles.layer, styleA]}>
        <Polygon sides={3} radius={size * 0.34} color={soft} strokeWidth={1.5} rotate={180} />
      </Animated.View>
      <View style={styles.layer}>
        <View style={[styles.ring, { width: size * 0.62, height: size * 0.62, borderColor: soft }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  tick: { position: 'absolute', width: 2, borderRadius: 1 },
  ring: { position: 'absolute', borderWidth: 1, borderRadius: 9999 },
});
