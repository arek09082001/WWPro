'use client';

/**
 * Left (sticky) table cells of one Gantt row: row number, name with indent,
 * plan category icon, plan number and status dot, computed dates (late ends
 * highlighted), duration, work and assignee avatars — inline-editable where
 * it makes sense, with a rich context menu including quick status changes.
 */

import type React from 'react';
import { ChevronDown, ChevronRight, Diamond } from 'lucide-react';
import type { ScheduledTask } from '@/engine/types';
import { formatDuration, formatIsoDate, formatWorkHours } from '@/lib/format';
import { PLAN_CATEGORIES, PLAN_STATUSES, PLAN_STATUS_ORDER, type PlanStatus } from '@/lib/plan-meta';
import type { EmployeeRow, TaskRow } from '@/lib/store/types';
import { cn } from '@/lib/utils';
import EmployeeAvatars from '@/features/projects/components/employee-avatars';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import EditableCell from './editable-cell';
import type { GanttRow } from '../hooks/use-schedule';

/** Column widths of the task table (name column flexes; start/end share one stacked cell). */
export const COLUMNS = { number: 28, name: 252, dates: 76, duration: 56, work: 52, people: 56 };
/** Total fixed width of the task table pane. */
export const TABLE_WIDTH =
  COLUMNS.number + COLUMNS.name + COLUMNS.dates + COLUMNS.duration + COLUMNS.work + COLUMNS.people;

/** Context-menu actions offered on a task row. */
export interface RowActions {
  insertBelow(row: GanttRow): void;
  insertAbove(row: GanttRow): void;
  addChild(row: GanttRow): void;
  addSectionBelow(row: GanttRow): void;
  indent(row: GanttRow): void;
  outdent(row: GanttRow): void;
  toggleMilestone(row: GanttRow): void;
  setStatus(row: GanttRow, status: PlanStatus): void;
  remove(row: GanttRow): void;
  open(row: GanttRow): void;
}

