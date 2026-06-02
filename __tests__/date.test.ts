import {
  dayKey,
  daysBetween,
  formatClock,
  formatTime,
  mondayIndex,
} from '@/lib/date';

describe('dayKey', () => {
  it('formats a local calendar day as YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 5, 2))).toBe('2026-06-02');
    expect(dayKey(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
});

describe('daysBetween', () => {
  it('counts whole days between two day keys', () => {
    expect(daysBetween('2026-06-02', '2026-06-01')).toBe(1);
    expect(daysBetween('2026-06-01', '2026-06-02')).toBe(-1);
    expect(daysBetween('2026-06-08', '2026-06-01')).toBe(7);
    expect(daysBetween('2026-06-02', '2026-06-02')).toBe(0);
  });

  it('handles month boundaries', () => {
    expect(daysBetween('2026-07-01', '2026-06-30')).toBe(1);
  });
});

describe('mondayIndex', () => {
  it('maps Monday to 0 and Sunday to 6', () => {
    expect(mondayIndex(new Date(2026, 5, 1))).toBe(0); // 2026-06-01 is a Monday
    expect(mondayIndex(new Date(2026, 5, 7))).toBe(6); // Sunday
  });
});

describe('formatClock', () => {
  it('formats minutes:seconds and hours:minutes:seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(3661)).toBe('1:01:01');
  });

  it('never goes negative', () => {
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('formatTime', () => {
  it('formats 24h as friendly 12h', () => {
    expect(formatTime(0, 0)).toBe('12:00 AM');
    expect(formatTime(8, 5)).toBe('8:05 AM');
    expect(formatTime(12, 0)).toBe('12:00 PM');
    expect(formatTime(13, 30)).toBe('1:30 PM');
    expect(formatTime(23, 59)).toBe('11:59 PM');
  });
});
