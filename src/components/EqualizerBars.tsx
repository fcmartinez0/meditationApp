import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** Spotify-style bouncing "now playing" bars, shown on the selected sound. */
export function EqualizerBars({ color }: { color: string }) {
  return (
    <View style={styles.row}>
      {[0, 1, 2, 3].map((i) => (
        <Bar key={i} color={color} delay={i * 110} />
      ))}
    </View>
  );
}

function Bar({ color, delay }: { color: string; delay: number }) {
  const t = useSharedValue(0.3);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 360, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [delay, t]);
  const style = useAnimatedStyle(() => ({ height: 4 + t.value * 14 }));
  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 18, width: 26 },
  bar: { flex: 1, borderRadius: 2 },
});
