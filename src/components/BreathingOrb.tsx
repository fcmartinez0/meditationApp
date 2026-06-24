import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
import { withAlpha } from '@/theme/categories';

const SIZE = 280;
const CORE = SIZE * 0.64;
// A calm ~4.2s inhale / ~4.2s exhale breathing rhythm.
const BREATH_MS = 4200;

interface BreathingOrbProps {
  /** When false the orb settles to a resting size (paused). */
  active?: boolean;
  /** Hold a calm, still glow with no pulsing (e.g. on the home screen). */
  still?: boolean;
  /** Core / halo colors (default to the theme accent). */
  core?: string;
  halo?: string;
  /** A two-stop gradient for a richer core (falls back to [core, halo]). */
  colors?: readonly [string, string];
  children?: React.ReactNode;
}

/**
 * A softly breathing "aurora" orb that paces the user's breath: a gradient core
 * with a slowly drifting inner sheen, a gentle halo, and concentric ripples that
 * swell outward on each breath. Minimal, calm, and never busy.
 */
export function BreathingOrb({ active = false, still, core, halo, colors: gradient, children }: BreathingOrbProps) {
  const theme = useThemeColors();
  const coreColor = core ?? theme.accentSoft;
  const haloColor = halo ?? theme.auroraEnd;
  const grad = gradient ?? ([coreColor, haloColor] as const);
  const reduced = useReducedMotion();

  // 0 = exhaled, 1 = inhaled. Starts half-open so a still orb shows no startup pop.
  const breath = useSharedValue(0.5);
  // 0..1 ramp that drives the outward breath-ripples.
  const ripple = useSharedValue(0);
  // 0..1 ramp that slowly rotates the inner sheen so the orb stays alive.
  const spin = useSharedValue(0);

  useEffect(() => {
    const slowSpin = () =>
      withRepeat(withTiming(1, { duration: 52000, easing: Easing.linear }), -1, false);

    // A still, half-open glow (home) or for Reduce Motion — set instantly so
    // there's no one-shot "pulse then stop" on mount.
    if (still || reduced) {
      cancelAnimation(breath);
      cancelAnimation(ripple);
      cancelAnimation(spin);
      breath.value = 0.5;
      ripple.value = 0;
      spin.value = reduced ? 0 : slowSpin(); // still orbs keep drifting; reduced-motion stays put
      return;
    }
    if (active) {
      cancelAnimation(breath);
      // Begin from fully exhaled so the first swell spans the whole range.
      breath.value = 0;
      breath.value = withRepeat(
        withTiming(1, { duration: BREATH_MS, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
      ripple.value = 0;
      ripple.value = withRepeat(
        withTiming(1, { duration: BREATH_MS * 2, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      );
      spin.value = slowSpin();
    } else {
      // Paused: settle small and calm, but keep a faint drift.
      cancelAnimation(breath);
      cancelAnimation(ripple);
      breath.value = withTiming(0.18, { duration: 800 });
      ripple.value = withTiming(0, { duration: 800 });
      spin.value = slowSpin();
    }
    return () => {
      cancelAnimation(breath);
      cancelAnimation(ripple);
      cancelAnimation(spin);
    };
  }, [active, still, reduced, breath, ripple, spin]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.96 + breath.value * 0.18 }],
    opacity: 0.16 + breath.value * 0.16,
  }));

  const coreStyle = useAnimatedStyle(() => ({
    // A subtle 0.9 -> 1.0 swell rather than a big pulse.
    transform: [{ scale: 0.9 + breath.value * 0.1 }],
  }));

  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  // Two ripple rings, half a cycle apart, expanding outward and fading.
  const ring1 = useAnimatedStyle(() => ({
    transform: [{ scale: 0.78 + ripple.value * 0.46 }],
    opacity: (1 - ripple.value) * 0.3,
  }));
  const ring2 = useAnimatedStyle(() => {
    const p = (ripple.value + 0.5) % 1;
    return {
      transform: [{ scale: 0.78 + p * 0.46 }],
      opacity: (1 - p) * 0.3,
    };
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.ring, { borderColor: withAlpha(haloColor, 0.6) }, ring1]} />
      <Animated.View style={[styles.ring, { borderColor: withAlpha(haloColor, 0.6) }, ring2]} />
      <Animated.View style={[styles.halo, { backgroundColor: haloColor }, haloStyle]} />
      <Animated.View style={[styles.core, coreStyle]}>
        <LinearGradient
          colors={[grad[0], grad[1]]}
          start={{ x: 0.15, y: 0.0 }}
          end={{ x: 0.85, y: 1.0 }}
          style={styles.coreFill}
        />
        {/* A soft diagonal light streak that slowly rotates inside the core. */}
        <Animated.View style={[styles.sheenWrap, sheenStyle]} pointerEvents="none">
          <LinearGradient
            colors={[withAlpha('#FFFFFF', 0.5), 'transparent', withAlpha(grad[1], 0.45)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </Animated.View>
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
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1,
  },
  halo: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
  },
  core: {
    position: 'absolute',
    width: CORE,
    height: CORE,
    borderRadius: CORE / 2,
    overflow: 'hidden',
  },
  coreFill: {
    width: '100%',
    height: '100%',
  },
  // Oversized so the rotating streak always covers the circle's corners.
  sheenWrap: {
    position: 'absolute',
    width: CORE * 1.6,
    height: CORE * 1.6,
    left: -CORE * 0.3,
    top: -CORE * 0.3,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
