'use client';

/**
 * Slim Gantt toolbar: back link, project name, view switcher (Gantt/Pläne),
 * add-task button, filter popover (employees, plan category, status, critical,
 * late), zoom control, critical-path toggle, "Heute" button and the keyboard
 * cheat sheet. Everything else lives in hidden UI.
 */

import Link from 'next/link';
import { ArrowLeft, Crosshair, Filter, Keyboard, ListChecks, Plus, Route } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PLAN_CATEGORIES, PLAN_CATEGORY_ORDER, PLAN_STATUSES, PLAN_STATUS_ORDER } from '@/lib/plan-meta';
import type { EmployeeRow, ProjectRow } from '@/lib/store/types';
import { cn } from '@/lib/utils';
import { activeFilterCount, useGanttStore, type ZoomLevel } from '../hooks/use-gantt-store';

const SHORTCUTS: [string, string][] = [
  ['↑ / ↓', 'Aufgabe auswählen'],
  ['← / →', 'Aufgabe ±1 Arbeitstag verschieben'],
  ['Shift + ← / →', 'Dauer ±1 Arbeitstag ändern'],
  ['Enter', 'Detailpanel öffnen'],
  ['Entf', 'Aufgabe löschen (mit Rückgängig)'],
  ['+ / −', 'Zoom ändern'],
  ['P', 'Kritischen Pfad umschalten'],
  ['H', 'Zu Heute springen'],
  ['Esc', 'Drag abbrechen / Auswahl aufheben'],
  ['⌘K / Strg+K', 'Command-Palette'],
  ['Doppelklick auf Balken', 'Detailpanel öffnen'],
  ['Balkenkante ziehen', 'Dauer ändern'],
  ['Kreis am Balken ziehen', 'Abhängigkeit verbinden'],
];

/** Filter popover bound to the Gantt store. */
function FilterPopover({ employees }: { employees: EmployeeRow[] }) {
  const filter = useGanttStore((s) => s.filter);
  const setFilter = useGanttStore((s) => s.setFilter);
  const resetFilter = useGanttStore((s) => s.resetFilter);
  const count = activeFilterCount(filter);

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button size="sm" variant={count > 0 ? 'default' : 'outline'}>
              <Filter />
              Filter
              {count > 0 && (
                <Badge variant="secondary" className="ml-0.5 px-1">{count}</Badge>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Zeilen filtern (Mitarbeiter, Planart, Status …)</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 space-y-3 text-sm">
        <div>
          <p className="mb-1.5 font-medium">Mitarbeiter</p>
          <div className="flex flex-wrap gap-1">
            {employees.map((employee) => {
              const active = filter.employeeIds.includes(employee.id);
              return (
                <button
                  key={employee.id}
                  type="button"
                  onClick={() => setFilter({ employeeIds: toggle(filter.employeeIds, employee.id) })}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors',
                    active ? 'border-transparent text-white' : 'hover:bg-accent',
                  )}
                  style={active ? { backgroundColor: employee.color } : undefined}
                >
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: active ? '#fff' : employee.color }} />
                  {employee.name.split(' ')[0]}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-1.5 font-medium">Planart</p>
          <div className="space-y-1">
            {PLAN_CATEGORY_ORDER.map((category) => (
              <label key={category} className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={filter.categories.includes(category)}
                  onCheckedChange={() => setFilter({ categories: toggle(filter.categories, category) })}
                />
                <span className="size-2 rounded-sm" style={{ backgroundColor: PLAN_CATEGORIES[category].color }} />
                {PLAN_CATEGORIES[category].label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 font-medium">Status</p>
          <div className="space-y-1">
            {PLAN_STATUS_ORDER.map((status) => (
              <label key={status} className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={filter.statuses.includes(status)}
                  onCheckedChange={() => setFilter({ statuses: toggle(filter.statuses, status) })}
                />
                <span className="size-2 rounded-full" style={{ backgroundColor: PLAN_STATUSES[status].color }} />
                {PLAN_STATUSES[status].label}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-2 border-t pt-2">
          <label className="flex cursor-pointer items-center justify-between text-xs">
            Nur kritischer Pfad
            <Switch
              checked={filter.onlyCritical}
              onCheckedChange={(checked) => setFilter({ onlyCritical: checked })}
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between text-xs">
            Nur verspätete Pläne
            <Switch
              checked={filter.onlyLate}
              onCheckedChange={(checked) => setFilter({ onlyLate: checked })}
            />
          </label>
        </div>
        {count > 0 && (
          <Button size="sm" variant="ghost" className="w-full" onClick={resetFilter}>
            Filter zurücksetzen
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Props of {@link GanttToolbar}. */
interface GanttToolbarProps {
  project: ProjectRow;
  employees: EmployeeRow[];
  onAddTask: () => void;
  onScrollToday: () => void;
}

/**
 * Renders the toolbar above the Gantt.
 * @param props - GanttToolbarProps containing the project, employees for the filter and action callbacks.
 * @param props.project - Project shown in the header.
 * @param props.employees - Employees offered in the filter popover.
 * @param props.onAddTask - Creates a task below the selection.
 * @param props.onScrollToday - Scrolls the timeline to today.
 * @returns A JSX element with the toolbar row.
 */
export default function GanttToolbar({ project, employees, onAddTask, onScrollToday }: GanttToolbarProps) {
  const zoom = useGanttStore((s) => s.zoom);
  const setZoom = useGanttStore((s) => s.setZoom);
  const criticalVisible = useGanttStore((s) => s.criticalVisible);
  const toggleCritical = useGanttStore((s) => s.toggleCritical);

  return (
    <header className="flex items-center gap-2 border-b px-4 py-2">
      <Button asChild variant="ghost" size="icon-sm" aria-label="Zurück zu Projekten">
        <Link href="/projects"><ArrowLeft /></Link>
      </Button>
      <span className="size-2.5 rounded-full" style={{ backgroundColor: project.color }} />
      <h1 className="truncate font-semibold">{project.name}</h1>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild size="sm" variant="outline">
            <Link href={`/projects/${project.id}/plans`}>
              <ListChecks /> Planliste
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Planlieferungsliste mit Soll/Ist und Verzug</TooltipContent>
      </Tooltip>
      <Button size="sm" variant="outline" onClick={onAddTask}>
        <Plus /> Aufgabe
      </Button>
      <div className="ml-auto flex items-center gap-2">
        <FilterPopover employees={employees} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant={criticalVisible ? 'default' : 'outline'}
              onClick={toggleCritical}
              className={cn(criticalVisible && 'bg-red-600 text-white hover:bg-red-600/90')}
            >
              <Route /> Kritischer Pfad
            </Button>
          </TooltipTrigger>
          <TooltipContent>Kritischen Pfad hervorheben, Puffer anzeigen (P)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={onScrollToday}>
              <Crosshair /> Heute
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zum heutigen Datum springen (H)</TooltipContent>
        </Tooltip>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={zoom}
          onValueChange={(value) => value && setZoom(value as ZoomLevel)}
        >
          <ToggleGroupItem value="day">Tag</ToggleGroupItem>
          <ToggleGroupItem value="week">Woche</ToggleGroupItem>
          <ToggleGroupItem value="month">Monat</ToggleGroupItem>
          <ToggleGroupItem value="quarter">Quartal</ToggleGroupItem>
        </ToggleGroup>
        <Dialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label="Tastaturkürzel">
                  <Keyboard />
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent>Tastaturkürzel</TooltipContent>
          </Tooltip>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Tastatur & Maus</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {SHORTCUTS.map(([key, label]) => (
                <div key={key} className="contents">
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{key}</kbd>
                  <span className="text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}
