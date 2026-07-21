'use client';

/**
 * Compact year overview of a calendar: twelve mini month grids where every
 * day is a small colored cell (working, free, exception, shortened day),
 * computed via compileCalendar as a quick visual sanity check.
 */

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { compileCalendar } from '@/engine/calendar';
import { addDays, daysBetween, weekdayIndex } from '@/engine/date-utils';
import type { CalendarConfig } from '@/engine/types';
import { formatIsoDate } from '@/lib/format';
import type { CalendarExceptionRow, CalendarRow } from '@/lib/store/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/** German short month names, January-first. */
const MONTHS_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** Builds an engine calendar config from persistence rows. */
function toConfig(calendar: CalendarRow, exceptions: CalendarExceptionRow[]): CalendarConfig {
  return {
    id: calendar.id,
    week: calendar.week,
    exceptions: exceptions.map((e) => ({
      date: e.date,
      working: e.working,
      intervals: e.intervals ?? undefined,
      name: e.name,
    })),
  };
}

/** Props of {@link YearOverview}. */
interface YearOverviewProps {
  calendar: CalendarRow;
  exceptions: CalendarExceptionRow[];
  base?: { calendar: CalendarRow; exceptions: CalendarExceptionRow[] };
}

/**
 * Renders the twelve-month day-cell grid of the selected calendar with a
 * year switcher and a color legend.
 * @param props - YearOverviewProps with the calendar to visualize.
 * @param props.calendar - Calendar rendered into the grid.
 * @param props.exceptions - Exception rows of that calendar.
 * @param props.base - Optional base calendar (with its exceptions) inherited by resource calendars.
 * @returns A JSX element with the year overview card.
 */
export default function YearOverview({ calendar, exceptions, base }: YearOverviewProps) {
  const [year, setYear] = useState(() => new Date().getFullYear());

  const compiled = useMemo(() => {
    const config = toConfig(calendar, exceptions);
    if (base) config.base = toConfig(base.calendar, base.exceptions);
    return compileCalendar(config);
  }, [calendar, exceptions, base]);

  const months = useMemo(() => {
    return MONTHS_DE.map((label, monthIndex) => {
      const mm = String(monthIndex + 1).padStart(2, '0');
      const monthStart = `${year}-${mm}-01`;
      const nextStart =
        monthIndex === 11 ? `${year + 1}-01-01` : `${year}-${String(monthIndex + 2).padStart(2, '0')}-01`;
      const dayCount = daysBetween(monthStart, nextStart);
      const offset = weekdayIndex(monthStart);
      const days = Array.from({ length: dayCount }, (_, i) => {
        const date = addDays(monthStart, i);
        const resolution = compiled.resolveDay(date);
        const isException = resolution.source === 'exception' || resolution.source === 'baseException';
        const working = resolution.intervals.length > 0;
        let cellClass = 'bg-muted';
        if (isException) cellClass = working ? 'bg-amber-500/80' : 'bg-red-500/70';
        else if (working) cellClass = 'bg-primary/50';
        const title = `${formatIsoDate(date)}${resolution.exceptionName ? ` · ${resolution.exceptionName}` : working ? '' : ' · frei'}`;
        return { date, cellClass, title };
      });
      return { label, offset, days };
    });
  }, [compiled, year]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Jahresübersicht</CardTitle>
        <CardDescription>Arbeits- und Ausnahmetage im Jahr {year}</CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Vorheriges Jahr"
            onClick={() => setYear((y) => y - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="w-12 text-center text-sm font-medium tabular-nums">{year}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Nächstes Jahr"
            onClick={() => setYear((y) => y + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-x-6 gap-y-4 sm:grid-cols-4 xl:grid-cols-6">
          {months.map((month) => (
            <div key={month.label}>
              <p className="mb-1 text-xs text-muted-foreground">{month.label}</p>
              <div className="grid w-fit grid-cols-7 gap-px">
                {Array.from({ length: month.offset }, (_, i) => (
                  <span key={`pad-${i}`} className="size-[7px]" />
                ))}
                {month.days.map((day) => (
                  <span
                    key={day.date}
                    title={day.title}
                    className={`size-[7px] rounded-[2px] ${day.cellClass}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t pt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-[7px] rounded-[2px] bg-primary/50" /> Arbeitstag
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-[7px] rounded-[2px] bg-muted" /> Frei / Wochenende
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-[7px] rounded-[2px] bg-red-500/70" /> Ausnahme (frei)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-[7px] rounded-[2px] bg-amber-500/80" /> Ausnahme (verkürzt)
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
