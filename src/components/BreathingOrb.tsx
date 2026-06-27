import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useThemeColors } from '@/hooks/useThemeColors';
import { Polygon } from '@/components/Polygon';
import { withAlpha } from '@/theme/categories';

const SIZE = 280;
const CORE = SIZE * 0.46;
const GEOM = SIZE * 0.92;
const TICKS = 36;
const BREATH_MS = 4200;

interface BreathingOrbProps {
  active?: boolean;
  still?: boolean;
  core?: string;
  halo?: string;
  colors?: readonly [string, string];
  /**
   * External 0..1 breath driver. When provided (e.g. a paced breathing
   * exercise), the orb expands/contracts with this value instead of running its
   * own breathing LFO — so the same orb can pace any rhythm.
   */
  breath?: SharedValue<number>;
  children?: React.ReactNode;
}

/**
 * A crisp geometric "bloom" that paces the breath: two counter-rotating polygon
 * rings, a wheel of radial spokes, sharp concentric rings, and a gradient core —
 * all revolving slowly in the brand colours. Breathes when active, drifts when
 * still, and holds steady for Reduce Motion.
 */
export function BreathingOrb({ active = false, still, core, halo, colors: gradient, breath: breathProp, children }: BreathingOrbProps) {
  const theme = useThemeColors();
  const coreColor = core ?? theme.accentSoft;
  const haloColor = halo ?? theme.auroraEnd;
  const grad = gradient ?? ([coreColor, haloColor] as const);
  // A small multi-hue palette so the geometry reads as colourful, not mono.
  const palette = ['#FFFFFF', grad[0], grad[1], haloColor];
  const reduced = useReducedMotion();

  // Internal breath LFO, used unless the caller drives the breath externally.
  const internalBreath = useSharedValue(0.5);
  const breath = breathProp ?? internalBreath;
  const spinA = useSharedValue(0); // polygon CW
  const spinB = useSharedValue(0); // polygon CCW
  const spinS = useSharedValue(0); // spokes
  const sheen = useSharedValue(0); // glassy light sweep across the core

  useEffect(() => {
    const loop = (sv: typeof spinA, ms: number) =>
      (sv.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1, false));

    if (reduced) {
      cancelAnimation(internalBreath);
      cancelAnimation(spinA);
      cancelAnimation(spinB);
      cancelAnimation(spinS);
      cancelAnimation(sheen);
      if (!breathProp) internalBreath.value = 0.5;
      spinA.value = 0;
      spinB.value = 0;
      spinS.value = 0;
      sheen.value = 0;
      return;
    }

    // Geometry always revolves (slower when still/paused, livelier when active).
    loop(spinA, active ? 30000 : 44000);
    loop(spinB, active ? 38000 : 52000);
    loop(spinS, active ? 60000 : 80000);
    loop(sheen, active ? 14000 : 22000); // glassy shine sweep

    // Drive the breathing LFO only when the caller isn't supplying its own.
    if (!breathProp) {
      cancelAnimation(internalBreath);
      if (still) {
        internalBreath.value = 0.5;
      } else if (active) {
        internalBreath.value = 0;
        internalBreath.value = withRepeat(
          withTiming(1, { duration: BREATH_MS, easing: Easing.inOut(Easing.ease) }),
          -1,
          true,
        );
      } else {
        internalBreath.value = withTiming(0.2, { duration: 800 });
      }
    }
    return () => {
      cancelAnimation(internalBreath);
      cancelAnimation(spinA);
      cancelAnimation(spinB);
      cancelAnimation(spinS);
      cancelAnimation(sheen);
    };
  }, [active, still, reduced, breathProp, internalBreath, spinA, spinB, spinS, sheen]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.96 + breath.value * 0.16 }],
    opacity: 0.12 + breath.value * 0.12,
  }));
  const spinAStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spinA.value * 360}deg` }] }));
  const spinBStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-spinB.value * 360}deg` }] }));
  const spokesStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spinS.value * 360}deg` }] }));
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.94 + breath.value * 0.08 }] }));
  const coreStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.9 + breath.value * 0.1 }] }));
  const sheenStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${sheen.value * 360}deg` }] }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.halo, { backgroundColor: haloColor }, haloStyle]} />

      {/* Fine outer tick ring (every third tick longer, like a bezel). */}
      <Animated.View style={[styles.layer, spokesStyle]} pointerEvents="none">
        {Array.from({ length: TICKS }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.tick,
              {
                backgroundColor: withAlpha(palette[i % palette.length], i % 3 === 0 ? 0.65 : 0.28),
                height: i % 3 === 0 ? 12 : 6,
                transform: [{ rotate: `${(360 / TICKS) * i}deg` }, { translateY: -GEOM * 0.47 }],
              },
            ]}
          />
        ))}
      </Animated.View>

      {/* Outer hexagon. */}
      <Animated.View style={[styles.layer, spinAStyle]} pointerEvents="none">
        <Polygon sides={6} radius={GEOM * 0.44} color={withAlpha(grad[1], 0.9)} strokeWidth={2} />
      </Animated.View>

      {/* A 12-point starburst of glowing light-beams: each ray is a gradient
          sliver, bright at the core and fading to nothing at the tip (alternating
          long and short for sparkle), capped with a gem. Celestial radiance —
          no overlapping-triangle hexagram. */}
      <Animated.View style={[styles.layer, spinAStyle]} pointerEvents="none">
        {Array.from({ length: 12 }).map((_, i) => {
          const long = i % 2 === 0;
          const len = GEOM * (long ? 0.42 : 0.3);
          return (
            <LinearGradient
              key={`ray${i}`}
              colors={['transparent', withAlpha(palette[i % palette.length], long ? 0.85 : 0.5)]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[
                styles.ray,
                { height: len, transform: [{ rotate: `${30 * i}deg` }, { translateY: -len / 2 }] },
              ]}
            />
          );
        })}
      </Animated.View>
      <Animated.View style={[styles.layer, spinAStyle]} pointerEvents="none">
        {Array.from({ length: 12 }).map((_, i) => {
          const long = i % 2 === 0;
          const r = GEOM * (long ? 0.42 : 0.3);
          return (
            <View
              key={`tip${i}`}
              style={[
                styles.jewel,
                {
                  backgroundColor: withAlpha(long ? '#FFFFFF' : grad[1], 0.92),
                  transform: [{ rotate: `${30 * i}deg` }, { translateY: -r }],
                },
              ]}
            />
          );
        })}
      </Animated.View>

      {/* Orbiting luminous particles — small "stars" drifting on a ring,
          counter-rotating for a calm, celestial layer. */}
      <Animated.View style={[styles.layer, spinBStyle]} pointerEvents="none">
        {Array.from({ length: 6 }).map((_, i) => (
          <View
            key={`orbit${i}`}
            style={[
              styles.orbit,
              {
                backgroundColor: withAlpha(palette[(i + 1) % palette.length], 0.9),
                transform: [{ rotate: `${60 * i + 30}deg` }, { translateY: -GEOM * 0.5 }],
              },
            ]}
          />
        ))}
      </Animated.View>

      {/* Nested inner hexagon for depth. */}
      <Animated.View style={[styles.layer, spinBStyle]} pointerEvents="none">
        <Polygon sides={6} radius={GEOM * 0.27} color={withAlpha('#FFFFFF', 0.4)} strokeWidth={1.5} rotate={30} />
      </Animated.View>

      {/* Crisp concentric rings. */}
      <Animated.View style={[styles.ringWrap, ringStyle]} pointerEvents="none">
        <View style={[styles.ring, { width: GEOM * 0.74, height: GEOM * 0.74, borderColor: withAlpha('#FFFFFF', 0.22) }]} />
        <View style={[styles.ring, { width: GEOM * 0.54, height: GEOM * 0.54, borderColor: withAlpha(haloColor, 0.4) }]} />
      </Animated.View>

      {/* Glassy gradient core: gradient fill, a rotating light sweep, and a glossy
          top highlight so it reads as shiny glass over the geometry. */}
      <Animated.View style={[styles.core, coreStyle]}>
        <LinearGradient
          colors={[grad[0], grad[1]]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.coreFill}
        />
        <Animated.View style={[styles.sheenWrap, sheenStyle]} pointerEvents="none">
          <LinearGradient
            colors={[withAlpha('#FFFFFF', 0.55), 'transparent', withAlpha(grad[1], 0.35)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.coreFill}
          />
        </Animated.View>
        <LinearGradient
          colors={[withAlpha('#FFFFFF', 0.5), 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.7 }}
          style={styles.gloss}
          pointerEvents="none"
        />
      </Animated.View>

      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
  layer: { position: 'absolute', width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  tick: { position: 'absolute', width: 2, borderRadius: 1 },
  ray: { position: 'absolute', width: 4, borderRadius: 2 },
  jewel: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5 },
  orbit: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
  ringWrap: { position: 'absolute', width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1, borderRadius: GEOM },
  core: { position: 'absolute', width: CORE, height: CORE, borderRadius: CORE / 2, overflow: 'hidden' },
  coreFill: { width: '100%', height: '100%' },
  // Oversized so the rotating light sweep always covers the circle's corners.
  sheenWrap: { position: 'absolute', width: CORE * 1.7, height: CORE * 1.7, left: -CORE * 0.35, top: -CORE * 0.35 },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: CORE * 0.6 },
  content: { alignItems: 'center', justifyContent: 'center' },
});
