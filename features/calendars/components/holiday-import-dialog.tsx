'use client';

/**
 * Dialog importing German public holidays of a year/Bundesland into the
 * selected calendar as non-working exceptions. Already-present dates are
 * skipped; the chosen Bundesland is persisted as workspace preselection.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BUNDESLAENDER, germanHolidays, type Bundesland } from '@/engine/holidays';
import type { CalendarExceptionRow, CalendarRow } from '@/lib/store/types';
import {
  useSetCalendarExceptions,
  useUpdateWorkspace,
  useWorkspace,
} from '@/lib/queries/use-entities';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toExceptionPayload } from '../lib/exceptions';

/** Props of {@link HolidayImportDialog}. */
interface HolidayImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendar: CalendarRow;
  exceptions: CalendarExceptionRow[];
}

/**
 * Renders the holiday import dialog (year + Bundesland) and merges generated
 * holidays into the calendar's exceptions on import.
 * @param props - HolidayImportDialogProps with dialog state and calendar context.
 * @param props.open - Whether the dialog is visible.
 * @param props.onOpenChange - Callback toggling dialog visibility.
 * @param props.calendar - Calendar receiving the holidays.
 * @param props.exceptions - Current exception rows used for merge and duplicate skipping.
 * @returns A JSX element with the dialog form.
 */
export default function HolidayImportDialog({
  open,
  onOpenChange,
  calendar,
  exceptions,
}: HolidayImportDialogProps) {
  const { data: workspace } = useWorkspace();
  const setExceptions = useSetCalendarExceptions();
  const updateWorkspace = useUpdateWorkspace();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [land, setLand] = useState<Bundesland | ''>('');

  useEffect(() => {
    if (open) setLand(workspace?.bundesland ?? '');
  }, [open, workspace?.bundesland]);

  const yearValid = Number.isInteger(year) && year >= 2000 && year <= 2100;

  async function runImport() {
    if (!land || !yearValid) return;
    const existing = new Set(exceptions.map((e) => e.date));
    const holidays = germanHolidays(year, land).filter((h) => !existing.has(h.date));
    if (holidays.length === 0) {
      toast.info(`Alle Feiertage ${year} sind bereits als Ausnahmen vorhanden.`);
      onOpenChange(false);
      return;
    }
    await setExceptions.mutateAsync({
      calendarId: calendar.id,
      exceptions: [
        ...toExceptionPayload(exceptions),
        ...holidays.map((h) => ({ date: h.date, name: h.name, working: false, intervals: null })),
      ].sort((a, b) => a.date.localeCompare(b.date)),
    });
    if (workspace && workspace.bundesland !== land) {
      updateWorkspace.mutate({ bundesland: land });
    }
    toast.success(`${holidays.length} Feiertage importiert`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Feiertage importieren</DialogTitle>
          <DialogDescription>
            Gesetzliche Feiertage werden als arbeitsfreie Ausnahmen in „{calendar.name}“
            übernommen. Bereits vorhandene Daten werden übersprungen.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="holiday-year">Jahr</Label>
            <Input
              id="holiday-year"
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Bundesland</Label>
            <Select value={land} onValueChange={(value) => setLand(value as Bundesland)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Bundesland wählen" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(BUNDESLAENDER) as Bundesland[]).map((code) => (
                  <SelectItem key={code} value={code}>
                    {BUNDESLAENDER[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={runImport} disabled={!land || !yearValid || setExceptions.isPending}>
            Importieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
