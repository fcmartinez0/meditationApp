import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { EqualizerBars } from '@/components/EqualizerBars';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { AmbientSound } from '@/lib/types';
import { categoryStyle, withAlpha } from '@/theme/categories';
import { radius, spacing } from '@/theme';

export interface SoundItem {
  key: AmbientSound;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  hint?: string;
}

/** An Apple-Music-style row: gradient "art", title/subtitle, and a now-playing indicator. */
export function SoundRow({
  item,
  selected,
  onPress,
}: {
  item: SoundItem;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const cat = categoryStyle(item.key);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected ? withAlpha(cat.accent, 0.14) : 'transparent',
          opacity: pressed ? 0.6 : 1,
        },
      ]}>
      <LinearGradient
        colors={cat.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.art}>
        <Ionicons name={item.icon} size={22} color="#FFFFFF" />
      </LinearGradient>

      <View style={styles.text}>
        <AppText variant="body" numberOfLines={1} color={selected ? cat.accent : colors.text}>
          {item.label}
        </AppText>
        {item.hint ? (
          <AppText variant="caption" muted numberOfLines={1}>
            {item.hint}
          </AppText>
        ) : null}
      </View>

      {selected && <EqualizerBars color={cat.accent} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  art: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
});
