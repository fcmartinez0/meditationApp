import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { EqualizerBars } from '@/components/EqualizerBars';
import type { SoundItem } from '@/components/SoundRow';
import { useThemeColors } from '@/hooks/useThemeColors';
import { categoryStyle } from '@/theme/categories';
import { radius, spacing } from '@/theme';

/** A grid card: a gradient "art" tile with title + hint. Fills its cell. */
export function SoundCard({
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
      accessibilityLabel={item.hint ? `${item.label}. ${item.hint}` : item.label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.card, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      <LinearGradient
        colors={cat.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.art, selected && styles.artSelected]}>
        <Ionicons name={item.icon} size={30} color="#FFFFFF" />
        {selected && (
          <View style={styles.eq}>
            <EqualizerBars color="#FFFFFF" />
          </View>
        )}
      </LinearGradient>

      <AppText variant="body" numberOfLines={1} color={selected ? cat.accent : colors.text} style={styles.label}>
        {item.label}
      </AppText>
      {item.hint ? (
        <AppText variant="caption" muted numberOfLines={2}>
          {item.hint}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', gap: spacing.xs },
  art: {
    width: '100%',
    height: 92,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  artSelected: { borderWidth: 2, borderColor: '#FFFFFF' },
  eq: { position: 'absolute', bottom: spacing.sm, right: spacing.sm },
  label: { marginTop: spacing.xs },
});
