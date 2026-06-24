import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { SoundCard } from '@/components/SoundCard';
import { useThemeColors } from '@/hooks/useThemeColors';
import { SECTIONS } from '@/lib/catalog';
import type { AmbientSound } from '@/lib/types';
import { useAppData } from '@/store/AppData';
import { spacing } from '@/theme';

/** The full sound library — a vertical grid, opened from the home. */
export default function BrowseScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { settings, updateSettings } = useAppData();

  // Pick a sound and return to the calm home, ready to begin.
  const choose = (key: AmbientSound) => {
    Haptics.selectionAsync().catch(() => {});
    updateSettings({ ambient: key });
    router.back();
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.fill} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <AppText variant="title">Sounds</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => router.back()}
            hitSlop={16}
            style={styles.close}>
            <Ionicons name="close" size={26} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {SECTIONS.map((section) => (
            <View key={section.title} style={styles.section}>
              <AppText variant="heading">{section.title}</AppText>
              {section.caption ? (
                <AppText variant="caption" muted>
                  {section.caption}
                </AppText>
              ) : null}
              <View style={styles.grid}>
                {section.items.map((item) => (
                  <View key={item.key} style={styles.cell}>
                    <SoundCard
                      item={item}
                      selected={settings.ambient === item.key}
                      onPress={() => choose(item.key)}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.xl },
  section: { gap: spacing.sm },
  // Two-column vertical grid — no horizontal scrolling.
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  cell: { width: '47%' },
});
