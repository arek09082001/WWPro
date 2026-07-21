'use client';

/**
 * Pure mapping between ISO dates / WorkMoments and timeline pixels for each
 * zoom level. Non-working days keep their uniform width and are shaded, not
 * compressed — predictable geometry for drags and dependency arrows.
 */

import { useMemo } from 'react';
import { addDays, daysBetween, toOrdinal, weekdayIndex } from '@/engine/date-utils';
import type { IsoDate, WorkMoment } from '@/engine/types';
import type { ZoomLevel } from './use-gantt-store';

/** Pixel width of one day per zoom level. */
export const DAY_WIDTH: Record<ZoomLevel, number> = {
  day: 36,
  week: 18,
  month: 7,
  quarter: 3.2,
};

/** Precomputed timeline geometry. */
export interface TimeScale {
  rangeStart: IsoDate;
  rangeEnd: IsoDate;
  dayWidth: number;
  totalWidth: number;
  totalDays: number;
  /** x position of the start of a day. */
  x(date: IsoDate): number;
  /** x position of a moment within its day. */
  xOfMoment(m: WorkMoment): number;
  /** Day at an x position (clamped to the range). */
  dateAt(x: number): IsoDate;
  /** All days of the range (only materialized for shading at day/week zoom). */
  days: IsoDate[];
  /** Month segments for the header. */
  months: { start: IsoDate; label: string; x: number; width: number }[];
  /** Bottom-tier segments (days at day zoom, ISO weeks otherwise). */
  ticks: { date: IsoDate; label: string; x: number; width: number }[];
  zoom: ZoomLevel;
}

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/** ISO 8601 week number of a date. */
export function isoWeekOf(date: IsoDate): number {
  const ordinal = toOrdinal(date);
  const weekday = weekdayIndex(date);
  const thursday = ordinal + (3 - weekday);
  const thursdayDate = addDays(date, 3 - weekday);
  const year = Number(thursdayDate.slice(0, 4));
  const jan1 = toOrdinal(`${year}-01-01`);
  return Math.floor((thursday - jan1) / 7) + 1;
}

/**
 * Builds the timeline geometry for a date range and zoom level.
 * @param projectStart - Project start date (range anchor).
 * @param projectEnd - Latest computed task end.
 * @param zoom - Current zoom level.
 * @returns The memoized {@link TimeScale}.
 */
export function useTimeScale(projectStart: IsoDate, projectEnd: IsoDate, zoom: ZoomLevel): TimeScale {
  return useMemo(() => {
    const dayWidth = DAY_WIDTH[zoom];
    // Pad range to full weeks: 1 week before, 4 after (more at coarse zooms).
    const padAfter = zoom === 'day' ? 28 : zoom === 'week' ? 56 : 112;
    let rangeStart = addDays(projectStart, -7);
    rangeStart = addDays(rangeStart, -weekdayIndex(rangeStart));
    let rangeEnd = addDays(projectEnd, padAfter);
    rangeEnd = addDays(rangeEnd, 6 - weekdayIndex(rangeEnd));
    const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
    const totalWidth = totalDays * dayWidth;
    const startOrdinal = toOrdinal(rangeStart);

    const x = (date: IsoDate) => (toOrdinal(date) - startOrdinal) * dayWidth;
    const xOfMoment = (m: WorkMoment) => x(m.date) + (m.minute / 1440) * dayWidth;
    const dateAt = (px: number) => {
      const day = Math.max(0, Math.min(totalDays - 1, Math.floor(px / dayWidth)));
      return addDays(rangeStart, day);
    };

    const days: IsoDate[] = [];
    if (zoom === 'day' || zoom === 'week') {
      for (let i = 0; i < totalDays; i++) days.push(addDays(rangeStart, i));
    }

    const months: TimeScale['months'] = [];
    let cursor = rangeStart;
    while (cursor <= rangeEnd) {
      const year = cursor.slice(0, 4);
      const month = Number(cursor.slice(5, 7));
      const monthStart = `${year}-${cursor.slice(5, 7)}-01`;
      const nextMonth =
        month === 12 ? `${Number(year) + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const segStart = monthStart < rangeStart ? rangeStart : monthStart;
      const segEnd = nextMonth > rangeEnd ? addDays(rangeEnd, 1) : nextMonth;
      months.push({
        start: segStart,
        label: `${MONTH_NAMES[month - 1]} ${year}`,
        x: x(segStart),
        width: (toOrdinal(segEnd) - toOrdinal(segStart)) * dayWidth,
      });
      cursor = nextMonth;
    }

    const ticks: TimeScale['ticks'] = [];
    if (zoom === 'day') {
      for (let i = 0; i < totalDays; i++) {
        const date = addDays(rangeStart, i);
        ticks.push({ date, label: date.slice(8, 10), x: i * dayWidth, width: dayWidth });
      }
    } else {
      for (let i = 0; i < totalDays; i += 7) {
        const date = addDays(rangeStart, i);
        ticks.push({
          date,
          label: `KW ${isoWeekOf(date)}`,
          x: i * dayWidth,
          width: 7 * dayWidth,
        });
      }
    }

    return {
      rangeStart,
      rangeEnd,
      dayWidth,
      totalWidth,
      totalDays,
      x,
      xOfMoment,
      dateAt,
      days,
      months,
      ticks,
      zoom,
    };
  }, [projectStart, projectEnd, zoom]);
}
