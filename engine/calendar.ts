/**
 * Working-time arithmetic over a compiled calendar.
 *
 * Everything else in the engine depends on the correctness of this module.
 * All operations are expressed on {@link WorkMoment} values and working minutes;
 * no JavaScript `Date` objects are involved.
 */

import { addDays, weekdayIndex } from './date-utils';
import type {
  CalendarConfig,
  CalendarException,
  Interval,
  IsoDate,
  SnapReason,
  WorkMoment,
} from './types';
import { compareMoments } from './types';

/** Hard cap for day scans, protects against "all days off" configurations. */
export const MAX_SCAN_DAYS = 3660;

/** Thrown when a scan exceeds {@link MAX_SCAN_DAYS} without finding working time. */
export class NoWorkingTimeError extends Error {
  /** Id of the calendar that produced the failed scan. */
  readonly calendarId: string;

  /**
   * @param calendarId - Id of the calendar without reachable working time.
   */
  constructor(calendarId: string) {
    super(`Calendar ${calendarId} has no reachable working time within ${MAX_SCAN_DAYS} days`);
    this.calendarId = calendarId;
  }
}

/** Details of why a specific day deviates from plain weekday working time. */
export interface DayResolution {
  intervals: Interval[];
  /** Which layer produced the result. */
  source: 'absence' | 'exception' | 'baseException' | 'week';
  exceptionName?: string;
}

/**
 * A calendar compiled for fast per-day lookups and working-time arithmetic.
 */
export interface CompiledCalendar {
  id: string;
  /** Working intervals of a given day after applying all resolution layers. */
  workingIntervals(date: IsoDate): Interval[];
  /** Resolution details of a given day (used by explanations and shading). */
  resolveDay(date: IsoDate): DayResolution;
  /** Total working minutes of a day. */
  dayCapacity(date: IsoDate): number;
  /** True when the day has at least one working minute. */
  isWorkingDay(date: IsoDate): boolean;
  /** Snaps a moment forward into working time (identity if already inside). */
  nextWorkingMoment(m: WorkMoment): WorkMoment;
  /** Snaps a moment backward to a valid working end-boundary (identity if already valid). */
  prevWorkingMoment(m: WorkMoment): WorkMoment;
  /** Adds (n > 0) or subtracts (n < 0) working minutes. n === 0 returns the moment unchanged. */
  addWorkingMinutes(m: WorkMoment, minutes: number): WorkMoment;
  /** Working minutes in [a, b); negative when a is after b. */
  workingMinutesBetween(a: WorkMoment, b: WorkMoment): number;
  /** Classifies why a day/minute is non-working (for snap explanations). */
  classifySnapReason(m: WorkMoment): SnapReason | undefined;
  /**
   * Average full-day capacity of the weekly template in minutes
   * (used to convert "days" in the UI; 480 for a standard 8h day).
   */
  averageDayCapacity: number;
}

/** Sums the lengths of a list of intervals. */
function intervalsCapacity(intervals: Interval[]): number {
  let total = 0;
  for (const [start, end] of intervals) total += end - start;
  return total;
}

/**
 * Compiles a {@link CalendarConfig} into a memoizing lookup structure.
 * Resolution order per day: absence → own exception → base exception → weekday template.
 * @param config - Calendar definition (with optional `base` for inherited exceptions).
 * @returns A {@link CompiledCalendar} with all working-time operations.
 */
