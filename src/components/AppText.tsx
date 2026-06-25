import { Text, type TextProps } from 'react-native';

import { useThemeColors } from '@/hooks/useThemeColors';
import { fontSize, fonts } from '@/theme';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';

interface AppTextProps extends TextProps {
  variant?: Variant;
  /** Use the secondary (muted) text color. */
  muted?: boolean;
  /** Override color entirely. */
  color?: string;
  center?: boolean;
}

const VARIANTS: Record<
  Variant,
  { fontSize: number; fontWeight: TextProps['style'] extends never ? never : any; lineHeight: number; letterSpacing?: number; maxScale: number }
> = {
  // maxScale honors iOS/Android Dynamic Type for readability while capping how
  // far each variant can grow, so large accessibility text sizes don't overflow
  // and break the layout. lineHeight is set per variant so multi-line body and
  // captions read comfortably rather than cramped.
  display: { fontSize: fontSize.display, fontWeight: '200', lineHeight: 62, letterSpacing: 1, maxScale: 1.3 },
  title: { fontSize: fontSize.xxl, fontWeight: '700', lineHeight: 40, maxScale: 1.4 },
  heading: { fontSize: fontSize.lg, fontWeight: '600', lineHeight: 26, maxScale: 1.5 },
  body: { fontSize: fontSize.md, fontWeight: '400', lineHeight: 23, maxScale: 1.8 },
  label: { fontSize: fontSize.sm, fontWeight: '600', lineHeight: 18, letterSpacing: 0.6, maxScale: 1.6 },
  caption: { fontSize: 13, fontWeight: '500', lineHeight: 18, maxScale: 1.8 },
};

export function AppText({
  variant = 'body',
  muted = false,
  color,
  center = false,
  style,
  ...rest
}: AppTextProps) {
  const colors = useThemeColors();
  const v = VARIANTS[variant];
  return (
    <Text
      // Section/screen titles act as headers so VoiceOver can navigate by them.
      // maxFontSizeMultiplier caps Dynamic Type growth per variant. Both are set
      // before {...rest} so callers can still override either.
      accessibilityRole={variant === 'title' || variant === 'heading' ? 'header' : undefined}
      maxFontSizeMultiplier={v.maxScale}
      {...rest}
      style={[
        {
          fontSize: v.fontSize,
          fontWeight: v.fontWeight,
          lineHeight: v.lineHeight,
          letterSpacing: v.letterSpacing,
          color: color ?? (muted ? colors.textSecondary : colors.text),
          fontFamily: fonts.rounded,
          textAlign: center ? 'center' : undefined,
        },
        style,
      ]}
    />
  );
}
