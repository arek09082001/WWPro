'use client';

/**
 * Heatmap grid of the team workload view: sticky employee column on the left,
 * sticky month/KW/day headers on top, one utilization cell per employee and
 * day (or ISO week), a sticky "Team gesamt" summary row and expandable
 * per-project sub-rows with slim utilization bars.
 *
 * Cells are plain divs with `title` tooltips for performance; the detail
 * popover is controlled by the page via `onCellClick`.
 */

import type { CSSProperties } from 'react';
import { ChevronRight } from 'lucide-react';
import { weekdayIndex } from '@/engine/date-utils';
import type { AbsenceType, IsoDate } from '@/engine/types';
import { formatIsoDate, formatIsoDateShort, formatWorkHours } from '@/lib/format';
import type { EmployeeRow, ProjectRow } from '@/lib/store/types';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initialsOf } from '@/features/projects/components/employee-avatars';
import {
  ABSENCE_LABELS,
  WEEKDAY_LABELS_SHORT,
  isoWeekNumber,
  type CellInfo,
} from '../lib/workload';

/** Column granularity of the grid. */
export type Granularity = 'day' | 'week';

/** A spanning header group (month or calendar week). */
export interface HeaderGroup {
  /** Stable React key. */
  key: string;
  /** Label text; empty string renders a blank spacer. */
  label: string;
  /** Number of grid columns the group spans. */
  span: number;
}

/** One timeline column of the grid (a day or an ISO week). */
export interface GridColumn {
  /** Stable React key (the start date). */
  key: string;
  /** First ISO day of the column (inclusive). */
  start: IsoDate;
  /** Last ISO day of the column (inclusive). */
  end: IsoDate;
  /** True when today falls inside the column. */
  isToday: boolean;
}

/** Row model of one employee including precomputed cells. */
export interface GridRowModel {
  /** The employee of the row. */
  employee: EmployeeRow;
  /** Weekly capacity label, e.g. "40 h/Woche". */
  weeklyLabel: string;
  /** One cell per grid column. */
  cells: CellInfo[];
  /** Projects the employee has assigned minutes in within the visible range. */
  projects: ProjectRow[];
}

/** Complete view model of the grid. */
export interface GridModel {
  /** Timeline columns. */
  columns: GridColumn[];
  /** Month header groups (top header row). */
  monthGroups: HeaderGroup[];
  /** Calendar-week header groups (day mode only). */
  weekGroups: HeaderGroup[];
  /** Employee rows. */
  rows: GridRowModel[];
  /** Per-column team summary (capacity-weighted average utilization). */
  summary: { utilization: number; hasCapacity: boolean }[];
}

/** Props of {@link WorkloadGrid}. */
export interface WorkloadGridProps {
  /** The precomputed view model. */
  model: GridModel;
  /** Column granularity ('day' renders percentages inside the cells). */
  granularity: Granularity;
  /** Ids of employees whose per-project sub-rows are expanded. */
  expanded: Set<string>;
  /** Toggles the expansion of one employee row. */
  onToggleExpand: (employeeId: string) => void;
  /** Fired when a workload cell is clicked (opens the detail popover). */
  onCellClick: (employee: EmployeeRow, cell: CellInfo, rect: DOMRect) => void;
  /** Fired when the grid scrolls (used to dismiss the popover). */
  onScroll?: () => void;
}

const LEFT_W = 224;
const H_MONTHS = 24;
const H_WEEKS = 18;
const H_COLS = 34;
const ROW_H = 44;
const SUB_H = 18;
const SUM_H = 28;

/** Striped backgrounds per absence type (amber/red/slate tints). */
const ABSENCE_STYLES: Record<AbsenceType, CSSProperties> = {
  vacation: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    backgroundImage:
      'repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.45) 0 2px, transparent 2px 5px)',
  },
  sick: {
    backgroundColor: 'rgba(220, 38, 38, 0.10)',
    backgroundImage:
      'repeating-linear-gradient(45deg, rgba(220, 38, 38, 0.40) 0 2px, transparent 2px 5px)',
  },
  other: {
    backgroundColor: 'rgba(100, 116, 139, 0.12)',
    backgroundImage:
      'repeating-linear-gradient(45deg, rgba(100, 116, 139, 0.45) 0 2px, transparent 2px 5px)',
  },
};

