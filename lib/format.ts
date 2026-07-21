/**
 * German display formatting for engine values (dates, durations, workloads).
 * Pure functions, usable on server and client.
 */

import type { IsoDate, WorkMoment } from '@/engine/types';

/** "2026-07-21" → "21.07.2026". */
export function formatIsoDate(date: IsoDate): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
}

/** "2026-07-21" → "21.07.". */
export function formatIsoDateShort(date: IsoDate): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.`;
}

/** Formats the date part of a WorkMoment ("21.07.2026"). */
export function formatMomentDate(m: WorkMoment): string {
  return formatIsoDate(m.date);
}

/** Formats a WorkMoment with time ("21.07.2026 08:00"). */
export function formatMoment(m: WorkMoment): string {
  const hours = String(Math.floor(m.minute / 60)).padStart(2, '0');
  const minutes = String(m.minute % 60).padStart(2, '0');
  return `${formatIsoDate(m.date)} ${hours}:${minutes}`;
}

/** Minute-of-day → "08:00". */
export function formatMinuteOfDay(minute: number): string {
  const hours = String(Math.floor(minute / 60)).padStart(2, '0');
  const minutes = String(minute % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Formats working minutes as days/hours relative to a day capacity
 * (e.g. 720 min at 480 min/day → "1,5 T"; 90 min → "1,5 h").
 */
export function formatDuration(minutes: number, dayCapacity = 480): string {
  if (minutes === 0) return '0';
  if (minutes < dayCapacity) {
    const hours = minutes / 60;
    return `${hours.toLocaleString('de-DE', { maximumFractionDigits: 1 })} h`;
  }
  const days = minutes / dayCapacity;
  return `${days.toLocaleString('de-DE', { maximumFractionDigits: 1 })} T`;
}

/** Formats person-minutes of work as hours ("12 h"). */
export function formatWorkHours(minutes: number): string {
  const hours = minutes / 60;
  return `${hours.toLocaleString('de-DE', { maximumFractionDigits: 1 })} h`;
}

/** Formats units (1 → "100 %"). */
export function formatUnits(units: number): string {
  return `${Math.round(units * 100)} %`;
}

/** Parses a German duration input like "3 T", "1,5T", "4h", "90m" into working minutes. */
export function parseDurationInput(raw: string, dayCapacity = 480): number | undefined {
  const cleaned = raw.trim().toLowerCase().replace(',', '.');
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*(t|d|h|m|min)?$/);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (Number.isNaN(value)) return undefined;
  const unit = match[2] ?? 't';
  if (unit === 'h') return Math.round(value * 60);
  if (unit === 'm' || unit === 'min') return Math.round(value);
  return Math.round(value * dayCapacity);
}

/** Today's ISO date in the local timezone of the viewer. */
export function todayIso(): IsoDate {
  const now = new Date();
  const yyyy = String(now.getFullYear()).padStart(4, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
