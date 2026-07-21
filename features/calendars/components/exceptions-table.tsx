'use client';

/**
 * Exceptions section of the calendar editor: date-sorted table of all
 * exceptions (holidays, half days, special days) with per-row deletion, an
 * inline dialog to add a new exception and the holiday-import entry point.
 * All writes go through the replace-all endpoint with the full new list.
 */

import { useState } from 'react';
import { CalendarPlus, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Interval } from '@/engine/types';
import { isValidIsoDate } from '@/engine/date-utils';
import { formatIsoDate } from '@/lib/format';
import type { CalendarExceptionRow, CalendarRow } from '@/lib/store/types';
import { useSetCalendarExceptions } from '@/lib/queries/use-entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatIntervals,
  minutesToTime,
  normalizeIntervals,
  timeToMinutes,
} from '../lib/intervals';
import { toExceptionPayload } from '../lib/exceptions';
import HolidayImportDialog from './holiday-import-dialog';

/** Props of {@link ExceptionsTable}. */
interface ExceptionsTableProps {
  calendar: CalendarRow;
  exceptions: CalendarExceptionRow[];
}

/**
 * Renders the exceptions card of the selected calendar with add/delete and
 * holiday import.
 * @param props - ExceptionsTableProps with the calendar context.
 * @param props.calendar - Calendar whose exceptions are managed.
 * @param props.exceptions - Current exception rows of that calendar.
 * @returns A JSX element with the exceptions card.
 */
export default function ExceptionsTable({ calendar, exceptions }: ExceptionsTableProps) {
  const setExceptions = useSetCalendarExceptions();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const sorted = [...exceptions].sort((a, b) => a.date.localeCompare(b.date));

  function removeException(row: CalendarExceptionRow) {
    setExceptions.mutate({
      calendarId: calendar.id,
      exceptions: toExceptionPayload(exceptions.filter((e) => e.id !== row.id)),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ausnahmen</CardTitle>
        <CardDescription>Feiertage, halbe Tage und Sondertage dieses Kalenders</CardDescription>
        <CardAction className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <CalendarPlus className="size-3.5" /> Feiertage importieren
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" /> Ausnahme
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Keine Ausnahmen vorhanden. Importiere Feiertage oder lege einen Sondertag an.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Art</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="tabular-nums">{formatIsoDate(row.date)}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>
                    {row.working ? (
                      <Badge variant="outline" className="tabular-nums">
                        Arbeitszeit {formatIntervals(row.intervals ?? [])}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Frei</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Ausnahme löschen"
                      disabled={setExceptions.isPending}
                      onClick={() => removeException(row)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AddExceptionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        calendar={calendar}
        exceptions={exceptions}
      />
      <HolidayImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        calendar={calendar}
        exceptions={exceptions}
      />
    </Card>
  );
}

/** Props of {@link AddExceptionDialog}. */
interface AddExceptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendar: CalendarRow;
  exceptions: CalendarExceptionRow[];
}

/**
 * Inline dialog for adding a single exception (date, name, off or working
 * with custom intervals). Rejects duplicate dates and invalid intervals.
 * @param props - AddExceptionDialogProps with dialog state and calendar context.
 * @param props.open - Whether the dialog is visible.
 * @param props.onOpenChange - Callback toggling dialog visibility.
 * @param props.calendar - Calendar receiving the new exception.
 * @param props.exceptions - Current exception rows used to build the full replace list.
 * @returns A JSX element with the dialog form.
 */
export function AddExceptionDialog({
  open,
  onOpenChange,
  calendar,
  exceptions,
}: AddExceptionDialogProps) {
  const setExceptions = useSetCalendarExceptions();
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [working, setWorking] = useState(false);
  const [intervals, setIntervals] = useState<Interval[]>([[480, 720]]);

  function reset() {
    setDate('');
    setName('');
    setWorking(false);
    setIntervals([[480, 720]]);
  }

  function setBound(index: number, bound: 0 | 1, value: string) {
    const minute = timeToMinutes(value);
    if (minute === undefined) return;
    setIntervals((current) =>
      current.map(([s, e], i) => {
        if (i !== index) return [s, e] as Interval;
        return (bound === 0 ? [minute, e] : [s, minute]) as Interval;
      }),
    );
  }

  async function submit() {
    if (!isValidIsoDate(date)) {
      toast.error('Bitte ein gültiges Datum wählen.');
      return;
    }
    if (!name.trim()) {
      toast.error('Bitte einen Namen angeben.');
      return;
    }
    if (exceptions.some((e) => e.date === date)) {
      toast.error(`Für den ${formatIsoDate(date)} existiert bereits eine Ausnahme.`);
      return;
    }
    let payloadIntervals: Interval[] | null = null;
    if (working) {
      if (intervals.length === 0) {
        toast.error('Ein Arbeitstag braucht mindestens einen Zeitraum.');
        return;
      }
      const result = normalizeIntervals(intervals);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      payloadIntervals = result.intervals;
    }
    await setExceptions.mutateAsync({
      calendarId: calendar.id,
      exceptions: [
        ...toExceptionPayload(exceptions),
        { date, name: name.trim(), working, intervals: payloadIntervals },
      ].sort((a, b) => a.date.localeCompare(b.date)),
    });
    onOpenChange(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neue Ausnahme</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exception-date">Datum *</Label>
              <Input
                id="exception-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exception-name">Name *</Label>
              <Input
                id="exception-name"
                placeholder="z. B. Betriebsausflug"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch id="exception-working" checked={working} onCheckedChange={setWorking} />
            <Label htmlFor="exception-working">
              {working ? 'Arbeitstag mit eigenen Zeiten' : 'Arbeitsfrei'}
            </Label>
          </div>
          {working && (
            <div className="space-y-2">
              <Label>Arbeitszeiten</Label>
              <div className="flex flex-wrap items-center gap-2">
                {intervals.map((interval, index) => (
                  <span
                    key={index}
                    className="flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-1"
                  >
                    <Input
                      type="time"
                      value={minutesToTime(interval[0])}
                      aria-label="Beginn"
                      className="h-7 w-[5.75rem] border-0 bg-transparent px-1 shadow-none"
                      onChange={(e) => setBound(index, 0, e.target.value)}
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="time"
                      value={minutesToTime(interval[1])}
                      aria-label="Ende"
                      className="h-7 w-[5.75rem] border-0 bg-transparent px-1 shadow-none"
                      onChange={(e) => setBound(index, 1, e.target.value)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label="Zeitraum entfernen"
                      onClick={() =>
                        setIntervals((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      <X className="size-3.5" />
                    </Button>
                  </span>
                ))}
                {intervals.length < 3 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setIntervals((current) => {
                        const lastEnd = current[current.length - 1]?.[1] ?? 420;
                        const start = Math.min(lastEnd + 60, 1320);
                        return [...current, [start, Math.min(start + 120, 1439)] as Interval];
                      })
                    }
                  >
                    <Plus className="size-3.5" /> Intervall
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={setExceptions.isPending}>
            Ausnahme speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