/** Visual description of a cell's inner square. */
interface CellVisual {
  className?: string;
  style?: CSSProperties;
  label?: string;
  labelClass?: string;
}

/** Maps a cell to background/label styling per the utilization rules. */
function cellVisual(cell: CellInfo, granularity: Granularity): CellVisual {
  if (cell.kind === 'absence') {
    return {
      style: ABSENCE_STYLES[cell.absenceType ?? 'other'],
      label: cell.assignedMinutes > 0 ? '!' : undefined,
      labelClass: 'font-bold text-red-600',
    };
  }
  if (cell.kind === 'off') {
    return { className: 'bg-muted/60' };
  }
  const u = cell.utilization;
  if (u <= 0) {
    return { className: 'border border-border/40 bg-muted/20' };
  }
  if (u <= 1) {
    const alpha = Math.max(0.15, Math.min(1, u));
    return {
      style: { backgroundColor: `rgba(16, 185, 129, ${alpha.toFixed(3)})` },
      label: granularity === 'day' ? String(Math.round(u * 100)) : undefined,
      labelClass: u > 0.55 ? 'text-white' : 'text-emerald-950 dark:text-emerald-200',
    };
  }
  const alpha = Number.isFinite(u) ? Math.min(0.95, 0.5 + (u - 1) * 0.6) : 0.95;
  return {
    style: { backgroundColor: `rgba(220, 38, 38, ${alpha.toFixed(3)})` },
    label: '!',
    labelClass: 'font-bold text-white',
  };
}

/** Builds the cheap `title` tooltip of a cell. */
function cellTitle(cell: CellInfo): string {
  const isDay = cell.start === cell.end;
  const range = isDay
    ? `${WEEKDAY_LABELS_SHORT[weekdayIndex(cell.start)]} ${formatIsoDate(cell.start)}`
    : `KW ${isoWeekNumber(cell.start)} (${formatIsoDateShort(cell.start)} – ${formatIsoDateShort(cell.end)})`;
  if (cell.kind === 'absence') {
    const label = `${range}: Abwesend (${ABSENCE_LABELS[cell.absenceType ?? 'other']})`;
    return cell.assignedMinutes > 0
      ? `${label} – dennoch ${formatWorkHours(cell.assignedMinutes)} verplant`
      : label;
  }
  if (cell.kind === 'off') {
    if (cell.exceptionName) return `${range}: ${cell.exceptionName}`;
    if (isDay && weekdayIndex(cell.start) >= 5) return `${range}: Wochenende`;
    return `${range}: Arbeitsfrei`;
  }
  const percent = Math.round(cell.utilization * 100);
  return `${range}: ${formatWorkHours(cell.assignedMinutes)} von ${formatWorkHours(cell.capacityMinutes)} (${percent} %)`;
}

/** Background color of a summary bar for an average utilization. */
function summaryColor(utilization: number, hasCapacity: boolean): string {
  if (!hasCapacity || utilization <= 0) return 'rgba(100, 116, 139, 0.15)';
  if (utilization <= 1) return `rgba(16, 185, 129, ${(0.15 + 0.75 * utilization).toFixed(3)})`;
  return `rgba(220, 38, 38, ${Math.min(0.9, 0.45 + (utilization - 1) * 0.6).toFixed(3)})`;
}

/**
 * Renders the scrollable workload heatmap with sticky headers and rows.
 * @param props - Grid view model, interaction state and callbacks.
 * @param props.model - The precomputed grid view model.
 * @param props.granularity - Column granularity ('day' | 'week').
 * @param props.expanded - Employee ids with expanded per-project sub-rows.
 * @param props.onToggleExpand - Toggles a row's expansion.
 * @param props.onCellClick - Opens the detail popover for a cell.
 * @param props.onScroll - Called on grid scroll (dismisses the popover).
 * @returns A JSX element with the complete grid.
 */
