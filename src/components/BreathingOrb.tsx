import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useThemeColors } from '@/hooks/useThemeColors';

const SIZE = 260;
// A calm 4s inhale / 4s exhale breathing rhythm.
const BREATH_MS = 4000;

interface BreathingOrbProps {
  /** When false the orb settles to a resting size (paused). */
  active?: boolean;
  /** Hold a calm, still glow with no pulsing (e.g. on the home screen). */
  still?: boolean;
  /** Core / halo colors (default to the theme accent). */
  core?: string;
  halo?: string;
  children?: React.ReactNode;
}

/** A softly pulsing orb that paces the user's breath. */
export function BreathingOrb({ active = false, still, core, halo, children }: BreathingOrbProps) {
  const colors = useThemeColors();
  const coreColor = core ?? colors.accentSoft;
  const haloColor = halo ?? colors.auroraEnd;
  // Start at the "still" size so a still/home orb shows no startup animation.
  const progress = useSharedValue(0.5);
  const reduced = useReducedMotion();

  useEffect(() => {
    // A still, half-open glow when asked (home) or for Reduce Motion — set it
    // instantly so there's no one-shot "pulse then stop" on mount.
    if (still || reduced) {
      cancelAnimation(progress);
      progress.value = 0.5;
      return;
    }
    if (active) {
      // Begin the breath from fully exhaled so the swell spans the full range.
      cancelAnimation(progress);
      progress.value = 0;
      progress.value = withRepeat(
        withTiming(1, { duration: BREATH_MS, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(progress);
      progress.value = withTiming(0.15, { duration: 600 });
    }
    return () => cancelAnimation(progress);
  }, [active, still, reduced, progress]);

  const coreStyle = useAnimatedStyle(() => ({
    // Gentler breath: a subtle 0.88 -> 1.0 swell rather than a big pulse.
    transform: [{ scale: 0.88 + progress.value * 0.12 }],
    opacity: 0.82,
  }));

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.94 + progress.value * 0.2 }],
    opacity: 0.12 + progress.value * 0.14,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.halo, { backgroundColor: haloColor }, haloStyle]} />
      <Animated.View style={[styles.core, { backgroundColor: coreColor }, coreStyle]} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
  },
  core: {
    position: 'absolute',
    width: SIZE * 0.72,
    height: SIZE * 0.72,
    borderRadius: SIZE,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
