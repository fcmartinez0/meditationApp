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
 * A living "aurora" orb that paces the breath: a gradient core with slowly
 * orbiting internal light blobs and a drifting sheen, a soft breathing halo,
 * concentric breath-ripples, and a few twinkling sparks. Calm, never busy.
 */
export function BreathingOrb({ active = false, still, core, halo, colors: gradient, children }: BreathingOrbProps) {
  const theme = useThemeColors();
  const coreColor = core ?? theme.accentSoft;
  const haloColor = halo ?? theme.auroraEnd;
  const grad = gradient ?? ([coreColor, haloColor] as const);
  const reduced = useReducedMotion();

  const breath = useSharedValue(0.5);
  const ripple = useSharedValue(0);
  const spin = useSharedValue(0); // sheen + spark ring
  const orbit = useSharedValue(0); // internal aurora blobs
  const twinkle = useSharedValue(0.5);

  useEffect(() => {
    const loop = (sv: typeof spin, ms: number) =>
      (sv.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1, false));

    if (still || reduced) {
      cancelAnimation(breath);
      cancelAnimation(ripple);
      breath.value = 0.5;
      ripple.value = 0;
      if (reduced) {
        cancelAnimation(spin);
        cancelAnimation(orbit);
        cancelAnimation(twinkle);
        spin.value = 0;
        orbit.value = 0;
        twinkle.value = 0.6;
      } else {
        // A still orb still drifts gently — alive, just not breathing.
        loop(spin, 52000);
        loop(orbit, 26000);
        twinkle.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.ease) }), -1, true);
      }
      return;
    }
    if (active) {
      cancelAnimation(breath);
      breath.value = 0;
      breath.value = withRepeat(withTiming(1, { duration: BREATH_MS, easing: Easing.inOut(Easing.ease) }), -1, true);
      ripple.value = 0;
      ripple.value = withRepeat(withTiming(1, { duration: BREATH_MS * 2, easing: Easing.out(Easing.ease) }), -1, false);
      loop(spin, 44000);
      loop(orbit, 20000);
      twinkle.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }), -1, true);
    } else {
      cancelAnimation(breath);
      cancelAnimation(ripple);
      breath.value = withTiming(0.18, { duration: 800 });
      ripple.value = withTiming(0, { duration: 800 });
      loop(spin, 52000);
      loop(orbit, 26000);
    }
    return () => {
      cancelAnimation(breath);
      cancelAnimation(ripple);
      cancelAnimation(spin);
      cancelAnimation(orbit);
      cancelAnimation(twinkle);
    };
  }, [active, still, reduced, breath, ripple, spin, orbit, twinkle]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.96 + breath.value * 0.18 }],
    opacity: 0.16 + breath.value * 0.16,
  }));
  const coreStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.9 + breath.value * 0.1 }] }));
  const sheenStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const orbitStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${orbit.value * 360}deg` }] }));
  const orbitRevStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-orbit.value * 360}deg` }] }));
  const sparkRingStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
    opacity: 0.35 + twinkle.value * 0.45,
  }));

  const ring1 = useAnimatedStyle(() => ({
    transform: [{ scale: 0.78 + ripple.value * 0.46 }],
    opacity: (1 - ripple.value) * 0.3,
  }));
  const ring2 = useAnimatedStyle(() => {
    const p = (ripple.value + 0.5) % 1;
    return { transform: [{ scale: 0.78 + p * 0.46 }], opacity: (1 - p) * 0.3 };
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.ring, { borderColor: withAlpha(haloColor, 0.6) }, ring1]} />
      <Animated.View style={[styles.ring, { borderColor: withAlpha(haloColor, 0.6) }, ring2]} />
      <Animated.View style={[styles.halo, { backgroundColor: haloColor }, haloStyle]} />

      {/* Twinkling sparks drifting around the orb. */}
      <Animated.View style={[styles.sparkRing, sparkRingStyle]} pointerEvents="none">
        {[0, 90, 180, 270].map((deg, i) => (
          <View
            key={deg}
            style={[
              styles.spark,
              {
                backgroundColor: i % 2 === 0 ? '#FFFFFF' : grad[1],
                transform: [{ rotate: `${deg}deg` }, { translateY: -SIZE * 0.48 }],
              },
            ]}
          />
        ))}
      </Animated.View>

      <Animated.View style={[styles.core, coreStyle]}>
        <LinearGradient
          colors={[grad[0], grad[1]]}
          start={{ x: 0.15, y: 0.0 }}
          end={{ x: 0.85, y: 1.0 }}
          style={styles.coreFill}
        />
        {/* Internal aurora: two soft blobs orbiting opposite ways. */}
        <Animated.View style={[styles.orbitWrap, orbitStyle]} pointerEvents="none">
          <LinearGradient
            colors={[withAlpha('#FFFFFF', 0.55), 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.blob}
          />
        </Animated.View>
        <Animated.View style={[styles.orbitWrap, orbitRevStyle]} pointerEvents="none">
          <LinearGradient
            colors={[withAlpha(grad[1], 0.6), 'transparent']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.blob, styles.blob2]}
          />
        </Animated.View>
        {/* A soft diagonal light streak slowly rotating inside the core. */}
        <Animated.View style={[styles.sheenWrap, sheenStyle]} pointerEvents="none">
          <LinearGradient
            colors={[withAlpha('#FFFFFF', 0.45), 'transparent', withAlpha(grad[1], 0.4)]}
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
  container: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 1 },
  halo: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
  sparkRing: { position: 'absolute', width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  spark: { position: 'absolute', width: 5, height: 5, borderRadius: 3 },
  core: { position: 'absolute', width: CORE, height: CORE, borderRadius: CORE / 2, overflow: 'hidden' },
  coreFill: { width: '100%', height: '100%' },
  orbitWrap: { position: 'absolute', width: CORE, height: CORE, alignItems: 'center', justifyContent: 'center' },
  blob: { position: 'absolute', width: CORE * 0.7, height: CORE * 0.7, borderRadius: CORE * 0.35, transform: [{ translateX: CORE * 0.2 }] },
  blob2: { transform: [{ translateX: -CORE * 0.22 }, { translateY: CORE * 0.15 }] },
  sheenWrap: { position: 'absolute', width: CORE * 1.6, height: CORE * 1.6, left: -CORE * 0.3, top: -CORE * 0.3 },
  content: { alignItems: 'center', justifyContent: 'center' },
});
