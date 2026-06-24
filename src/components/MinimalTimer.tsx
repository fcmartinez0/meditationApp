import { useEffect } from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const BREATH_MS = 4200;

/**
 * The "minimal" timer: just the clock, but with a barely-there breathing pulse
 * (a slow opacity + micro-scale swell) so the bare number still feels alive and
 * paces the breath. Honors Reduce Motion by holding steady.
 */
export function MinimalTimer({ active, children }: { active: boolean; children?: React.ReactNode }) {
  const breath = useSharedValue(0.5);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (active && !reduced) {
      breath.value = withRepeat(
        withTiming(1, { duration: BREATH_MS, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(breath);
      breath.value = withTiming(0.5, { duration: 600 });
    }
    return () => cancelAnimation(breath);
  }, [active, reduced, breath]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.72 + breath.value * 0.28,
    transform: [{ scale: 0.985 + breath.value * 0.015 }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
