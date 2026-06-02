import { dayKey } from '@/lib/date';
import { computeStats } from '@/lib/stats';
import type { AmbientSound, SessionRecord } from '@/lib/types';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayKey(d);
}

function session(day: string, durationSec = 600, completed = true): SessionRecord {
  return { endedAt: Date.now(), day, durationSec, completed, ambient: 'none' as AmbientSound };
}

describe('computeStats', () => {
  it('returns zeros for no sessions', () => {
    const s = computeStats([]);
    expect(s.currentStreak).toBe(0);
    expect(s.longestStreak).toBe(0);
    expect(s.totalSessions).toBe(0);
    expect(s.totalMinutes).toBe(0);
    expect(s.meditatedToday).toBe(false);
  });

  it('counts a current streak ending today', () => {
    const s = computeStats([session(daysAgo(0)), session(daysAgo(1)), session(daysAgo(2))]);
    expect(s.currentStreak).toBe(3);
    expect(s.longestStreak).toBe(3);
    expect(s.meditatedToday).toBe(true);
  });

  it('keeps the streak alive if today is empty but yesterday is not', () => {
    const s = computeStats([session(daysAgo(1)), session(daysAgo(2))]);
    expect(s.currentStreak).toBe(2);
    expect(s.meditatedToday).toBe(false);
  });

  it('breaks the current streak after a gap but remembers the longest', () => {
    const s = computeStats([
      session(daysAgo(0)), // today
      session(daysAgo(3)), // gap
      session(daysAgo(4)),
      session(daysAgo(5)),
    ]);
    expect(s.currentStreak).toBe(1);
    expect(s.longestStreak).toBe(3);
  });

  it('treats multiple sessions in one day as a single streak day', () => {
    const s = computeStats([session(daysAgo(0)), session(daysAgo(0)), session(daysAgo(1))]);
    expect(s.currentStreak).toBe(2);
    expect(s.totalSessions).toBe(3);
  });

  it('sums total minutes (rounded)', () => {
    const s = computeStats([session(daysAgo(0), 600), session(daysAgo(1), 300)]);
    expect(s.totalMinutes).toBe(15);
  });
});
