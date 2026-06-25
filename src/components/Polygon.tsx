import { StyleSheet, View } from 'react-native';

interface PolygonProps {
  /** Number of sides (3 = triangle, 6 = hexagon …). */
  sides: number;
  /** Circumradius in px. */
  radius: number;
  /** Stroke colour. */
  color: string;
  strokeWidth?: number;
  /** Rotate the whole polygon (degrees). */
  rotate?: number;
}

/**
 * A crisp regular-polygon outline drawn from straight edge segments (no SVG).
 * Each edge is a thin rotated bar positioned at its midpoint, so triangles,
 * hexagons, etc. render with sharp corners — far less "basic" than rotated
 * rounded squares.
 */
export function Polygon({ sides, radius, color, strokeWidth = 1.5, rotate = 0 }: PolygonProps) {
  const size = radius * 2;
  const c = radius;
  const edgeLen = 2 * radius * Math.sin(Math.PI / sides) + strokeWidth; // +sw so corners meet
  const rMid = radius * Math.cos(Math.PI / sides);
  const base = (rotate * Math.PI) / 180 - Math.PI / 2; // start at the top
  const edges = [];
  for (let k = 0; k < sides; k++) {
    const ang = base + (2 * Math.PI * k) / sides + Math.PI / sides;
    const x = Math.cos(ang) * rMid;
    const y = Math.sin(ang) * rMid;
    const rotDeg = (ang * 180) / Math.PI + 90; // tangent to the circle
    edges.push(
      <View
        key={k}
        style={[
          styles.edge,
          {
            width: edgeLen,
            height: strokeWidth,
            backgroundColor: color,
            borderRadius: strokeWidth,
            left: c + x - edgeLen / 2,
            top: c + y - strokeWidth / 2,
            transform: [{ rotate: `${rotDeg}deg` }],
          },
        ]}
      />,
    );
  }
  return <View style={{ width: size, height: size }}>{edges}</View>;
}

const styles = StyleSheet.create({
  edge: { position: 'absolute' },
});
