'use client';

/**
 * Left (sticky) table cells of one Gantt row: name with indent/chevron and a
 * context menu, computed dates, duration, work and assignee avatars — every
 * cell inline-editable where it makes sense.
 */

import { ChevronDown, ChevronRight, Diamond } from 'lucide-react';
import type { ScheduledTask } from '@/engine/types';
import { formatDuration, formatWorkHours } from '@/lib/format';
import type { EmployeeRow, TaskRow } from '@/lib/store/types';
import { cn } from '@/lib/utils';
import EmployeeAvatars from '@/features/projects/components/employee-avatars';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import EditableCell from './editable-cell';
import type { GanttRow } from '../hooks/use-schedule';

/** Column widths of the task table (name column flexes). */
export const COLUMNS = { start: 88, end: 88, duration: 64, work: 64, people: 76 };
/** Total fixed width of the task table pane. */
export const TABLE_WIDTH = 300 + COLUMNS.start + COLUMNS.end + COLUMNS.duration + COLUMNS.work + COLUMNS.people;

/** Context-menu actions offered on a task row. */
export interface RowActions {
  insertBelow(row: GanttRow): void;
  insertAbove(row: GanttRow): void;
  addChild(row: GanttRow): void;
  indent(row: GanttRow): void;
  outdent(row: GanttRow): void;
  toggleMilestone(row: GanttRow): void;
  remove(row: GanttRow): void;
  open(row: GanttRow): void;
}

/** Props of {@link TaskRowCells}. */
interface TaskRowCellsProps {
  row: GanttRow;
  scheduled: ScheduledTask | undefined;
  assignees: EmployeeRow[];
  selected: boolean;
  avgDayCapacity: number;
  onSelect: () => void;
  onToggleCollapsed: () => void;
  onCommitName: (name: string) => void;
  onCommitStart: (date: string) => void;
  onCommitEnd: (date: string) => void;
  onCommitDuration: (raw: string) => void;
  onCommitWork: (raw: string) => void;
  actions: RowActions;
  collapsed: boolean;
}

/**
 * Renders the sticky table cells of one row including its context menu.
 * @param props - TaskRowCellsProps with the row model, schedule values and edit callbacks.
 * @returns A JSX element containing the table part of a Gantt row.
 */
export default function TaskRowCells({
  row, scheduled, assignees, selected, avgDayCapacity,
  onSelect, onToggleCollapsed, onCommitName, onCommitStart, onCommitEnd,
  onCommitDuration, onCommitWork, actions, collapsed,
}: TaskRowCellsProps) {
  const { task, depth, hasChildren } = row;
  const isSummary = Boolean(scheduled?.isSummary);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'sticky left-0 z-10 flex h-full shrink-0 items-center border-r border-b bg-background text-xs',
            selected && 'bg-accent/70',
          )}
          style={{ width: TABLE_WIDTH }}
          onClick={onSelect}
          onDoubleClick={() => actions.open(row)}
        >
          <div className="flex h-full min-w-0 flex-1 items-center gap-0.5 pr-1" style={{ paddingLeft: 6 + depth * 16 }}>
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
            {task.isMilestone && <Diamond className="size-3 shrink-0 fill-current" />}
            <EditableCell
              value={task.name}
              onCommit={onCommitName}
              className={cn(isSummary && 'font-semibold')}
              placeholder="Unbenannt"
            />
          </div>
          <div style={{ width: COLUMNS.start }} className="shrink-0 px-0.5">
            <EditableCell
              type="date"
              value={scheduled?.start.date ?? ''}
              display={scheduled ? `${scheduled.start.date.slice(8, 10)}.${scheduled.start.date.slice(5, 7)}.${scheduled.start.date.slice(2, 4)}` : '–'}
              onCommit={onCommitStart}
              disabled={isSummary}
            />
          </div>
          <div style={{ width: COLUMNS.end }} className="shrink-0 px-0.5">
            <EditableCell
              type="date"
              value={scheduled?.end.date ?? ''}
              display={scheduled ? `${scheduled.end.date.slice(8, 10)}.${scheduled.end.date.slice(5, 7)}.${scheduled.end.date.slice(2, 4)}` : '–'}
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
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => actions.insertBelow(row)}>Aufgabe darunter einfügen</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.insertAbove(row)}>Aufgabe darüber einfügen</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.addChild(row)}>Teilaufgabe hinzufügen</ContextMenuItem>
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
