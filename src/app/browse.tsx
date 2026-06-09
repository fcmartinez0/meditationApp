import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { FeaturedCard } from '@/components/FeaturedCard';
import { SoundCard } from '@/components/SoundCard';
import { useThemeColors } from '@/hooks/useThemeColors';
import { SECTIONS, featuredToday } from '@/lib/catalog';
import type { AmbientSound } from '@/lib/types';
import { useAppData } from '@/store/AppData';
import { spacing } from '@/theme';

/** The full sound library — Apple-Music-style shelves, opened from the home. */
export default function BrowseScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { settings, updateSettings } = useAppData();

  const featured = featuredToday();

  // Pick a sound and return to the calm home, ready to begin.
  const choose = (key: AmbientSound) => {
    Haptics.selectionAsync().catch(() => {});
    updateSettings({ ambient: key });
    router.back();
  };

  // Featured "play" starts a session straight away. Replace (not push) so
  // ending the session returns to the home, not back into this sheet.
  const beginWith = (key: AmbientSound) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    updateSettings({ ambient: key });
    router.replace({
      pathname: '/session',
      params: { duration: String(settings.durationMin), ambient: key },
    });
  };

  return (
    <LinearGradient colors={colors.gradient} style={styles.fill}>
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
          <FeaturedCard
            accentKey={featured.key}
            icon={featured.icon}
            label={featured.label}
            blurb={featured.blurb}
            onPress={() => choose(featured.key)}
            onPlay={() => beginWith(featured.key)}
          />

          {SECTIONS.map((section) => (
            <View key={section.title} style={styles.section}>
              <AppText variant="heading">{section.title}</AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.shelf}
                contentContainerStyle={styles.shelfContent}>
                {section.items.map((item) => (
                  <SoundCard
                    key={item.key}
                    item={item}
                    selected={settings.ambient === item.key}
                    onPress={() => choose(item.key)}
                  />
                ))}
              </ScrollView>
              {section.caption ? (
                <AppText variant="caption" muted>
                  {section.caption}
                </AppText>
              ) : null}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
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
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg },
  section: { gap: spacing.sm },
  shelf: { marginHorizontal: -spacing.xl },
  shelfContent: { paddingHorizontal: spacing.xl, gap: spacing.md },
});
