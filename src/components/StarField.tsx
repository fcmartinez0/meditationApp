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
export function StarField({ color, count = 70, seed = 99 }: { color: string; count?: number; seed?: number }) {
  const stars = useMemo(() => {
    const r = makeRng(seed);
    return Array.from({ length: count }, () => {
      const size = 1 + Math.round(r() * 2);
      return { left: r() * 100, top: r() * 100, size, op: 0.1 + r() * 0.45 };
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
