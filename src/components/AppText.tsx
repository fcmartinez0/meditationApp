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
  { fontSize: number; fontWeight: TextProps['style'] extends never ? never : any; letterSpacing?: number; maxScale: number }
> = {
  // maxScale honors iOS/Android Dynamic Type for readability while capping how
  // far each variant can grow, so large accessibility text sizes don't overflow
  // and break the layout. Big display/title text caps tighter (it's already
  // huge, e.g. the 52–76px session clock); body/caption scale further since
  // that's where extra legibility matters most for low-vision users.
  display: { fontSize: fontSize.display, fontWeight: '200', letterSpacing: 1, maxScale: 1.3 },
  title: { fontSize: fontSize.xxl, fontWeight: '700', maxScale: 1.4 },
  heading: { fontSize: fontSize.lg, fontWeight: '600', maxScale: 1.5 },
  body: { fontSize: fontSize.md, fontWeight: '400', maxScale: 1.8 },
  label: { fontSize: fontSize.sm, fontWeight: '600', letterSpacing: 0.5, maxScale: 1.6 },
  caption: { fontSize: fontSize.xs, fontWeight: '500', maxScale: 1.8 },
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
