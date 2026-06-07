import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import type { AmbientSound } from '@/lib/types';
import { categoryStyle } from '@/theme/categories';
import { radius, spacing } from '@/theme';

/** A large "featured today" hero card at the top of the Meditate screen. */
export function FeaturedCard({
  accentKey,
  icon,
  label,
  blurb,
  onPress,
  onPlay,
}: {
  accentKey: AmbientSound;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  blurb: string;
  onPress: () => void;
  onPlay: () => void;
}) {
  const cat = categoryStyle(accentKey);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Featured: ${label}`}
      style={({ pressed }) => [styles.wrap, { transform: [{ scale: pressed ? 0.99 : 1 }] }]}>
      <LinearGradient colors={cat.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.top}>
          <AppText variant="label" color="rgba(255,255,255,0.85)">
            FEATURED TODAY
          </AppText>
          <Ionicons name={icon} size={24} color="rgba(255,255,255,0.9)" />
        </View>
        <View style={styles.bottom}>
          <View style={styles.text}>
            <AppText variant="title" color="#FFFFFF" numberOfLines={1}>
              {label}
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.88)" numberOfLines={2}>
              {blurb}
            </AppText>
          </View>
          <Pressable
            onPress={onPlay}
            accessibilityRole="button"
            accessibilityLabel={`Begin ${label}`}
            hitSlop={10}
            style={({ pressed }) => [styles.play, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
            <Ionicons name="play" size={22} color={cat.accent} />
          </Pressable>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm },
  card: {
    height: 168,
    borderRadius: radius.lg,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  text: { flex: 1, gap: spacing.xs },
  play: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
