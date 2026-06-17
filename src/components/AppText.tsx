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

const VARIANTS: Record<Variant, { fontSize: number; fontWeight: TextProps['style'] extends never ? never : any; letterSpacing?: number }> = {
  display: { fontSize: fontSize.display, fontWeight: '200', letterSpacing: 1 },
  title: { fontSize: fontSize.xxl, fontWeight: '700' },
  heading: { fontSize: fontSize.lg, fontWeight: '600' },
  body: { fontSize: fontSize.md, fontWeight: '400' },
  label: { fontSize: fontSize.sm, fontWeight: '600', letterSpacing: 0.5 },
  caption: { fontSize: fontSize.xs, fontWeight: '500' },
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
      // Callers can still override via props (spread after this).
      accessibilityRole={variant === 'title' || variant === 'heading' ? 'header' : undefined}
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
