/**
 * Helpers for working with calendar exception rows in the settings UI.
 */

import type { Interval } from '@/engine/types';
import type { CalendarExceptionRow } from '@/lib/store/types';

/** Payload shape of the replace-all exceptions endpoint (row without ids). */
export type ExceptionPayload = Omit<CalendarExceptionRow, 'id' | 'calendarId'>;

/**
 * Strips ids from exception rows so they can be re-sent to the replace-all
 * endpoint, sorted by date.
 * @param rows - Current exception rows of a calendar.
 * @returns Id-free copies sorted by date.
 */
export function toExceptionPayload(rows: CalendarExceptionRow[]): ExceptionPayload[] {
  return rows
    .map((row) => ({
      date: row.date,
      name: row.name,
      working: row.working,
      intervals: row.intervals ? row.intervals.map(([s, e]) => [s, e] as Interval) : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
