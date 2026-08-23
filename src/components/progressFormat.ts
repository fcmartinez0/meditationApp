/** Small formatters shared by the Progress screen's sections. */

import { dayKey, daysBetween, formatTime } from '@/lib/date';

/** "45m" / "1h 05m" — compact durations for stats and chart summaries. */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, '0')}m`;
}

/** Spoken form of a duration, for screen readers ("1 hour 5 minutes"). */
export function spokenMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  const h = `${hours} hour${hours === 1 ? '' : 's'}`;
  return rest === 0 ? h : `${h} ${rest} minute${rest === 1 ? '' : 's'}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * "Today" / "Yesterday" / "Thu 21 Aug" — a day key relative to today. Falls back
 * to the raw key if the stored day isn't parseable.
 */
export function relativeDay(day: string, now: Date = new Date()): string {
  let gap: number;
  try {
    gap = daysBetween(dayKey(now), day);
  } catch {
    return day;
  }
  if (!Number.isFinite(gap)) return day;
  if (gap === 0) return 'Today';
  if (gap === 1) return 'Yesterday';
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Wall-clock time a session ended, e.g. "9:42 PM". */
export function clockOf(endedAt: number): string {
  const d = new Date(endedAt);
  if (Number.isNaN(d.getTime())) return '';
  return formatTime(d.getHours(), d.getMinutes());
}
