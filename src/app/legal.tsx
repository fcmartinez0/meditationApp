import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { useThemeColors } from '@/hooks/useThemeColors';
import { spacing } from '@/theme';

// A peer-reviewed meta-analysis of binaural beats (Garcia-Argibay, Santed &
// Reales, 2019, Psychological Research). Linked from the wellness disclaimer so
// the claims are honest and the curious can read the evidence for themselves.
// Points to the free PubMed abstract rather than the paywalled publisher page.
const STUDY_URL = 'https://pubmed.ncbi.nlm.nih.gov/30073406/';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card style={styles.card}>
      <AppText variant="heading">{title}</AppText>
      {children}
    </Card>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <AppText variant="body" muted style={styles.p}>
      {children}
    </AppText>
  );
}

export default function LegalScreen() {
  const colors = useThemeColors();
  const router = useRouter();

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AppText variant="title">Privacy & Disclaimer</AppText>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <Section title="Your data stays on your device">
        <P>
          Stillness has no account and no server. Your settings, streak, session history and music
          preferences are stored only on this device, and are never sent anywhere.
        </P>
        <P>
          There is no tracking, advertising or analytics. We do not collect, share or sell any
          personal information.
        </P>
        <P>
          If you turn on the daily reminder, it is scheduled as a local notification on your device.
          Nothing is sent to us.
        </P>
        <P>You can erase everything anytime in Settings → Data → Reset all data.</P>
      </Section>

      <Section title="Wellness, not medical advice">
        <P>
          Stillness is for relaxation and general wellbeing. It is not a medical device and does not
          diagnose, treat or cure any condition.
        </P>
        <P>
          The frequency tracks use binaural beats, a popular wellness practice rather than
          established medical science, and the evidence is still mixed. One peer-reviewed
          meta-analysis did find a small-to-moderate effect on focus and anxiety, so if you are
          curious it is worth a read. Headphones help you hear the effect.
        </P>
        <Pressable
          onPress={() => void Linking.openURL(STUDY_URL)}
          accessibilityRole="link"
          accessibilityLabel="Read the binaural beats meta-analysis"
          style={styles.link}>
          <Ionicons name="open-outline" size={16} color={colors.accent} />
          <AppText variant="body" color={colors.accent}>
            Read the research
          </AppText>
        </Pressable>
        <P>
          If you have epilepsy, a heart condition or other health concerns, please consult a
          professional before use. Do not use while driving or operating machinery.
        </P>
        <P>Protect your hearing by keeping the volume at a comfortable level.</P>
      </Section>

      <AppText variant="caption" muted center style={styles.footer}>
        Stillness · v1.0
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  card: { gap: spacing.sm },
  p: { lineHeight: 22 },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  footer: { marginTop: spacing.sm },
});
