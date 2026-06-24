import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { withAlpha } from '@/theme/categories';

const SIZE = 280;

/** A circle that slowly fills with a soft gradient tide as the session progresses. */
export function TideTimer({
  progress,
  color,
  active,
  children,
}: {
  progress: number;
  color: string;
  active: boolean;
  children?: React.ReactNode;
}) {
  const bob = useSharedValue(0.5);
  const reduced = useReducedMotion();

  useEffect(() => {
    // Honor "Reduce Motion": keep the water surface still (level still fills).
    if (active && !reduced) {
      bob.value = withRepeat(
        withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      bob.value = withTiming(0.5);
    }
  }, [active, reduced, bob]);

  // Gentle "tide" bob on the water surface.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (bob.value - 0.5) * 7 }] }));
  const fillPct = Math.max(0, Math.min(1, progress)) * 100;

  return (
    <View style={styles.container}>
      {/* Soft outer aura so the empty ring doesn't read as a hard outline. */}
      <View style={[styles.aura, { backgroundColor: withAlpha(color, 0.08) }]} />
      <View style={[styles.ring, { borderColor: withAlpha(color, 0.35) }]}>
        <Animated.View style={[styles.fill, { height: `${fillPct}%` }, fillStyle]}>
          <LinearGradient
            colors={[withAlpha(color, 0.85), withAlpha(color, 0.4)]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.fillGradient}
          />
          {/* A brighter line riding the surface of the tide. */}
          <View style={[styles.surface, { backgroundColor: withAlpha(color, 0.95) }]} />
        </Animated.View>
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  aura: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
  },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1.5,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  fill: { width: '100%' },
  fillGradient: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  surface: { position: 'absolute', top: 0, height: 2, width: '100%', opacity: 0.9 },
  content: { alignItems: 'center', justifyContent: 'center' },
});
