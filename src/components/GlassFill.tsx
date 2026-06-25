import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View } from 'react-native';

/** True once, at module load, when Apple's Liquid Glass is available. */
export const GLASS = isLiquidGlassAvailable();

/**
 * An absolutely-positioned fill for a rounded container: Liquid Glass on iOS 26,
 * a flat fallback colour elsewhere. Render it as the first child of a
 * `position: relative` (default) view with `overflow: 'hidden'`; content after it
 * paints on top.
 */
export function GlassFill({ fallback, radius = 0, tint }: { fallback: string; radius?: number; tint?: string }) {
  if (GLASS) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor={tint}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
      />
    );
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: fallback, borderRadius: radius }]} />;
}
