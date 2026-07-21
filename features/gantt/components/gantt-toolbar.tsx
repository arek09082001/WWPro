'use client';

/**
 * Slim Gantt toolbar: back link, project name, add-task button, zoom control,
 * critical-path toggle, "Heute" scroll button and the keyboard cheat sheet.
 * Everything else lives in hidden UI (context menus, hover cards, palette).
 */

import Link from 'next/link';
import { ArrowLeft, Crosshair, Keyboard, Plus, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ProjectRow } from '@/lib/store/types';
import { useGanttStore, type ZoomLevel } from '../hooks/use-gantt-store';

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

/** Props of {@link GanttToolbar}. */
interface GanttToolbarProps {
  project: ProjectRow;
  onAddTask: () => void;
  onScrollToday: () => void;
}

/**
 * Renders the toolbar above the Gantt.
 * @param props - GanttToolbarProps containing the project and action callbacks.
 * @param props.project - Project shown in the header.
 * @param props.onAddTask - Creates a task below the selection.
 * @param props.onScrollToday - Scrolls the timeline to today.
 * @returns A JSX element with the toolbar row.
 */
export default function GanttToolbar({ project, onAddTask, onScrollToday }: GanttToolbarProps) {
  const zoom = useGanttStore((s) => s.zoom);
  const setZoom = useGanttStore((s) => s.setZoom);
  const criticalVisible = useGanttStore((s) => s.criticalVisible);
  const toggleCritical = useGanttStore((s) => s.toggleCritical);

  return (
    <header className="flex items-center gap-3 border-b px-4 py-2">
      <Button asChild variant="ghost" size="icon-sm" aria-label="Zurück zu Projekten">
        <Link href="/projects"><ArrowLeft /></Link>
      </Button>
      <span className="size-2.5 rounded-full" style={{ backgroundColor: project.color }} />
      <h1 className="truncate font-semibold">{project.name}</h1>
      <Button size="sm" variant="outline" onClick={onAddTask}>
        <Plus /> Aufgabe
      </Button>
      <div className="ml-auto flex items-center gap-2">
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
            <TooltipContent>Tastaturkürzel (?)</TooltipContent>
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
