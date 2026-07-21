'use client';

/**
 * Work-week editor for a calendar: seven weekday rows with a working toggle,
 * up to three editable time intervals per day and a per-day hours summary.
 * Saves the whole week via useUpdateCalendar once the draft is dirty.
 */

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Interval, WeekDayConfig } from '@/engine/types';
import type { CalendarRow } from '@/lib/store/types';
import { useUpdateCalendar } from '@/lib/queries/use-entities';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  WEEKDAYS_DE,
  cloneWeek,
  formatHoursShort,
  intervalsTotalMinutes,
  minutesToTime,
  normalizeIntervals,
  timeToMinutes,
} from '../lib/intervals';

/** Maximum number of working intervals per day. */
const MAX_INTERVALS = 3;

/** Intervals given to a day that is switched to "working" without any hours yet. */
const DEFAULT_DAY_INTERVALS: Interval[] = [
  [480, 720],
  [780, 1020],
];

/** Props of {@link WeekEditor}. */
interface WeekEditorProps {
  calendar: CalendarRow;
}

/**
 * Renders the editable work week of a calendar with validation (end after
 * start, no overlapping intervals) and a dirty-gated save button.
 * @param props - WeekEditorProps containing the calendar to edit.
 * @param props.calendar - Calendar row whose week is edited; remount (key) on id change.
 * @returns A JSX element with the week editor card.
 */
export default function WeekEditor({ calendar }: WeekEditorProps) {
  const updateCalendar = useUpdateCalendar();
  const [week, setWeek] = useState<WeekDayConfig[]>(() => cloneWeek(calendar.week));
  const dirty = JSON.stringify(week) !== JSON.stringify(calendar.week);

  function patchDay(index: number, patch: Partial<WeekDayConfig>) {
    setWeek((current) =>
      current.map((day, i) => (i === index ? { ...day, ...patch } : day)),
    );
  }

  function toggleWorking(index: number, working: boolean) {
    const intervals =
      working && week[index].intervals.length === 0
        ? DEFAULT_DAY_INTERVALS.map(([s, e]) => [s, e] as Interval)
        : week[index].intervals;
    patchDay(index, { working, intervals });
  }

  function setBound(dayIndex: number, intervalIndex: number, bound: 0 | 1, value: string) {
    const minute = timeToMinutes(value);
    if (minute === undefined) return;
    const intervals = week[dayIndex].intervals.map(([s, e], i) => {
      if (i !== intervalIndex) return [s, e] as Interval;
      return (bound === 0 ? [minute, e] : [s, minute]) as Interval;
    });
    patchDay(dayIndex, { intervals });
  }

  function addInterval(dayIndex: number) {
    const intervals = week[dayIndex].intervals;
    if (intervals.length >= MAX_INTERVALS) return;
    const lastEnd = intervals[intervals.length - 1]?.[1] ?? 420;
    const start = Math.min(lastEnd + 60, 1320);
    patchDay(dayIndex, {
      intervals: [...intervals, [start, Math.min(start + 120, 1439)] as Interval],
    });
  }

  function removeInterval(dayIndex: number, intervalIndex: number) {
    patchDay(dayIndex, {
      intervals: week[dayIndex].intervals.filter((_, i) => i !== intervalIndex),
    });
  }

  function save() {
    const normalized: WeekDayConfig[] = [];
    for (let i = 0; i < 7; i++) {
      const day = week[i];
      if (!day.working) {
        normalized.push({ working: false, intervals: [] });
        continue;
      }
      if (day.intervals.length === 0) {
        toast.error(`${WEEKDAYS_DE[i]}: Ein Arbeitstag braucht mindestens einen Zeitraum.`);
        return;
      }
      const result = normalizeIntervals(day.intervals);
      if (!result.ok) {
        toast.error(`${WEEKDAYS_DE[i]}: ${result.error}`);
        return;
      }
      normalized.push({ working: true, intervals: result.intervals });
    }
    setWeek(normalized);
    updateCalendar.mutate({ id: calendar.id, patch: { week: normalized } });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Arbeitswoche</CardTitle>
        <CardDescription>Wochentage und Arbeitszeiten dieses Kalenders</CardDescription>
        <CardAction className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!dirty}
            onClick={() => setWeek(cloneWeek(calendar.week))}
          >
            Verwerfen
          </Button>
          <Button size="sm" disabled={!dirty || updateCalendar.isPending} onClick={save}>
            Speichern
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {week.map((day, dayIndex) => (
            <div key={WEEKDAYS_DE[dayIndex]} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
              <div className="flex w-36 shrink-0 items-center gap-3">
                <Switch
                  checked={day.working}
                  aria-label={`${WEEKDAYS_DE[dayIndex]} Arbeitstag`}
                  onCheckedChange={(working) => toggleWorking(dayIndex, working)}
                />
                <span className={day.working ? 'text-sm font-medium' : 'text-sm text-muted-foreground'}>
                  {WEEKDAYS_DE[dayIndex]}
                </span>
              </div>
              {day.working ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {day.intervals.map((interval, intervalIndex) => (
                      <span
                        key={intervalIndex}
                        className="flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-1"
                      >
                        <Input
                          type="time"
                          value={minutesToTime(interval[0])}
                          aria-label="Beginn"
                          className="h-7 w-[5.75rem] border-0 bg-transparent px-1 shadow-none"
                          onChange={(e) => setBound(dayIndex, intervalIndex, 0, e.target.value)}
                        />
                        <span className="text-muted-foreground">–</span>
                        <Input
                          type="time"
                          value={minutesToTime(interval[1])}
                          aria-label="Ende"
                          className="h-7 w-[5.75rem] border-0 bg-transparent px-1 shadow-none"
                          onChange={(e) => setBound(dayIndex, intervalIndex, 1, e.target.value)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label="Zeitraum entfernen"
                          onClick={() => removeInterval(dayIndex, intervalIndex)}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </span>
                    ))}
                    {day.intervals.length < MAX_INTERVALS && (
                      <Button variant="ghost" size="sm" onClick={() => addInterval(dayIndex)}>
                        <Plus className="size-3.5" /> Intervall
                      </Button>
                    )}
                  </div>
                  <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                    {formatHoursShort(intervalsTotalMinutes(day.intervals))}
                  </span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">frei</span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
