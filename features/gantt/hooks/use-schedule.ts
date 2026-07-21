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

/**
 * Flattens the task tree in sortKey order, hiding children of collapsed
 * summaries. When `visible` is given, only tasks in the set are emitted
 * (the set must already contain the ancestors of every match).
 */
export function flattenTasks(
  tasks: TaskRow[],
  collapsed: Set<string>,
  visible?: Set<string>,
): GanttRow[] {
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
      if (visible && !visible.has(task.id)) continue;
      const hasChildren = (childrenOf.get(task.id)?.length ?? 0) > 0;
      rows.push({ task, depth, hasChildren, index: rows.length });
      if (hasChildren && !collapsed.has(task.id)) walk(task.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/** Working days a task finishes after its due date (0 when on time or no due date). */
export function lateWorkingDays(
  task: TaskRow,
  end: WorkMoment | undefined,
  calendar: CompiledCalendar,
): number {
  if (!task.dueDate || !end) return 0;
  const overrun = calendar.workingMinutesBetween({ date: task.dueDate, minute: 1440 }, end);
  if (overrun <= 0) return 0;
  return Math.round((overrun / calendar.averageDayCapacity) * 10) / 10;
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
  const filter = useGanttStore((s) => s.filter);

  const input = useMemo(() => buildScheduleInput(snapshot), [snapshot]);
  const result = useMemo(() => computeSchedule(input), [input]);
  const projectCalendar = useMemo(() => compileCalendar(input.projectCalendar), [input]);

  /** Ids passing the filter, expanded with all their ancestors (undefined = filter inactive). */
  const visibleIds = useMemo(() => {
    const active =
      filter.employeeIds.length > 0 ||
      filter.categories.length > 0 ||
      filter.statuses.length > 0 ||
      filter.onlyCritical ||
      filter.onlyLate;
    if (!active) return undefined;
    const byId = new Map(snapshot.tasks.map((t) => [t.id, t]));
    const employeesByTask = new Map<string, string[]>();
    for (const a of snapshot.assignments) {
      employeesByTask.set(a.taskId, [...(employeesByTask.get(a.taskId) ?? []), a.employeeId]);
    }
    const summaryIds = new Set(snapshot.tasks.map((t) => t.parentId).filter(Boolean) as string[]);
    const visible = new Set<string>();
    for (const task of snapshot.tasks) {
      if (summaryIds.has(task.id)) continue; // summaries follow their children
      const scheduled = result.tasks.get(task.id);
      if (filter.employeeIds.length > 0) {
        const employees = employeesByTask.get(task.id) ?? [];
        if (!employees.some((id) => filter.employeeIds.includes(id))) continue;
      }
      if (filter.categories.length > 0 && !filter.categories.includes(task.category)) continue;
      if (filter.statuses.length > 0 && !filter.statuses.includes(task.status)) continue;
      if (filter.onlyCritical && !scheduled?.isCritical) continue;
      if (filter.onlyLate && lateWorkingDays(task, scheduled?.end, projectCalendar) <= 0) continue;
      visible.add(task.id);
      let parentId = task.parentId;
      while (parentId && !visible.has(parentId)) {
        visible.add(parentId);
        parentId = byId.get(parentId)?.parentId ?? null;
      }
    }
    return visible;
  }, [filter, snapshot.tasks, snapshot.assignments, result, projectCalendar]);

  const rows = useMemo(
    () => flattenTasks(snapshot.tasks, collapsed, visibleIds),
    [snapshot.tasks, collapsed, visibleIds],
  );
  const rowIndexById = useMemo(
    () => new Map(rows.map((row) => [row.task.id, row.index])),
    [rows],
  );

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
