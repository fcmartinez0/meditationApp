/** Local daily-reminder notifications via expo-notifications. */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const REMINDER_ID = 'daily-meditation-reminder';
const ANDROID_CHANNEL = 'reminders';

const REMINDER_MESSAGES = [
  'Time to breathe. A few quiet minutes are waiting for you.',
  'Your moment of calm is here. Ready to sit?',
  'Pause, breathe, and return to center.',
  'A little stillness goes a long way. Shall we begin?',
];

// Show reminders even while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: 'Daily reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

/** Asks for permission, returning whether it was granted. */
export async function requestPermission(): Promise<boolean> {
  await ensureAndroidChannel();
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;
  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
}

export async function getPermissionGranted(): Promise<boolean> {
  const status = await Notifications.getPermissionsAsync();
  return status.granted;
}

/** (Re)schedules a repeating daily reminder at the given local time. */
export async function scheduleDailyReminder(hour: number, minute: number): Promise<void> {
  await ensureAndroidChannel();
  await cancelDailyReminder();
  const body = REMINDER_MESSAGES[Math.floor(Math.random() * REMINDER_MESSAGES.length)];
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: 'Meditation reminder',
      body,
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: ANDROID_CHANNEL,
    },
  });
}

export async function cancelDailyReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  } catch {
    // No existing reminder scheduled — nothing to cancel.
  }
}
