import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatTime } from '@/lib/date';
import {
  cancelDailyReminder,
  getPermissionGranted,
  NOTIFICATIONS_SUPPORTED,
  requestPermission,
  scheduleDailyReminder,
} from '@/lib/notifications';
import { clearRatings, loadRatings, summarizePreference } from '@/lib/preferences';
import type { PieceRating, TimerStyle } from '@/lib/types';
import { useAppData } from '@/store/AppData';
import { radius, spacing } from '@/theme';

const TIMER_STYLES: { value: TimerStyle; label: string }[] = [
  { value: 'orb', label: 'Breathing orb' },
  { value: 'tide', label: 'Tide' },
  { value: 'minimal', label: 'Minimal' },
];

/** A labelled row with a control on the right. */
function Row({ children, label, hint }: { children?: React.ReactNode; label: string; hint?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <AppText variant="body">{label}</AppText>
        {hint ? (
          <AppText variant="caption" muted>
            {hint}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { settings, updateSettings, resetData } = useAppData();
  const [busy, setBusy] = useState(false);
  const [ratings, setRatings] = useState<PieceRating[]>([]);

  const tap = () => Haptics.selectionAsync().catch(() => {});
  // Update a setting with a light tap of haptic feedback.
  const set = (patch: Parameters<typeof updateSettings>[0]) => {
    tap();
    void updateSettings(patch);
  };

  // Refresh learned-taste summaries whenever the screen comes into focus, and
  // reconcile the reminder toggle with the OS: if the user revoked notification
  // permission in system settings, flip our stored flag off and cancel the
  // schedule so the UI never claims a reminder is on while nothing will fire.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadRatings().then((r) => {
        if (active) setRatings(r);
      });
      if (NOTIFICATIONS_SUPPORTED && settings.reminderEnabled) {
        void getPermissionGranted().then((granted) => {
          if (active && !granted) {
            void cancelDailyReminder();
            void updateSettings({ reminderEnabled: false });
          }
        });
      }
      return () => {
        active = false;
      };
    }, [settings.reminderEnabled, updateSettings]),
  );

  const restTaste = summarizePreference('rest', ratings);
  const chillTaste = summarizePreference('chill', ratings);

  const confirmResetTaste = () => {
    Alert.alert('Reset learned taste?', 'The generative music will start fresh.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => void clearRatings().then(() => setRatings([])),
      },
    ]);
  };

  const reschedule = async (hour: number, minute: number) => {
    await scheduleDailyReminder(hour, minute);
  };

  const onToggleReminder = async (enabled: boolean) => {
    if (busy) return;
    tap();
    setBusy(true);
    try {
      if (enabled) {
        const granted = await requestPermission();
        if (!granted) {
          Alert.alert(
            'Notifications disabled',
            'Enable notifications for this app in your device settings to receive reminders.',
          );
          return;
        }
        await reschedule(settings.reminderHour, settings.reminderMinute);
        await updateSettings({ reminderEnabled: true });
      } else {
        await cancelDailyReminder();
        await updateSettings({ reminderEnabled: false });
      }
    } finally {
      setBusy(false);
    }
  };

  // One control for the whole time: step by 15 minutes, carrying into hours.
  const adjustTime = async (deltaMinutes: number) => {
    tap();
    const total = (settings.reminderHour * 60 + settings.reminderMinute + deltaMinutes + 1440) % 1440;
    const hour = Math.floor(total / 60);
    const minute = total % 60;
    await updateSettings({ reminderHour: hour, reminderMinute: minute });
    if (settings.reminderEnabled) await reschedule(hour, minute);
  };

  const confirmReset = () => {
    Alert.alert('Reset all data?', 'This permanently clears your streak and session history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => void resetData() },
    ]);
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AppText variant="label" muted>
          PREFERENCES
        </AppText>
        <AppText variant="title">Settings</AppText>
      </View>

      <Card style={styles.card}>
        <Row
          label="Daily reminder"
          hint={NOTIFICATIONS_SUPPORTED ? 'A gentle daily nudge' : 'Available in the iOS / Android app'}>
          <Switch
            value={settings.reminderEnabled && NOTIFICATIONS_SUPPORTED}
            onValueChange={onToggleReminder}
            disabled={busy || !NOTIFICATIONS_SUPPORTED}
            trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
            thumbColor={Platform.OS === 'android' ? colors.surface : undefined}
          />
        </Row>
        <Row label="Reminder time">
          <View style={styles.timeAdjust}>
            <Pressable
              onPress={() => adjustTime(-15)}
              style={styles.stepBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Reminder fifteen minutes earlier">
              <Ionicons name="remove-circle-outline" size={26} color={colors.accent} />
            </Pressable>
            <AppText variant="heading" style={styles.timeLabel}>
              {formatTime(settings.reminderHour, settings.reminderMinute)}
            </AppText>
            <Pressable
              onPress={() => adjustTime(15)}
              style={styles.stepBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Reminder fifteen minutes later">
              <Ionicons name="add-circle-outline" size={26} color={colors.accent} />
            </Pressable>
          </View>
        </Row>
      </Card>

      <Card style={styles.card}>
        <Row label="Volume">
          <View style={styles.timeAdjust}>
            <Pressable
              onPress={() => set({ volume: Math.max(0, Math.round((settings.volume - 0.1) * 10) / 10) })}
              style={styles.stepBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Volume down">
              <Ionicons name="volume-low-outline" size={24} color={colors.accent} />
            </Pressable>
            <View style={[styles.volumeTrack, { backgroundColor: colors.surfaceMuted }]}>
              <View
                style={[styles.volumeFill, { backgroundColor: colors.accent, width: `${settings.volume * 100}%` }]}
              />
            </View>
            <Pressable
              onPress={() => set({ volume: Math.min(1, Math.round((settings.volume + 0.1) * 10) / 10) })}
              style={styles.stepBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Volume up">
              <Ionicons name="volume-high-outline" size={24} color={colors.accent} />
            </Pressable>
          </View>
        </Row>
        <Row
          label="Play over my music"
          hint="Keep your own music playing underneath, instead of taking over audio">
          <Switch
            value={settings.mixWithMusic}
            onValueChange={(v) => set({ mixWithMusic: v })}
            trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
            thumbColor={Platform.OS === 'android' ? colors.surface : undefined}
          />
        </Row>
        <AppText variant="body">Session visual</AppText>
        <View style={styles.chipWrap}>
          {TIMER_STYLES.map((opt) => {
            const selected = settings.timerStyle === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => set({ timerStyle: opt.value })}
                style={[
                  styles.intervalChip,
                  { backgroundColor: selected ? colors.accent : colors.surfaceMuted },
                ]}>
                <AppText variant="caption" color={selected ? colors.textOnAccent : colors.text}>
                  {opt.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={styles.card}>
        <AppText variant="caption" muted>
          What the live music has learned from your likes.
        </AppText>
        <Row label="Rest" hint={restTaste ?? 'No ratings yet. Like a Rest piece to get started.'} />
        <Row label="Flow" hint={chillTaste ?? 'No ratings yet. Like a Flow piece to get started.'} />
        {(restTaste || chillTaste) && (
          <Pressable onPress={confirmResetTaste} style={styles.resetRow}>
            <Ionicons name="refresh-outline" size={20} color={colors.textSecondary} />
            <AppText variant="body" muted>
              Reset what I&apos;ve learned
            </AppText>
          </Pressable>
        )}
      </Card>

      <Card style={styles.card}>
        <Pressable onPress={confirmReset} style={styles.resetRow}>
          <Ionicons name="trash-outline" size={20} color="#E5484D" />
          <AppText variant="body" color="#E5484D">
            Reset all data
          </AppText>
        </Pressable>
      </Card>

      <Card style={styles.card}>
        <Pressable onPress={() => router.push('/legal')} style={styles.aboutRow}>
          <AppText variant="body" style={{ flex: 1 }}>
            Privacy & disclaimer
          </AppText>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </Pressable>
      </Card>

      <AppText variant="caption" muted center style={styles.footer}>
        Stillness · v1.0
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, marginTop: spacing.sm },
  card: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  rowText: { flex: 1, gap: 2 },
  timeAdjust: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  volumeTrack: { width: 90, height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  volumeFill: { height: '100%', borderRadius: radius.pill },
  timeLabel: { minWidth: 96, textAlign: 'center' },
  stepBtn: { padding: spacing.xs },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  intervalChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  resetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  footer: { marginTop: spacing.sm },
});