/** Formats an ISO date as compact German "TT.MM.JJ". */
function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}`;
}

/** Props of {@link TaskRowCells}. */
interface TaskRowCellsProps {
  row: GanttRow;
  scheduled: ScheduledTask | undefined;
  assignees: EmployeeRow[];
  selected: boolean;
  avgDayCapacity: number;
  /** Working days the task ends after its due date (0 = on time / no due date). */
  lateDays: number;
  onSelect: () => void;
  onToggleCollapsed: () => void;
  onCommitName: (name: string) => void;
  onCommitStart: (date: string) => void;
  onCommitEnd: (date: string) => void;
  onCommitDuration: (raw: string) => void;
  onCommitWork: (raw: string) => void;
  actions: RowActions;
  collapsed: boolean;
  /** Starts a row-reorder drag from anywhere on the row (guarded by a threshold). */
  onPointerDownReorder?: (e: React.PointerEvent) => void;
  /** Dims the row while it is the one being dragged. */
  dragging?: boolean;
}

/**
 * Renders the sticky table cells of one row including its context menu.
 * @param props - TaskRowCellsProps with the row model, schedule values and edit callbacks.
 * @returns A JSX element containing the table part of a Gantt row.
 */
export default function TaskRowCells({
  row, scheduled, assignees, selected, avgDayCapacity, lateDays,
  onSelect, onToggleCollapsed, onCommitName, onCommitStart, onCommitEnd,
  onCommitDuration, onCommitWork, actions, collapsed, onPointerDownReorder, dragging,
}: TaskRowCellsProps) {
  const { task, depth, hasChildren } = row;
  const isSummary = Boolean(scheduled?.isSummary);
  const category = PLAN_CATEGORIES[task.category];
  const status = PLAN_STATUSES[task.status];
  const CategoryIcon = category.icon;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'sticky left-0 z-10 flex h-full shrink-0 items-center border-r border-b text-xs',
            isSummary ? 'bg-muted' : 'bg-background',
            selected && 'bg-accent/70',
            onPointerDownReorder && 'cursor-grab',
            dragging && 'opacity-40',
          )}
          style={{ width: TABLE_WIDTH }}
          onPointerDown={onPointerDownReorder}
          onClick={onSelect}
          onDoubleClick={() => actions.open(row)}
        >
          <div
            style={{ width: COLUMNS.number }}
            className="shrink-0 text-center text-[10px] tabular-nums text-muted-foreground/70"
          >
            {row.index + 1}
          </div>
          <div className="flex h-full min-w-0 flex-1 items-center gap-1 pr-1" style={{ paddingLeft: 2 + depth * 16 }}>
            {hasChildren ? (
              <button
                type="button"
                aria-label={collapsed ? 'Aufklappen' : 'Zuklappen'}
                className="flex size-4 shrink-0 items-center justify-center rounded hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollapsed();
                }}
              >
                {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              </button>
            ) : (
              <span className="size-4 shrink-0" />
            )}
            {task.isMilestone ? (
              <Diamond className="size-3 shrink-0 fill-current" />
            ) : (
              !isSummary &&
              task.category !== 'sonstiges' && (
                <CategoryIcon
                  className="size-3.5 shrink-0"
                  style={{ color: category.color }}
                  aria-label={category.label}
                />
              )
            )}
            {task.planNumber && (
              <span className="shrink-0 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                {task.planNumber}
              </span>
            )}
            <EditableCell
              value={task.name}
              onCommit={onCommitName}
              className={cn(isSummary && 'font-semibold')}
              placeholder="Unbenannt"
            />
            {!isSummary && !task.isMilestone && (
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: status.color }}
                title={status.label}
              />
            )}
          </div>
          <div style={{ width: COLUMNS.dates }} className="shrink-0 px-0.5">
            <EditableCell
              dense
              type="date"
              value={scheduled?.start.date ?? ''}
              display={scheduled ? <span className="tabular-nums">{shortDate(scheduled.start.date)}</span> : '–'}
              onCommit={onCommitStart}
              disabled={isSummary}
            />
            <EditableCell
              dense
              type="date"
              value={scheduled?.end.date ?? ''}
              display={
                scheduled ? (
                  <span
                    className={cn('tabular-nums', lateDays > 0 && 'font-semibold text-red-600')}
                    title={
                      lateDays > 0 && task.dueDate
                        ? `Liefertermin ${formatIsoDate(task.dueDate)} um ${lateDays.toLocaleString('de-DE')} Arbeitstage überschritten`
                        : undefined
                    }
                  >
                    {shortDate(scheduled.end.date)}
                  </span>
                ) : (
                  '–'
                )
              }
              onCommit={onCommitEnd}
              disabled={isSummary || task.isMilestone}
            />
          </div>
          <div style={{ width: COLUMNS.duration }} className="shrink-0 px-0.5">
            <EditableCell
              value={String((task.durationMinutes / avgDayCapacity).toLocaleString('de-DE', { maximumFractionDigits: 2 }))}
              display={task.isMilestone ? '◆' : formatDuration(scheduled?.durationMinutes ?? task.durationMinutes, avgDayCapacity)}
              onCommit={onCommitDuration}
              disabled={isSummary || task.isMilestone}
              align="right"
            />
          </div>
          <div style={{ width: COLUMNS.work }} className="shrink-0 px-0.5">
            <EditableCell
              value={String(Math.round(((scheduled?.workMinutes ?? task.workMinutes) / 60) * 10) / 10)}
              display={task.isMilestone ? '–' : formatWorkHours(scheduled?.workMinutes ?? task.workMinutes)}
              onCommit={onCommitWork}
              disabled={isSummary || task.isMilestone}
              align="right"
            />
          </div>
          <div style={{ width: COLUMNS.people }} className="flex shrink-0 justify-end px-1">
            <EmployeeAvatars employees={assignees} />
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <ContextMenuItem onSelect={() => actions.open(row)}>
          Details öffnen <ContextMenuShortcut>Enter</ContextMenuShortcut>
        </ContextMenuItem>
        {!isSummary && !task.isMilestone && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              Status: <span className="ml-1 font-medium">{status.label}</span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {PLAN_STATUS_ORDER.map((value) => (
                <ContextMenuItem
                  key={value}
                  disabled={value === task.status}
                  onSelect={() => actions.setStatus(row, value)}
                >
                  <span className="mr-1.5 size-2 rounded-full" style={{ backgroundColor: PLAN_STATUSES[value].color }} />
                  {PLAN_STATUSES[value].label}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => actions.insertBelow(row)}>Aufgabe darunter einfügen</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.insertAbove(row)}>Aufgabe darüber einfügen</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.addChild(row)}>Teilaufgabe hinzufügen</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.addSectionBelow(row)}>Abschnitt darunter einfügen</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => actions.indent(row)}>Einrücken</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.outdent(row)} disabled={task.parentId === null}>
          Ausrücken
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => actions.toggleMilestone(row)} disabled={isSummary}>
          {task.isMilestone ? 'In Aufgabe umwandeln' : 'In Meilenstein umwandeln'}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => actions.remove(row)}>
          Löschen <ContextMenuShortcut>Entf</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
