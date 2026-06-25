import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from '@/components/AppText';
import { GlassFill } from '@/components/GlassFill';
import { useThemeColors } from '@/hooks/useThemeColors';
import { radius, spacing } from '@/theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  style?: ViewStyle;
}

/**
 * App button. Primary is a soft indigo gradient (depth + a clear CTA), secondary
 * is a glass surface (Liquid Glass on iOS 26, muted fill elsewhere), and ghost is
 * plain accent text. All share a pill shape, press scale, and a ≥44pt target.
 */
export function Button({ label, onPress, variant = 'primary', disabled, style }: ButtonProps) {
  const colors = useThemeColors();

  const textColor =
    variant === 'primary' ? colors.textOnAccent : colors.accent;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        variant === 'ghost' ? styles.ghost : styles.solid,
        {
          opacity: disabled ? 0.4 : pressed ? 0.9 : 1,
          transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
        },
        style,
      ]}>
      {variant === 'primary' ? (
        <LinearGradient
          colors={[colors.accentSoft, colors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : variant === 'secondary' ? (
        <GlassFill fallback={colors.surfaceMuted} radius={radius.pill} />
      ) : null}
      <View>
        <AppText variant="label" color={textColor} style={styles.label}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  solid: { overflow: 'hidden' },
  ghost: { paddingVertical: spacing.md },
  label: { fontSize: 16, textTransform: 'none', letterSpacing: 0.3, fontWeight: '600' },
});
