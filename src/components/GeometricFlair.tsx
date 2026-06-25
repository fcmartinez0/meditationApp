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

import { withAlpha } from '@/theme/categories';

interface GeometricFlairProps {
  /** Accent colour for the motif. */
  color: string;
  /** Overall size of the motif (it usually bleeds off a screen edge). */
  size?: number;
  /** Positioning (e.g. an off-screen corner). */
  style?: ViewStyle;
  /** Overall opacity of the watermark. */
  opacity?: number;
}

/**
 * A faint, slowly counter-rotating geometric watermark — the same flair as the
 * session orb's middle, distilled into a subtle ambient motif to sit behind
 * screen content. Decorative only; holds still for Reduce Motion.
 */
export function GeometricFlair({ color, size = 320, style, opacity = 0.1 }: GeometricFlairProps) {
  const reduced = useReducedMotion();
  const a = useSharedValue(0);
  const b = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      a.value = 0;
      b.value = 0;
      return;
    }
    a.value = withRepeat(withTiming(1, { duration: 90000, easing: Easing.linear }), -1, false);
    b.value = withRepeat(withTiming(1, { duration: 120000, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(a);
      cancelAnimation(b);
    };
  }, [reduced, a, b]);

  const styleA = useAnimatedStyle(() => ({ transform: [{ rotate: `${a.value * 360}deg` }] }));
  const styleB = useAnimatedStyle(() => ({ transform: [{ rotate: `${-b.value * 360}deg` }] }));

  const border = withAlpha(color, 0.7);

  return (
    <View style={[{ width: size, height: size, opacity }, style]} pointerEvents="none">
      <Animated.View style={[styles.layer, styleA]}>
        <View style={[styles.poly, { width: size * 0.82, height: size * 0.82, borderColor: border }]} />
      </Animated.View>
      <Animated.View style={[styles.layer, styleB]}>
        <View style={[styles.poly, { width: size * 0.58, height: size * 0.58, borderColor: border }]} />
      </Animated.View>
      <View style={styles.layer}>
        <View style={[styles.ring, { width: size * 0.7, height: size * 0.7, borderColor: border }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  poly: { position: 'absolute', borderWidth: 1.5, borderRadius: 10 },
  ring: { position: 'absolute', borderWidth: 1, borderRadius: 9999 },
});
