'use client';

/**
 * Calendar settings page: calendar list on the left (kind, exception count,
 * workspace default marker), and on the right the editor for the selected
 * calendar with work-week editor, exceptions, holiday import and year
 * overview.
 */

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { CalendarRow } from '@/lib/store/types';
import { useCalendars, useDeleteCalendar, useWorkspace } from '@/lib/queries/use-entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import CreateCalendarDialog from '../components/create-calendar-dialog';
import ExceptionsTable from '../components/exceptions-table';
import WeekEditor from '../components/week-editor';
import YearOverview from '../components/year-overview';

/** German labels of the calendar kinds. */
const KIND_LABELS: Record<CalendarRow['kind'], string> = {
  base: 'Basis',
  resource: 'Ressource',
};

/**
 * Renders the calendar settings page with list, selection and editor.
 * @returns A JSX element containing the two-pane calendar management UI.
 */
export default function CalendarsPage() {
  const { data, isLoading } = useCalendars();
  const { data: workspace } = useWorkspace();
  const deleteCalendar = useDeleteCalendar();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const calendars = useMemo(() => data?.calendars ?? [], [data]);
  const exceptions = useMemo(() => data?.exceptions ?? [], [data]);

  const selected =
    calendars.find((calendar) => calendar.id === selectedId) ??
    calendars.find((calendar) => calendar.id === workspace?.defaultCalendarId) ??
    calendars[0];

  const selectedExceptions = useMemo(
    () => exceptions.filter((e) => e.calendarId === selected?.id),
    [exceptions, selected],
  );

  const baseOfSelected = useMemo(() => {
    if (!selected?.baseCalendarId) return undefined;
    const baseCalendar = calendars.find((c) => c.id === selected.baseCalendarId);
    if (!baseCalendar) return undefined;
    return {
      calendar: baseCalendar,
      exceptions: exceptions.filter((e) => e.calendarId === baseCalendar.id),
    };
  }, [selected, calendars, exceptions]);

  function exceptionCount(calendarId: string): number {
    return exceptions.filter((e) => e.calendarId === calendarId).length;
  }

  function confirmDelete(calendar: CalendarRow) {
    if (window.confirm(`Kalender „${calendar.name}“ wirklich löschen?`)) {
      if (selectedId === calendar.id) setSelectedId(null);
      deleteCalendar.mutate(calendar.id);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="font-heading text-xl font-semibold">Kalender</h1>
          <p className="text-sm text-muted-foreground">
            Arbeitswochen, Feiertage und Ausnahmen für Projekte und Mitarbeiter
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> Neuer Kalender
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 space-y-1 overflow-y-auto border-r p-3">
          {isLoading &&
            Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          {!isLoading && calendars.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">
              Noch keine Kalender vorhanden. Lege einen Kalender an, um Arbeitszeiten zu
              definieren.
            </p>
          )}
          {calendars.map((calendar) => {
            const isDefault = calendar.id === workspace?.defaultCalendarId;
            return (
              <ContextMenu key={calendar.id}>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setSelectedId(calendar.id)}
                    className={cn(
                      'w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent',
                      selected?.id === calendar.id && 'bg-accent',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{calendar.name}</span>
                      {isDefault && <Badge>Standard</Badge>}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{KIND_LABELS[calendar.kind]}</Badge>
                      {exceptionCount(calendar.id)} Ausnahmen
                    </span>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    variant="destructive"
                    disabled={isDefault}
                    onSelect={() => confirmDelete(calendar)}
                  >
                    {isDefault ? 'Standardkalender (nicht löschbar)' : 'Löschen'}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {isLoading && <Skeleton className="h-96 rounded-xl" />}
          {!isLoading && !selected && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Wähle links einen Kalender aus oder lege einen neuen an.
            </div>
          )}
          {selected && (
            <div className="space-y-6">
              <WeekEditor key={`week-${selected.id}`} calendar={selected} />
              <ExceptionsTable calendar={selected} exceptions={selectedExceptions} />
              <YearOverview
                calendar={selected}
                exceptions={selectedExceptions}
                base={baseOfSelected}
              />
            </div>
          )}
        </main>
      </div>

      <CreateCalendarDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={setSelectedId}
      />
    </div>
  );
}
