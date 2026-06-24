import { StyleSheet, View } from 'react-native';

/**
 * A quiet "now playing" indicator: a single soft dot on the selected sound.
 * (Replaced the bouncing equalizer bars for a calmer, more minimal selection.)
 */
export function EqualizerBars({ color }: { color: string }) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 18, width: 18, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
