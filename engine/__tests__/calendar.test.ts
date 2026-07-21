import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compileCalendar, NoWorkingTimeError } from '../calendar';
import type { WorkMoment } from '../types';
import { stdCalendar } from './helpers';

const cal = compileCalendar(stdCalendar());

describe('calendar: day resolution', () => {
  it('resolves weekday templates', () => {
    expect(cal.workingIntervals('2026-07-20')).toEqual([[480, 720], [780, 1020]]);
    expect(cal.workingIntervals('2026-07-25')).toEqual([]); // Saturday
    expect(cal.dayCapacity('2026-07-20')).toBe(480);
    expect(cal.dayCapacity('2026-07-26')).toBe(0);
  });

  it('applies non-working exceptions (holidays)', () => {
    const withHoliday = compileCalendar(
      stdCalendar({
        exceptions: [{ date: '2026-07-22', working: false, name: 'Testfeiertag' }],
      }),
    );
    expect(withHoliday.dayCapacity('2026-07-22')).toBe(0);
    expect(withHoliday.resolveDay('2026-07-22').exceptionName).toBe('Testfeiertag');
  });

  it('applies half-day exceptions', () => {
    const halfDay = compileCalendar(
      stdCalendar({
        exceptions: [
          { date: '2026-07-24', working: true, intervals: [[480, 720]], name: 'Halber Tag' },
        ],
      }),
    );
    expect(halfDay.dayCapacity('2026-07-24')).toBe(240);
  });

  it('treats absences as non-working and with priority over exceptions', () => {
    const withAbsence = compileCalendar(
      stdCalendar({
        absences: [{ start: '2026-07-21', end: '2026-07-23', type: 'vacation' }],
        exceptions: [
          { date: '2026-07-22', working: true, intervals: [[480, 720]], name: 'Sondertag' },
        ],
      }),
    );
    expect(withAbsence.dayCapacity('2026-07-21')).toBe(0);
    expect(withAbsence.dayCapacity('2026-07-22')).toBe(0);
    expect(withAbsence.resolveDay('2026-07-22').source).toBe('absence');
    expect(withAbsence.dayCapacity('2026-07-24')).toBe(480);
  });

  it('inherits base-calendar exceptions but keeps own week template', () => {
    const resource = compileCalendar({
      id: 'cal-res',
      week: stdCalendar().week,
      exceptions: [],
      base: stdCalendar({
        exceptions: [{ date: '2026-07-23', working: false, name: 'Betriebsferien' }],
      }),
    });
    expect(resource.dayCapacity('2026-07-23')).toBe(0);
    expect(resource.resolveDay('2026-07-23').source).toBe('baseException');
  });
});

describe('calendar: snapping', () => {
  it('snaps into the current interval, next interval and next day', () => {
    expect(cal.nextWorkingMoment({ date: '2026-07-20', minute: 500 })).toEqual({ date: '2026-07-20', minute: 500 });
    expect(cal.nextWorkingMoment({ date: '2026-07-20', minute: 300 })).toEqual({ date: '2026-07-20', minute: 480 });
    expect(cal.nextWorkingMoment({ date: '2026-07-20', minute: 730 })).toEqual({ date: '2026-07-20', minute: 780 });
    expect(cal.nextWorkingMoment({ date: '2026-07-25', minute: 600 })).toEqual({ date: '2026-07-27', minute: 480 });
  });

  it('snaps backwards to valid end boundaries', () => {
    expect(cal.prevWorkingMoment({ date: '2026-07-20', minute: 1020 })).toEqual({ date: '2026-07-20', minute: 1020 });
    expect(cal.prevWorkingMoment({ date: '2026-07-27', minute: 480 })).toEqual({ date: '2026-07-24', minute: 1020 });
    expect(cal.prevWorkingMoment({ date: '2026-07-20', minute: 750 })).toEqual({ date: '2026-07-20', minute: 720 });
  });

  it('classifies snap reasons', () => {
    expect(cal.classifySnapReason({ date: '2026-07-25', minute: 600 })).toBe('weekend');
    expect(cal.classifySnapReason({ date: '2026-07-20', minute: 300 })).toBe('outsideHours');
    expect(cal.classifySnapReason({ date: '2026-07-20', minute: 500 })).toBeUndefined();
    const withHoliday = compileCalendar(
      stdCalendar({ exceptions: [{ date: '2026-07-22', working: false, name: 'Feiertag' }] }),
    );
    expect(withHoliday.classifySnapReason({ date: '2026-07-22', minute: 500 })).toBe('exception');
  });
});

