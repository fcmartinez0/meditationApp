import Svg, { Circle, Line, Path } from 'react-native-svg';

export interface IconProps {
  size?: number;
  color: string;
  /** Filled (active) vs outline (inactive). */
  filled?: boolean;
}

/**
 * A small, on-brand custom icon set — themed around stars and calm — drawn with
 * react-native-svg so they're crisp at any size. `filled` toggles the active
 * (solid) vs inactive (outline) state.
 */

/** Four-point sparkle star (the app's stardust mark). */
export function StarIcon({ size = 24, color, filled = false }: IconProps) {
  const d = 'M12 1.6 L14.5 9.5 L22.4 12 L14.5 14.5 L12 22.4 L9.5 14.5 L1.6 12 L9.5 9.5 Z';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} fill={filled ? color : 'none'} stroke={color} strokeWidth={filled ? 0 : 1.8} strokeLinejoin="round" />
    </Svg>
  );
}

/** A constellation — connected stars — for progress / the journey. */
export function ConstellationIcon({ size = 24, color, filled = false }: IconProps) {
  const pts: [number, number][] = [
    [4, 17],
    [9.5, 9],
    [15, 14],
    [20.5, 5.5],
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {pts.slice(1).map(([x, y], i) => (
        <Line
          key={i}
          x1={pts[i][0]}
          y1={pts[i][1]}
          x2={x}
          y2={y}
          stroke={color}
          strokeWidth={1.4}
          strokeOpacity={0.6}
          strokeLinecap="round"
        />
      ))}
      {pts.map(([x, y], i) => (
        <Circle key={`c${i}`} cx={x} cy={y} r={i === 1 ? 2.3 : 1.8} fill={filled ? color : 'none'} stroke={color} strokeWidth={1.6} />
      ))}
    </Svg>
  );
}

/** Minimal sliders for settings (clean, in the same line weight). */
export function SlidersIcon({ size = 24, color, filled = false }: IconProps) {
  const rows = [
    { y: 6.5, cx: 8 },
    { y: 12, cx: 15 },
    { y: 17.5, cx: 10 },
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {rows.map((r, i) => (
        <Line key={i} x1={3} y1={r.y} x2={21} y2={r.y} stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeOpacity={0.45} />
      ))}
      {/* Solid handle dots in the icon colour — reads as a slider knob and adapts
          to light/dark without a hardcoded fill. */}
      {rows.map((r, i) => (
        <Circle key={`k${i}`} cx={r.cx} cy={r.y} r={filled ? 3 : 2.6} fill={color} />
      ))}
    </Svg>
  );
}

/** A crescent moon cradling a small star — used for calm / night accents. */
export function MoonStarIcon({ size = 24, color, filled = false }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M20 14.5 A8 8 0 1 1 10.5 4.2 A6.2 6.2 0 0 0 20 14.5 Z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={filled ? 0 : 1.8}
        strokeLinejoin="round"
      />
      <Path d="M17.5 4 L18.4 6.1 L20.5 7 L18.4 7.9 L17.5 10 L16.6 7.9 L14.5 7 L16.6 6.1 Z" fill={color} />
    </Svg>
  );
}
