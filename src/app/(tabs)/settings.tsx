import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatTime } from '@/lib/date';
import {
  cancelDailyReminder,
  requestPermission,
  scheduleDailyReminder,
} from '@/lib/notifications';
import { clearRatings, loadRatings, summarizePreference } from '@/lib/preferences';
import type { PieceRating } from '@/lib/types';
import { useAppData } from '@/store/AppData';
import { radius, spacing } from '@/theme';
import { CATEGORY_STYLES } from '@/theme/categories';

const INTERVALS = [
  { value: 0, label: 'Off' },
  { value: 1, label: '1 min' },
  { value: 2, label: '2 min' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
];

/** A labelled row with a control on the right. */
function Row({ children, label, hint }: { children: React.ReactNode; label: string; hint?: string }) {
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
  const { settings, updateSettings, resetData } = useAppData();
  const [busy, setBusy] = useState(false);
  const [ratings, setRatings] = useState<PieceRating[]>([]);

  // Refresh learned-taste summaries whenever the screen comes into focus.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadRatings().then((r) => {
        if (active) setRatings(r);
      });
      return () => {
        active = false;
      };
    }, []),
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

  const adjustTime = async (deltaHours: number, deltaMinutes: number) => {
    let hour = (settings.reminderHour + deltaHours + 24) % 24;
    let minute = settings.reminderMinute + deltaMinutes;
    if (minute >= 60) minute -= 60;
    if (minute < 0) minute += 60;
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
        <AppText variant="label" muted>
          DAILY REMINDER
        </AppText>
        <Row label="Remind me to meditate" hint="A gentle daily nudge">
          <Switch
            value={settings.reminderEnabled}
            onValueChange={onToggleReminder}
            disabled={busy}
            trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
            thumbColor={Platform.OS === 'android' ? colors.surface : undefined}
          />
        </Row>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Row label="Reminder time">
          <View style={styles.timeAdjust}>
            <Pressable onPress={() => adjustTime(-1, 0)} style={styles.stepBtn} hitSlop={8}>
              <Ionicons name="remove-circle-outline" size={26} color={colors.accent} />
            </Pressable>
            <AppText variant="heading" style={styles.timeLabel}>
              {formatTime(settings.reminderHour, settings.reminderMinute)}
            </AppText>
            <Pressable onPress={() => adjustTime(1, 0)} style={styles.stepBtn} hitSlop={8}>
              <Ionicons name="add-circle-outline" size={26} color={colors.accent} />
            </Pressable>
          </View>
        </Row>
        <View style={styles.minuteRow}>
          <Pressable onPress={() => adjustTime(0, -5)} style={styles.minuteBtn}>
            <AppText variant="caption" color={colors.accent}>
              −5 min
            </AppText>
          </Pressable>
          <Pressable onPress={() => adjustTime(0, 5)} style={styles.minuteBtn}>
            <AppText variant="caption" color={colors.accent}>
              +5 min
            </AppText>
          </Pressable>
        </View>
      </Card>

      <Card style={styles.card}>
        <AppText variant="label" muted>
          BELLS
        </AppText>
        <Row label="Starting bell" hint="Ring when a session begins">
          <Switch
            value={settings.startBell}
            onValueChange={(v) => updateSettings({ startBell: v })}
            trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
            thumbColor={Platform.OS === 'android' ? colors.surface : undefined}
          />
        </Row>
        <Row label="Ending bell" hint="Ring when a session ends">
          <Switch
            value={settings.endBell}
            onValueChange={(v) => updateSettings({ endBell: v })}
            trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
            thumbColor={Platform.OS === 'android' ? colors.surface : undefined}
          />
        </Row>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <AppText variant="body">Interval bell</AppText>
        <AppText variant="caption" muted style={{ marginBottom: spacing.sm }}>
          Ring periodically during a session
        </AppText>
        <View style={styles.chipWrap}>
          {INTERVALS.map((opt) => {
            const selected = settings.intervalMin === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => updateSettings({ intervalMin: opt.value })}
                style={[
                  styles.intervalChip,
                  {
                    backgroundColor: selected ? colors.accent : colors.surfaceMuted,
                  },
                ]}>
                <AppText
                  variant="caption"
                  color={selected ? colors.textOnAccent : colors.text}>
                  {opt.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={styles.card}>
        <View style={styles.rowText}>
          <AppText variant="label" muted>
            GENERATIVE TASTE
          </AppText>
          <AppText variant="caption" muted>
            What the live music has learned from your likes.
          </AppText>
        </View>
        <Row label="Rest" hint={restTaste ?? 'No ratings yet — like a Rest piece to begin.'}>
          <Ionicons name="sparkles" size={18} color={CATEGORY_STYLES.generative.accent} />
        </Row>
        <Row label="Flow" hint={chillTaste ?? 'No ratings yet — like a Flow piece to begin.'}>
          <Ionicons name="infinite" size={18} color={CATEGORY_STYLES.generative.accent} />
        </Row>
        {(restTaste || chillTaste) && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Pressable onPress={confirmResetTaste} style={styles.resetRow}>
              <Ionicons name="refresh-outline" size={20} color={colors.textSecondary} />
              <AppText variant="body" muted>
                Reset what I&apos;ve learned
              </AppText>
            </Pressable>
          </>
        )}
      </Card>

      <Card style={styles.card}>
        <AppText variant="label" muted>
          DATA
        </AppText>
        <Pressable onPress={confirmReset} style={styles.resetRow}>
          <Ionicons name="trash-outline" size={20} color="#E5484D" />
          <AppText variant="body" color="#E5484D">
            Reset all data
          </AppText>
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
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
  timeAdjust: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  timeLabel: { minWidth: 96, textAlign: 'center' },
  stepBtn: { padding: spacing.xs },
  minuteRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  minuteBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  intervalChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  resetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  footer: { marginTop: spacing.sm },
});
