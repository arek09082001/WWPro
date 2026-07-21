'use client';

/**
 * Detail popover of a clicked workload cell: date heading, planned vs.
 * available hours, absence/holiday notes and the list of contributing tasks
 * with links into the respective project Gantt.
 *
 * A single instance is mounted by the page and anchored to the clicked cell
 * via a fixed-position virtual anchor, so the grid cells stay plain divs.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { weekdayIndex } from '@/engine/date-utils';
import { formatIsoDate, formatIsoDateShort, formatWorkHours } from '@/lib/format';
import type { EmployeeRow } from '@/lib/store/types';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from '@/components/ui/popover';
import {
  ABSENCE_LABELS,
  WEEKDAY_LABELS_LONG,
  isoWeekNumber,
  taskContributions,
  type CellInfo,
  type TeamWorkload,
} from '../lib/workload';

/** Selection state of the popover: the clicked employee, cell and screen rect. */
export interface CellSelection {
  /** Employee of the clicked row. */
  employee: EmployeeRow;
  /** The clicked cell. */
  cell: CellInfo;
  /** Viewport rectangle of the clicked cell (anchor position). */
  rect: { top: number; left: number; width: number; height: number };
}

/** Props of {@link WorkloadCellPopover}. */
export interface WorkloadCellPopoverProps {
  /** The precomputed team workload (for the per-task breakdown). */
  workload: TeamWorkload;
  /** Current selection; the popover only renders while one exists. */
  selection: CellSelection;
  /** Called when the popover is dismissed. */
  onClose: () => void;
}

/**
 * Renders the detail popover for the currently selected workload cell.
 * @param props - Selection, workload data and close callback.
 * @param props.workload - The precomputed team workload.
 * @param props.selection - The clicked employee/cell and its screen position.
 * @param props.onClose - Invoked when the popover should close.
 * @returns A JSX element with the anchored popover.
 */
export default function WorkloadCellPopover({
  workload,
  selection,
  onClose,
}: WorkloadCellPopoverProps) {
  const { employee, cell, rect } = selection;
  const isDay = cell.start === cell.end;

  const contributions = useMemo(
    () => taskContributions(workload, employee.id, cell.start, cell.end),
    [workload, employee.id, cell.start, cell.end],
  );

  const heading = isDay
    ? `${WEEKDAY_LABELS_LONG[weekdayIndex(cell.start)]}, ${formatIsoDate(cell.start)}`
    : `KW ${isoWeekNumber(cell.start)} · ${formatIsoDateShort(cell.start)} – ${formatIsoDate(cell.end)}`;
  const percent = cell.capacityMinutes > 0 ? Math.round(cell.utilization * 100) : undefined;

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor asChild>
        <span
          aria-hidden
          style={{
            position: 'fixed',
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            pointerEvents: 'none',
          }}
        />
      </PopoverAnchor>
      <PopoverContent side="bottom" align="start" className="w-80 gap-2 p-3">
        <PopoverHeader className="gap-0.5">
          <PopoverTitle>{heading}</PopoverTitle>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: employee.color }}
            />
            {employee.name}
          </p>
        </PopoverHeader>

        <p className="text-sm tabular-nums">
          {formatWorkHours(cell.assignedMinutes)} von {formatWorkHours(cell.capacityMinutes)}{' '}
          verplant
          {percent !== undefined && (
            <span
              className={cn(
                'ml-1.5 rounded px-1 py-0.5 text-[11px] font-medium',
                percent > 100
                  ? 'bg-red-500/15 text-red-600'
                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
              )}
            >
              {percent} %
            </span>
          )}
        </p>

        {cell.kind === 'absence' && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Abwesend ({ABSENCE_LABELS[cell.absenceType ?? 'other']})
          </p>
        )}
        {cell.kind === 'off' && cell.exceptionName && (
          <p className="text-sm text-muted-foreground">Feiertag: {cell.exceptionName}</p>
        )}
        {cell.kind === 'off' && !cell.exceptionName && isDay && weekdayIndex(cell.start) >= 5 && (
          <p className="text-sm text-muted-foreground">Wochenende</p>
        )}

        {contributions.length > 0 ? (
          <ul className="-mx-1 max-h-64 divide-y divide-border/50 overflow-y-auto">
            {contributions.map(({ task, project, minutes }) => (
              <li key={task.id}>
                <Link
                  href={`/projects/${project.id}/gantt?task=${task.id}`}
                  onClick={onClose}
                  className="flex items-center gap-2 rounded px-1 py-1.5 transition-colors hover:bg-muted"
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] leading-tight font-medium">
                      {task.name}
                    </span>
                    <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                      {project.name}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatWorkHours(minutes)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          cell.kind === 'work' && (
            <p className="text-xs text-muted-foreground">Keine Aufgaben in diesem Zeitraum.</p>
          )
        )}
      </PopoverContent>
    </Popover>
  );
}