describe('calendar: working-minute arithmetic', () => {
  it('adds a full day within one day', () => {
    expect(cal.addWorkingMinutes({ date: '2026-07-20', minute: 480 }, 480)).toEqual({
      date: '2026-07-20',
      minute: 1020,
    });
  });

  it('adds 8h from Friday 16:00 across the weekend', () => {
    expect(cal.addWorkingMinutes({ date: '2026-07-24', minute: 960 }, 480)).toEqual({
      date: '2026-07-27',
      minute: 960,
    });
  });

  it('adds across a mid-span holiday', () => {
    const withHoliday = compileCalendar(
      stdCalendar({ exceptions: [{ date: '2026-07-22', working: false, name: 'Feiertag' }] }),
    );
    expect(withHoliday.addWorkingMinutes({ date: '2026-07-20', minute: 480 }, 1440)).toEqual({
      date: '2026-07-23',
      minute: 1020,
    });
  });

  it('subtracts working minutes across the weekend', () => {
    expect(cal.addWorkingMinutes({ date: '2026-07-27', minute: 480 }, -60)).toEqual({
      date: '2026-07-24',
      minute: 960,
    });
  });

  it('returns the moment unchanged for zero minutes', () => {
    const m: WorkMoment = { date: '2026-07-25', minute: 600 };
    expect(cal.addWorkingMinutes(m, 0)).toEqual(m);
  });

  it('computes workingMinutesBetween symmetrically', () => {
    const a: WorkMoment = { date: '2026-07-20', minute: 480 };
    const b: WorkMoment = { date: '2026-07-27', minute: 960 };
    // Mon 20 full (480) + Tue–Fri (1920) + Mon 27 until 16:00 (420)
    expect(cal.workingMinutesBetween(a, b)).toBe(2820);
    expect(cal.workingMinutesBetween(b, a)).toBe(-cal.workingMinutesBetween(a, b));
    expect(cal.workingMinutesBetween(a, a)).toBe(0);
  });

  it('throws NoWorkingTimeError for a zero-working week', () => {
    const dead = compileCalendar(
      stdCalendar({ week: Array.from({ length: 7 }, () => ({ working: false, intervals: [] })) }),
    );
    expect(() => dead.nextWorkingMoment({ date: '2026-07-20', minute: 0 })).toThrow(NoWorkingTimeError);
  });

  it('is DST-free by design: arithmetic over the March DST weekend equals any other weekend', () => {
    // Europe/Berlin switches on 2026-03-29 (Sunday). The engine must not care.
    const fridayBefore = cal.addWorkingMinutes({ date: '2026-03-27', minute: 1020 }, 480);
    expect(fridayBefore).toEqual({ date: '2026-03-30', minute: 1020 });
  });

  it('property: workingMinutesBetween inverts addWorkingMinutes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 365 }),
        fc.integer({ min: 0, max: 1439 }),
        fc.integer({ min: 1, max: 10000 }),
        (dayOffset, minute, n) => {
          const start: WorkMoment = {
            date: cal.addWorkingMinutes({ date: '2026-01-05', minute: 0 }, dayOffset * 7).date,
            minute,
          };
          const a = cal.nextWorkingMoment(start);
          const b = cal.addWorkingMinutes(a, n);
          expect(cal.workingMinutesBetween(a, b)).toBe(n);
        },
      ),
      { numRuns: 200 },
    );
  });
});
