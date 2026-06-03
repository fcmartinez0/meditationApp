import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { withAlpha } from '@/theme/categories';

const SIZE = 260;

/** A circle that slowly fills with color from the bottom as the session progresses. */
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

  useEffect(() => {
    if (active) {
      bob.value = withRepeat(
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      bob.value = withTiming(0.5);
    }
  }, [active, bob]);

  // Gentle "tide" bob on the water surface.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (bob.value - 0.5) * 7 }] }));
  const fillPct = Math.max(0, Math.min(1, progress)) * 100;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.ring,
          { borderColor: withAlpha(color, 0.5), backgroundColor: withAlpha(color, 0.08) },
        ]}>
        <Animated.View
          style={[styles.fill, { height: `${fillPct}%`, backgroundColor: withAlpha(color, 0.55) }, fillStyle]}>
          <View style={[styles.surface, { backgroundColor: withAlpha(color, 0.9) }]} />
        </Animated.View>
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  fill: { width: '100%' },
  surface: { height: 3, width: '100%', opacity: 0.85 },
  content: { alignItems: 'center', justifyContent: 'center' },
});