export default function WorkloadGrid({
  model,
  granularity,
  expanded,
  onToggleExpand,
  onCellClick,
  onScroll,
}: WorkloadGridProps) {
  const { columns, monthGroups, weekGroups, rows, summary } = model;
  const isDayMode = granularity === 'day';
  const colW = isDayMode ? 28 : 32;
  const headerH = H_MONTHS + (isDayMode ? H_WEEKS : 0) + H_COLS;
  const template = `${LEFT_W}px repeat(${columns.length}, ${colW}px)`;
  const subDenominator = isDayMode ? 480 : 2400;

  /** True when the column starts a new week (stronger left border in day mode). */
  const weekStart = (column: GridColumn) => isDayMode && weekdayIndex(column.start) === 0;

  return (
    <div className="min-h-0 flex-1 overflow-auto" onScroll={onScroll}>
      <div className="w-max" style={{ display: 'grid', gridTemplateColumns: template }}>
        {/* Header row 1: months */}
        <div
          className="sticky left-0 top-0 z-40 border-b border-border/40 bg-background"
          style={{ height: H_MONTHS }}
        />
        {monthGroups.map((group) => (
          <div
            key={group.key}
            className="sticky top-0 z-30 flex items-center overflow-hidden border-b border-l border-border/40 border-l-border/60 bg-background px-1.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground"
            style={{ height: H_MONTHS, gridColumn: `span ${group.span}` }}
          >
            {group.label}
          </div>
        ))}

        {/* Header row 2 (day mode): calendar weeks */}
        {isDayMode && (
          <>
            <div
              className="sticky left-0 z-40 border-b border-border/40 bg-background"
              style={{ height: H_WEEKS, top: H_MONTHS }}
            />
            {weekGroups.map((group) => (
              <div
                key={group.key}
                className="sticky z-30 flex items-center overflow-hidden border-b border-l border-border/40 border-l-border/60 bg-background px-1.5 text-[9px] whitespace-nowrap text-muted-foreground"
                style={{ height: H_WEEKS, top: H_MONTHS, gridColumn: `span ${group.span}` }}
              >
                {group.label}
              </div>
            ))}
          </>
        )}

        {/* Header row 3: day/week columns */}
        <div
          className="sticky left-0 z-40 flex items-end border-b bg-background px-3 pb-1 text-[10px] font-medium text-muted-foreground"
          style={{ height: H_COLS, top: headerH - H_COLS }}
        >
          Mitarbeiter
        </div>
        {columns.map((column) => {
          const wd = weekdayIndex(column.start);
          return (
            <div
              key={column.key}
              title={isDayMode ? formatIsoDate(column.start) : undefined}
              className={cn(
                'sticky z-30 flex flex-col items-center justify-center gap-px border-b bg-background',
                weekStart(column) && 'border-l border-l-border/60',
              )}
              style={{ height: H_COLS, top: headerH - H_COLS }}
            >
              {isDayMode ? (
                <>
                  <span className={cn('text-[9px] leading-none text-muted-foreground', wd >= 5 && 'opacity-50')}>
                    {WEEKDAY_LABELS_SHORT[wd]}
                  </span>
                  <span
                    className={cn(
                      'flex size-4.5 items-center justify-center rounded-full text-[11px] leading-none tabular-nums',
                      column.isToday
                        ? 'bg-primary font-semibold text-primary-foreground'
                        : wd >= 5
                          ? 'text-muted-foreground'
                          : 'text-foreground',
                    )}
                  >
                    {Number(column.start.slice(8, 10))}
                  </span>
                </>
              ) : (
                <>
                  <span
                    className={cn(
                      'rounded px-0.5 text-[11px] leading-none font-medium tabular-nums',
                      column.isToday && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {isoWeekNumber(column.start)}
                  </span>
                  <span className="text-[8px] leading-none text-muted-foreground tabular-nums">
                    {formatIsoDateShort(column.start)}
                  </span>
                </>
              )}
            </div>
          );
        })}

        {/* Sticky summary row: team average per column */}
        <div
          className="sticky left-0 z-40 flex items-center border-b bg-background px-3 text-[11px] font-medium text-muted-foreground"
          style={{ height: SUM_H, top: headerH }}
        >
          Team gesamt
        </div>
        {summary.map((entry, i) => {
          const column = columns[i];
          return (
            <div
              key={column.key}
              title={
                entry.hasCapacity
                  ? `Ø Auslastung ${Math.round(entry.utilization * 100)} %`
                  : 'Keine Kapazität'
              }
              className={cn(
                'sticky z-10 flex items-center justify-center border-b bg-background',
                weekStart(column) && 'border-l border-l-border/60',
                column.isToday && 'bg-primary/5',
              )}
              style={{ height: SUM_H, top: headerH }}
            >
              <div
                className="h-2 rounded-[3px]"
                style={{
                  width: colW - 10,
                  backgroundColor: summaryColor(entry.utilization, entry.hasCapacity),
                }}
              />
            </div>
          );
        })}

        {/* Employee rows */}
        {rows.map((row) => {
          const isExpanded = expanded.has(row.employee.id) && row.projects.length > 0;
          return (
            <div key={row.employee.id} className="contents">
              <div
                className="sticky left-0 z-20 flex items-center gap-1.5 border-b border-border/40 bg-background pr-2 pl-1.5"
                style={{ height: ROW_H }}
              >
                {row.projects.length > 0 ? (
                  <button
                    type="button"
                    aria-label={isExpanded ? 'Projekte einklappen' : 'Projekte aufklappen'}
                    aria-expanded={isExpanded}
                    onClick={() => onToggleExpand(row.employee.id)}
                    className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ChevronRight
                      className={cn('size-3.5 transition-transform', isExpanded && 'rotate-90')}
                    />
                  </button>
                ) : (
                  <span className="size-5 shrink-0" />
                )}
                <Avatar className="size-6 shrink-0">
                  <AvatarFallback
                    className="text-[9px] font-semibold text-white"
                    style={{ backgroundColor: row.employee.color }}
                  >
                    {initialsOf(row.employee.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-[13px] leading-tight font-medium">
                    {row.employee.name}
                  </div>
                  <div className="text-[10px] leading-tight text-muted-foreground tabular-nums">
                    {row.weeklyLabel}
                  </div>
                </div>
              </div>
              {row.cells.map((cell, i) => {
                const column = columns[i];
                const visual = cellVisual(cell, granularity);
                return (
                  <div
                    key={column.key}
                    title={cellTitle(cell)}
                    onClick={(event) =>
                      onCellClick(row.employee, cell, event.currentTarget.getBoundingClientRect())
                    }
                    className={cn(
                      'flex cursor-pointer items-center justify-center border-b border-border/40 p-[3px]',
                      weekStart(column) && 'border-l border-l-border/60',
                      column.isToday && 'bg-primary/5',
                    )}
                    style={{ height: ROW_H }}
                  >
                    <div
                      className={cn(
                        'flex h-full w-full items-center justify-center rounded-[5px] text-[10px] leading-none font-medium tabular-nums',
                        visual.className,
                        visual.labelClass,
                      )}
                      style={visual.style}
                    >
                      {visual.label}
                    </div>
                  </div>
                );
              })}

              {/* Expanded per-project sub-rows */}
              {isExpanded &&
                row.projects.map((project, projectIndex) => {
                  const isLast = projectIndex === row.projects.length - 1;
                  return (
                    <div key={project.id} className="contents">
                      <div
                        className={cn(
                          'sticky left-0 z-20 flex items-center gap-1.5 bg-background pr-2 pl-9',
                          isLast && 'border-b border-border/40',
                        )}
                        style={{ height: SUB_H }}
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: project.color }}
                        />
                        <span className="truncate text-[10px] text-muted-foreground">
                          {project.name}
                        </span>
                      </div>
                      {row.cells.map((cell, i) => {
                        const column = columns[i];
                        const minutes = cell.byProject.get(project.id) ?? 0;
                        const u = minutes / (cell.capacityMinutes || subDenominator);
                        return (
                          <div
                            key={column.key}
                            title={minutes > 0 ? `${project.name}: ${formatWorkHours(minutes)}` : undefined}
                            className={cn(
                              'flex items-end px-[4px] pb-[3px]',
                              isLast && 'border-b border-border/40',
                              weekStart(column) && 'border-l border-l-border/60',
                              column.isToday && 'bg-primary/5',
                            )}
                            style={{ height: SUB_H }}
                          >
                            {minutes > 0 && (
                              <div
                                className="w-full rounded-[2px]"
                                style={{
                                  height: Math.round(2 + 8 * Math.min(1, u)),
                                  backgroundColor: project.color,
                                  opacity: 0.4 + 0.6 * Math.min(1, u),
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
