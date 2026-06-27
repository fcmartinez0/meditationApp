import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { EqualizerBars } from '@/components/EqualizerBars';
import type { SoundItem } from '@/components/SoundRow';
import { useThemeColors } from '@/hooks/useThemeColors';
import { categoryStyle, withAlpha } from '@/theme/categories';
import { radius, spacing } from '@/theme';

/** A grid card: a category-tinted gradient tile with a glossy sheen, title and
 *  hint. Selected gets a fuller gradient, an accent ring and a now-playing meter. */
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
      <View
        style={[
          styles.art,
          {
            borderColor: selected ? cat.accent : withAlpha(cat.accent, 0.18),
            borderWidth: selected ? 2 : 1,
          },
        ]}>
        <LinearGradient
          colors={[
            withAlpha(cat.colors[0], selected ? 0.42 : 0.18),
            withAlpha(cat.colors[1], selected ? 0.28 : 0.08),
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Glassy top sheen. */}
        <LinearGradient
          colors={[withAlpha('#FFFFFF', 0.18), 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.7 }}
          style={styles.sheen}
          pointerEvents="none"
        />
        <Ionicons name={item.icon} size={30} color={selected ? '#FFFFFF' : cat.accent} />
        {selected && (
          <View style={styles.eq}>
            <EqualizerBars color="#FFFFFF" />
          </View>
        )}
      </View>

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
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sheen: { position: 'absolute', left: 0, right: 0, top: 0, height: 46 },
  eq: { position: 'absolute', bottom: spacing.sm, right: spacing.sm },
  label: { marginTop: spacing.xs },
});
