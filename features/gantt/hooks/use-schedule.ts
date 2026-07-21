'use client';

/**
 * Derives the computed schedule, the visible row model (hierarchy with
 * collapsed summaries) and the ghost what-if preview from the snapshot and
 * the transient drag state.
 */

import { useMemo } from 'react';
import { compileCalendar, type CompiledCalendar } from '@/engine/calendar';
import { addDays } from '@/engine/date-utils';
import { computeSchedule } from '@/engine/schedule';
import type { ScheduleResult, WorkMoment } from '@/engine/types';
import { buildScheduleInput } from '@/lib/mappers';
import type { ProjectSnapshot, TaskRow } from '@/lib/store/types';
import { useGanttStore } from './use-gantt-store';

/** One visible row of the Gantt (task + hierarchy metadata). */
export interface GanttRow {
  task: TaskRow;
  depth: number;
  hasChildren: boolean;
  index: number;
}

/** Flattens the task tree in sortKey order, hiding children of collapsed summaries. */
export function flattenTasks(tasks: TaskRow[], collapsed: Set<string>): GanttRow[] {
  const childrenOf = new Map<string | null, TaskRow[]>();
  for (const task of tasks) {
    const list = childrenOf.get(task.parentId) ?? [];
    list.push(task);
    childrenOf.set(task.parentId, list);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
  }
  const rows: GanttRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const task of childrenOf.get(parentId) ?? []) {
      const hasChildren = (childrenOf.get(task.id)?.length ?? 0) > 0;
      rows.push({ task, depth, hasChildren, index: rows.length });
      if (hasChildren && !collapsed.has(task.id)) walk(task.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/** Result bundle of {@link useSchedule}. */
export interface ScheduleBundle {
  result: ScheduleResult;
  rows: GanttRow[];
  rowIndexById: Map<string, number>;
  projectCalendar: CompiledCalendar;
  /** Ghost positions of tasks affected by the active drag (id → moments). */
  ghost: Map<string, { start: WorkMoment; end: WorkMoment }> | null;
}

/**
 * Computes schedule + row model + ghost preview for a snapshot.
 * @param snapshot - The current project snapshot (optimistically updated).
 * @returns The memoized {@link ScheduleBundle}.
 */
export function useSchedule(snapshot: ProjectSnapshot): ScheduleBundle {
  const collapsed = useGanttStore((s) => s.collapsed);
  const drag = useGanttStore((s) => s.drag);

  const input = useMemo(() => buildScheduleInput(snapshot), [snapshot]);
  const result = useMemo(() => computeSchedule(input), [input]);
  const rows = useMemo(() => flattenTasks(snapshot.tasks, collapsed), [snapshot.tasks, collapsed]);
  const rowIndexById = useMemo(
    () => new Map(rows.map((row) => [row.task.id, row.index])),
    [rows],
  );
  const projectCalendar = useMemo(() => compileCalendar(input.projectCalendar), [input]);

  const ghost = useMemo(() => {
    if (!drag) return null;
    const task = snapshot.tasks.find((t) => t.id === drag.taskId);
    if (!task) return null;
    let patched: TaskRow;
    if (drag.kind === 'move') {
      if (drag.deltaDays === 0) return null;
      const scheduled = result.tasks.get(task.id);
      if (!scheduled) return null;
      const newStart = addDays(scheduled.start.date, drag.deltaDays);
      patched = { ...task, constraintType: 'start_no_earlier_than', constraintDate: newStart };
    } else {
      if (drag.targetDurationMinutes === undefined) return null;
      patched = {
        ...task,
        durationMinutes: drag.targetDurationMinutes,
        workMinutes: task.taskType === 'fixed_work' ? task.workMinutes : drag.targetDurationMinutes,
      };
    }
    const hypothetical = {
      ...snapshot,
      tasks: snapshot.tasks.map((t) => (t.id === task.id ? patched : t)),
    };
    const ghostResult = computeSchedule(buildScheduleInput(hypothetical));
    const changes = new Map<string, { start: WorkMoment; end: WorkMoment }>();
    for (const [id, scheduled] of ghostResult.tasks) {
      const original = result.tasks.get(id);
      if (
        !original ||
        original.start.date !== scheduled.start.date ||
        original.start.minute !== scheduled.start.minute ||
        original.end.date !== scheduled.end.date ||
        original.end.minute !== scheduled.end.minute
      ) {
        changes.set(id, { start: scheduled.start, end: scheduled.end });
      }
    }
    return changes;
  }, [drag, snapshot, result]);

  return { result, rows, rowIndexById, projectCalendar, ghost };
}
