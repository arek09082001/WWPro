'use client';

/**
 * Info card showing the weekly working hours that apply to an employee
 * (their own calendar or the workspace default), one row per weekday.
 */

import type { WeekDayConfig } from '@/engine/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  WEEKDAYS_DE,
  formatHoursShort,
  formatIntervals,
  intervalsTotalMinutes,
} from '@/features/calendars/lib/intervals';

/** Props of {@link WorkWeekCard}. */
interface WorkWeekCardProps {
  week: WeekDayConfig[];
  sourceLabel: string;
}

/**
 * Renders the seven weekday rows (Montag–Sonntag) with working intervals or
 * "frei", plus the weekly total.
 * @param props - WorkWeekCardProps containing the effective week.
 * @param props.week - Monday-first weekday configuration to display.
 * @param props.sourceLabel - Name of the calendar the week comes from.
 * @returns A JSX element with the work-week card.
 */
export default function WorkWeekCard({ week, sourceLabel }: WorkWeekCardProps) {
  const weeklyMinutes = week.reduce(
    (sum, day) => sum + (day.working ? intervalsTotalMinutes(day.intervals) : 0),
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Arbeitszeiten</CardTitle>
        <CardDescription>Kalender: {sourceLabel}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5 text-sm">
          {WEEKDAYS_DE.map((dayName, index) => {
            const day = week[index];
            const working = day?.working && day.intervals.length > 0;
            return (
              <div key={dayName} className="flex items-baseline justify-between gap-3">
                <span className={working ? '' : 'text-muted-foreground'}>{dayName}</span>
                <span className={working ? 'tabular-nums' : 'text-muted-foreground'}>
                  {working ? formatIntervals(day.intervals) : 'frei'}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 border-t pt-3 text-sm text-muted-foreground">
          Wochenarbeitszeit: {formatHoursShort(weeklyMinutes)}
        </p>
      </CardContent>
    </Card>
  );
}
