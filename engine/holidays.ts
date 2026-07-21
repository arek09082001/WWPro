/**
 * German public-holiday generator, computed locally (no external API).
 * Easter-derived dates use the Meeus/Jones/Butcher algorithm.
 */

import { addDays, weekdayIndex } from './date-utils';
import type { IsoDate } from './types';

/** German federal state codes. */
export type Bundesland =
  | 'BW' | 'BY' | 'BE' | 'BB' | 'HB' | 'HH' | 'HE' | 'MV'
  | 'NI' | 'NW' | 'RP' | 'SL' | 'SN' | 'ST' | 'SH' | 'TH';

/** Display names of all German federal states. */
export const BUNDESLAENDER: Record<Bundesland, string> = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};

/** A generated public holiday. */
export interface Holiday {
  date: IsoDate;
  name: string;
}

/** Easter Sunday of a given year (Gregorian, Meeus/Jones/Butcher). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Wednesday before November 23 (Buß- und Bettag, Sachsen). */
function bussUndBettag(year: number): IsoDate {
  let date: IsoDate = `${year}-11-22`;
  while (weekdayIndex(date) !== 2) {
    date = addDays(date, -1);
  }
  return date;
}

/**
 * Generates all public holidays of a German federal state for a year.
 * Regional oddities (e.g. Catholic-community-only holidays in Bavaria) are
 * simplified to the state-wide common rule.
 * @param year - Calendar year (Gregorian).
 * @param land - Federal state code.
 * @returns Holidays sorted by date.
 */
export function germanHolidays(year: number, land: Bundesland): Holiday[] {
  const easter = easterSunday(year);
  const holidays: Holiday[] = [
    { date: `${year}-01-01`, name: 'Neujahr' },
    { date: addDays(easter, -2), name: 'Karfreitag' },
    { date: addDays(easter, 1), name: 'Ostermontag' },
    { date: `${year}-05-01`, name: 'Tag der Arbeit' },
    { date: addDays(easter, 39), name: 'Christi Himmelfahrt' },
    { date: addDays(easter, 50), name: 'Pfingstmontag' },
    { date: `${year}-10-03`, name: 'Tag der Deutschen Einheit' },
    { date: `${year}-12-25`, name: '1. Weihnachtstag' },
    { date: `${year}-12-26`, name: '2. Weihnachtstag' },
  ];

  const add = (date: IsoDate, name: string) => holidays.push({ date, name });

  if (['BW', 'BY', 'ST'].includes(land)) add(`${year}-01-06`, 'Heilige Drei Könige');
  if (['BE', 'MV'].includes(land)) add(`${year}-03-08`, 'Internationaler Frauentag');
  if (land === 'BB') {
    add(easter, 'Ostersonntag');
    add(addDays(easter, 49), 'Pfingstsonntag');
  }
  if (['BW', 'BY', 'HE', 'NW', 'RP', 'SL'].includes(land)) {
    add(addDays(easter, 60), 'Fronleichnam');
  }
  if (['BY', 'SL'].includes(land)) add(`${year}-08-15`, 'Mariä Himmelfahrt');
  if (land === 'TH') add(`${year}-09-20`, 'Weltkindertag');
  if (['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH'].includes(land)) {
    add(`${year}-10-31`, 'Reformationstag');
  }
  if (['BW', 'BY', 'NW', 'RP', 'SL'].includes(land)) add(`${year}-11-01`, 'Allerheiligen');
  if (land === 'SN') add(bussUndBettag(year), 'Buß- und Bettag');

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}
