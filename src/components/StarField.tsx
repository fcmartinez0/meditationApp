import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { withAlpha } from '@/theme/categories';

function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

/**
 * A faint, static field of scattered "stardust" specks that fills the background
 * so screens don't read as empty. Deterministic (seeded), so it never reflows.
 * Decorative; sits behind content.
 */
export function StarField({ color, count = 120, seed = 99 }: { color: string; count?: number; seed?: number }) {
  const stars = useMemo(() => {
    const r = makeRng(seed);
    return Array.from({ length: count }, () => {
      // Mostly small specks with the occasional brighter, larger star.
      const big = r() < 0.18;
      const size = big ? 2.5 + r() * 2 : 1 + r() * 1.5;
      const op = big ? 0.5 + r() * 0.45 : 0.18 + r() * 0.4;
      return { left: r() * 100, top: r() * 100, size, op };
    });
  }, [count, seed]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((s, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            borderRadius: s.size,
            backgroundColor: withAlpha(color, s.op),
          }}
        />
      ))}
    </View>
  );
}
