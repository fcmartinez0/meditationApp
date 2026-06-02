/** Derives streaks and progress metrics from raw session history. */

import { dayKey, daysBetween, mondayIndex, startOfWeekKey } from './date';
import type { SessionRecord, Stats } from './types';

/** Unique day keys that contain at least one session, most recent first. */
function activeDaysDesc(sessions: SessionRecord[]): string[] {
  const set = new Set(sessions.map((s) => s.day));
  return [...set].sort((a, b) => (a < b ? 1 : -1));
}

function computeStreaks(sessions: SessionRecord[]): { current: number; longest: number } {
  const days = activeDaysDesc(sessions);
  if (days.length === 0) return { current: 0, longest: 0 };

  // Current streak: counts back from today (or yesterday if today is empty).
  const today = dayKey();
  let current = 0;
  const gapFromToday = daysBetween(today, days[0]);
  if (gapFromToday <= 1) {
    current = 1;
    for (let i = 1; i < days.length; i++) {
      if (daysBetween(days[i - 1], days[i]) === 1) current++;
      else break;
    }
  }

  // Longest streak across all history.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (daysBetween(days[i - 1], days[i]) === 1) {
      run++;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }

  return { current, longest };
}

export function computeStats(sessions: SessionRecord[]): Stats {
  const { current, longest } = computeStreaks(sessions);

  const totalSeconds = sessions.reduce((sum, s) => sum + s.durationSec, 0);

  const weekStart = startOfWeekKey();
  const weekMinutes = [0, 0, 0, 0, 0, 0, 0];
  for (const s of sessions) {
    // Only this week's sessions contribute to the chart.
    const offset = daysBetweenSafe(s.day, weekStart);
    if (offset >= 0 && offset < 7) {
      weekMinutes[offset] += s.durationSec / 60;
    }
  }

  return {
    currentStreak: current,
    longestStreak: longest,
    totalSessions: sessions.length,
    totalMinutes: Math.round(totalSeconds / 60),
    weekMinutes: weekMinutes.map((m) => Math.round(m)),
    meditatedToday: sessions.some((s) => s.day === dayKey()),
  };
}

function daysBetweenSafe(day: string, weekStart: string): number {
  try {
    return daysBetween(day, weekStart);
  } catch {
    return -1;
  }
}

/** Index (Mon=0) of today, handy for highlighting the chart. */
export function todayWeekIndex(): number {
  return mondayIndex();
}
