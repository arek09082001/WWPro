/**
 * Pure ISO-date arithmetic on "YYYY-MM-DD" strings.
 *
 * Uses the civil-calendar day-count algorithm (Howard Hinnant) instead of the
 * JavaScript `Date` object, so results are independent of host timezone and DST.
 */

import type { IsoDate } from './types';

/** Days from 1970-01-01 (which is ordinal 0, a Thursday) for a proleptic Gregorian date. */
export function toOrdinal(iso: IsoDate): number {
  const y0 = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of {@link toOrdinal}: ordinal day number → ISO date string. */
export function fromOrdinal(ordinal: number): IsoDate {
  const z = ordinal + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const year = m <= 2 ? y + 1 : y;
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${year.toString().padStart(4, '0')}-${mm}-${dd}`;
}

/** Adds (or subtracts) whole calendar days to an ISO date. */
export function addDays(iso: IsoDate, days: number): IsoDate {
  return fromOrdinal(toOrdinal(iso) + days);
}

/** Monday-first weekday index: 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso: IsoDate): number {
  // 1970-01-01 (ordinal 0) was a Thursday → index 3 in a Monday-first week.
  return (((toOrdinal(iso) + 3) % 7) + 7) % 7;
}

/** Number of calendar days from `a` to `b` (positive when b is later). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return toOrdinal(b) - toOrdinal(a);
}

/** Validates the basic "YYYY-MM-DD" shape and a real calendar date. */
export function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return fromOrdinal(toOrdinal(iso)) === iso;
}
