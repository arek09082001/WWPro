/**
 * Pure helpers for editing working-time intervals: "HH:MM" ⇄ minute-of-day
 * conversion, validation/normalization of interval sets and display formatting.
 * Used by the calendar editors and the employee work-week card.
 */

import type { Interval, WeekDayConfig } from '@/engine/types';
import { formatMinuteOfDay } from '@/lib/format';

/** German weekday names, Monday-first (matches the engine's week indexing). */
export const WEEKDAYS_DE = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
] as const;

/** Parses an "HH:MM" time-input value into a minute-of-day; undefined for malformed input. */
export function timeToMinutes(value: string): number | undefined {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

/** Formats a minute-of-day as an "HH:MM" time-input value. */
export function minutesToTime(minute: number): string {
  return formatMinuteOfDay(minute);
}

/** Result of {@link normalizeIntervals}: sorted intervals or a German error message. */
export type NormalizeResult =
  | { ok: true; intervals: Interval[] }
  | { ok: false; error: string };

/**
 * Sorts a list of half-open intervals and validates that every interval ends
 * after it starts and that no two intervals overlap (touching is allowed).
 * @param intervals - Unordered candidate intervals in minutes-of-day.
 * @returns The sorted intervals, or a German validation error.
 */
export function normalizeIntervals(intervals: Interval[]): NormalizeResult {
  const sorted = intervals
    .map(([start, end]) => [start, end] as Interval)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [start, end] of sorted) {
    if (end <= start) {
      return {
        ok: false,
        error: `Das Ende (${minutesToTime(end)}) muss nach dem Beginn (${minutesToTime(start)}) liegen.`,
      };
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i][0] < sorted[i - 1][1]) {
      return {
        ok: false,
        error: `Die Zeiträume ${formatInterval(sorted[i - 1])} und ${formatInterval(sorted[i])} überschneiden sich.`,
      };
    }
  }
  return { ok: true, intervals: sorted };
}

/** Total length of a list of intervals in minutes. */
export function intervalsTotalMinutes(intervals: Interval[]): number {
  let total = 0;
  for (const [start, end] of intervals) total += end - start;
  return total;
}

/** Formats a single interval as "08:00–12:00". */
export function formatInterval([start, end]: Interval): string {
  return `${minutesToTime(start)}–${minutesToTime(end)}`;
}

/** Formats an interval list as "08:00–12:00, 13:00–17:00". */
export function formatIntervals(intervals: Interval[]): string {
  return intervals.map(formatInterval).join(', ');
}

/** Formats minutes as a compact German hours label ("8 h", "7,5 h"). */
export function formatHoursShort(minutes: number): string {
  return `${(minutes / 60).toLocaleString('de-DE', { maximumFractionDigits: 1 })} h`;
}

/** Deep-copies a week configuration so editors can mutate a local draft. */
export function cloneWeek(week: WeekDayConfig[]): WeekDayConfig[] {
  return week.map((day) => ({
    working: day.working,
    intervals: day.intervals.map(([start, end]) => [start, end] as Interval),
  }));
}
