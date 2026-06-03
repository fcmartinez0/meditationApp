import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import {
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppData } from '@/store/AppData';
import { radius, spacing } from '@/theme';

const SLIDES: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'leaf-outline',
    title: 'Welcome to Stillness',
    body: 'A calm space to breathe, focus and rest — a few quiet minutes whenever you need them.',
  },
  {
    icon: 'musical-notes-outline',
    title: 'Sound that fits your mood',
    body: 'Ambient beds, brainwave frequencies, artist-style beats, or music composed live that learns what you like.',
  },
  {
    icon: 'flame-outline',
    title: 'Build a gentle habit',
    body: 'Track your streak and minutes, set an optional daily reminder, and let it grow at your pace.',
  },
];

const { width } = Dimensions.get('window');

/** One-time first-run intro shown until completed. */
export function Onboarding() {
  const colors = useThemeColors();
  const { updateSettings } = useAppData();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const complete = () => void updateSettings({ onboarded: true });

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const next = () => {
    if (index >= SLIDES.length - 1) complete();
    else scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
  };

  return (
    <View style={styles.overlay}>
      <LinearGradient colors={colors.gradient} style={styles.fill}>
        <SafeAreaView style={styles.fill}>
          <Pressable onPress={complete} hitSlop={12} style={styles.skip}>
            <AppText variant="label" muted>
              Skip
            </AppText>
          </Pressable>

          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            style={styles.fill}>
            {SLIDES.map((s) => (
              <View key={s.title} style={[styles.slide, { width }]}>
                <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
                  <Ionicons name={s.icon} size={56} color={colors.accent} />
                </View>
                <AppText variant="title" center>
                  {s.title}
                </AppText>
                <AppText variant="body" muted center>
                  {s.body}
                </AppText>
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.dots}>
              {SLIDES.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    { backgroundColor: i === index ? colors.accent : colors.border, width: i === index ? 20 : 8 },
                  ]}
                />
              ))}
            </View>
            <Button label={index >= SLIDES.length - 1 ? 'Get started' : 'Next'} onPress={next} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 },
  fill: { flex: 1 },
  skip: { position: 'absolute', top: spacing.sm, right: spacing.xl, zIndex: 10, padding: spacing.sm },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: { height: 8, borderRadius: radius.pill },
});
