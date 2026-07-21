import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, fromOrdinal, isValidIsoDate, toOrdinal, weekdayIndex } from '../date-utils';

describe('date-utils', () => {
  it('round-trips ordinals', () => {
    for (const iso of ['1970-01-01', '2000-02-29', '2026-07-21', '2099-12-31']) {
      expect(fromOrdinal(toOrdinal(iso))).toBe(iso);
    }
  });

  it('1970-01-01 is ordinal 0 and a Thursday', () => {
    expect(toOrdinal('1970-01-01')).toBe(0);
    expect(weekdayIndex('1970-01-01')).toBe(3);
  });

  it('computes Monday-first weekday indices', () => {
    expect(weekdayIndex('2026-07-20')).toBe(0); // Monday
    expect(weekdayIndex('2026-07-24')).toBe(4); // Friday
    expect(weekdayIndex('2026-07-26')).toBe(6); // Sunday
  });

  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // leap year
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01'); // non-leap
  });

  it('computes day differences', () => {
    expect(daysBetween('2026-07-20', '2026-07-27')).toBe(7);
    expect(daysBetween('2026-07-27', '2026-07-20')).toBe(-7);
  });

  it('validates ISO dates', () => {
    expect(isValidIsoDate('2026-07-21')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('21.07.2026')).toBe(false);
  });
});