export function compileCalendar(config: CalendarConfig): CompiledCalendar {
  const exceptionsByDate = new Map<IsoDate, CalendarException>();
  for (const ex of config.exceptions) exceptionsByDate.set(ex.date, ex);
  const baseExceptionsByDate = new Map<IsoDate, CalendarException>();
  if (config.base) {
    for (const ex of config.base.exceptions) baseExceptionsByDate.set(ex.date, ex);
  }
  const absences = config.absences ?? [];
  const dayCache = new Map<IsoDate, DayResolution>();

  function resolveDay(date: IsoDate): DayResolution {
    const cached = dayCache.get(date);
    if (cached) return cached;
    let result: DayResolution | undefined;
    for (const absence of absences) {
      if (date >= absence.start && date <= absence.end) {
        result = { intervals: [], source: 'absence' };
        break;
      }
    }
    if (!result) {
      const own = exceptionsByDate.get(date);
      if (own) {
        result = {
          intervals: own.working ? (own.intervals ?? []) : [],
          source: 'exception',
          exceptionName: own.name,
        };
      }
    }
    if (!result) {
      const inherited = baseExceptionsByDate.get(date);
      if (inherited) {
        result = {
          intervals: inherited.working ? (inherited.intervals ?? []) : [],
          source: 'baseException',
          exceptionName: inherited.name,
        };
      }
    }
    if (!result) {
      const day = config.week[weekdayIndex(date)];
      result = { intervals: day.working ? day.intervals : [], source: 'week' };
    }
    dayCache.set(date, result);
    return result;
  }

  function workingIntervals(date: IsoDate): Interval[] {
    return resolveDay(date).intervals;
  }

  function dayCapacity(date: IsoDate): number {
    return intervalsCapacity(workingIntervals(date));
  }

  function isWorkingDay(date: IsoDate): boolean {
    return dayCapacity(date) > 0;
  }

  function nextWorkingMoment(m: WorkMoment): WorkMoment {
    let date = m.date;
    let minute = m.minute;
    for (let i = 0; i < MAX_SCAN_DAYS; i++) {
      for (const [start, end] of workingIntervals(date)) {
        if (minute < end) {
          return { date, minute: Math.max(minute, start) };
        }
      }
      date = addDays(date, 1);
      minute = 0;
    }
    throw new NoWorkingTimeError(config.id);
  }

  function prevWorkingMoment(m: WorkMoment): WorkMoment {
    let date = m.date;
    let minute = m.minute;
    for (let i = 0; i < MAX_SCAN_DAYS; i++) {
      const intervals = workingIntervals(date);
      for (let k = intervals.length - 1; k >= 0; k--) {
        const [start, end] = intervals[k];
        if (minute > start) {
          return { date, minute: Math.min(minute, end) };
        }
      }
      date = addDays(date, -1);
      minute = 1440;
    }
    throw new NoWorkingTimeError(config.id);
  }

  function addWorkingMinutes(m: WorkMoment, minutes: number): WorkMoment {
    if (minutes === 0) return m;
    if (minutes > 0) {
      let remaining = minutes;
      let cur = nextWorkingMoment(m);
      for (let i = 0; i < MAX_SCAN_DAYS; i++) {
        for (const [start, end] of workingIntervals(cur.date)) {
          const from = Math.max(start, cur.minute);
          if (from >= end) continue;
          const available = end - from;
          if (remaining <= available) {
            return { date: cur.date, minute: from + remaining };
          }
          remaining -= available;
        }
        cur = { date: addDays(cur.date, 1), minute: 0 };
      }
      throw new NoWorkingTimeError(config.id);
    }
    let remaining = -minutes;
    let cur = prevWorkingMoment(m);
    for (let i = 0; i < MAX_SCAN_DAYS; i++) {
      const intervals = workingIntervals(cur.date);
      for (let k = intervals.length - 1; k >= 0; k--) {
        const [start, end] = intervals[k];
        const to = Math.min(end, cur.minute);
        if (to <= start) continue;
        const available = to - start;
        if (remaining <= available) {
          return { date: cur.date, minute: to - remaining };
        }
        remaining -= available;
      }
      cur = { date: addDays(cur.date, -1), minute: 1440 };
    }
    throw new NoWorkingTimeError(config.id);
  }

  function workingMinutesBetween(a: WorkMoment, b: WorkMoment): number {
    const order = compareMoments(a, b);
    if (order === 0) return 0;
    if (order > 0) return -workingMinutesBetween(b, a);
    let total = 0;
    let date = a.date;
    while (date <= b.date) {
      const lower = date === a.date ? a.minute : 0;
      const upper = date === b.date ? b.minute : 1440;
      for (const [start, end] of workingIntervals(date)) {
        const from = Math.max(start, lower);
        const to = Math.min(end, upper);
        if (to > from) total += to - from;
      }
      if (date === b.date) break;
      date = addDays(date, 1);
    }
    return total;
  }

  function classifySnapReason(m: WorkMoment): SnapReason | undefined {
    const day = resolveDay(m.date);
    for (const [start, end] of day.intervals) {
      if (m.minute >= start && m.minute < end) return undefined;
    }
    if (day.source === 'absence') return 'absence';
    if (day.source === 'exception' || day.source === 'baseException') {
      return day.intervals.length > 0 ? 'outsideHours' : 'exception';
    }
    if (day.intervals.length > 0) return 'outsideHours';
    const weekday = weekdayIndex(m.date);
    return weekday >= 5 ? 'weekend' : 'outsideHours';
  }

  let templateCapacity = 0;
  let workingDays = 0;
  for (const day of config.week) {
    if (day.working) {
      templateCapacity += intervalsCapacity(day.intervals);
      workingDays += 1;
    }
  }

  return {
    id: config.id,
    workingIntervals,
    resolveDay,
    dayCapacity,
    isWorkingDay,
    nextWorkingMoment,
    prevWorkingMoment,
    addWorkingMinutes,
    workingMinutesBetween,
    classifySnapReason,
    averageDayCapacity: workingDays > 0 ? Math.round(templateCapacity / workingDays) : 480,
  };
}

/**
 * The default work week used across the app: Monday–Friday, 08:00–12:00 and 13:00–17:00.
 */
export const DEFAULT_WEEK = [
  { working: true, intervals: [[480, 720], [780, 1020]] as Interval[] },
  { working: true, intervals: [[480, 720], [780, 1020]] as Interval[] },
  { working: true, intervals: [[480, 720], [780, 1020]] as Interval[] },
  { working: true, intervals: [[480, 720], [780, 1020]] as Interval[] },
  { working: true, intervals: [[480, 720], [780, 1020]] as Interval[] },
  { working: false, intervals: [] as Interval[] },
  { working: false, intervals: [] as Interval[] },
];
