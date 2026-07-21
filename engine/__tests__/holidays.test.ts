import { describe, expect, it } from 'vitest';
import { easterSunday, germanHolidays } from '../holidays';

describe('german holidays', () => {
  it('computes Easter Sunday for known years', () => {
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });

  it('derives movable feasts from Easter (2026, Bayern)', () => {
    const dates = new Map(germanHolidays(2026, 'BY').map((h) => [h.name, h.date]));
    expect(dates.get('Karfreitag')).toBe('2026-04-03');
    expect(dates.get('Ostermontag')).toBe('2026-04-06');
    expect(dates.get('Christi Himmelfahrt')).toBe('2026-05-14');
    expect(dates.get('Pfingstmontag')).toBe('2026-05-25');
    expect(dates.get('Fronleichnam')).toBe('2026-06-04');
  });

  it('differentiates state-specific holidays', () => {
    const by = germanHolidays(2026, 'BY').map((h) => h.name);
    const be = germanHolidays(2026, 'BE').map((h) => h.name);
    const sn = germanHolidays(2026, 'SN').map((h) => h.name);
    expect(by).toContain('Heilige Drei Könige');
    expect(be).not.toContain('Heilige Drei Könige');
    expect(be).toContain('Internationaler Frauentag');
    expect(sn).toContain('Buß- und Bettag');
    expect(by).not.toContain('Reformationstag');
    expect(sn).toContain('Reformationstag');
  });

  it('computes Buß- und Bettag as the Wednesday before Nov 23', () => {
    const sn2025 = new Map(germanHolidays(2025, 'SN').map((h) => [h.name, h.date]));
    expect(sn2025.get('Buß- und Bettag')).toBe('2025-11-19');
  });

  it('returns holidays sorted by date', () => {
    const dates = germanHolidays(2026, 'NW').map((h) => h.date);
    expect([...dates].sort()).toEqual(dates);
  });
});
