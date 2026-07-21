'use client';

/**
 * The Gantt view: virtualized task table + timeline in ONE scroll container
 * (shared row virtualization), calendar-driven shading, dependency arrows,
 * drag interactions with ghost what-if preview, dependency chain highlighting,
 * critical path, keyboard navigation and undoable deletes.
 */

import { generateKeyBetween } from 'fractional-indexing';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useVirtualizer } from '@tanstack/react-virtual';
import { addDays, daysBetween } from '@/engine/date-utils';
import { applyTaskEdit, type TaskEdit } from '@/engine/recalc';
import { prepareGraph } from '@/engine/schedule';
import type { DepType, TaskInput, WorkMoment } from '@/engine/types';
import { buildScheduleInput } from '@/lib/mappers';
import { formatDuration, formatIsoDateShort, parseDurationInput, todayIso } from '@/lib/format';
import { useProjectMutations } from '@/lib/queries/use-project';
import type { AssignmentRow, DependencyRow, ProjectSnapshot, TaskRow } from '@/lib/store/types';
import { cn } from '@/lib/utils';
import { useGanttStore } from '../hooks/use-gantt-store';
import { useSchedule, type GanttRow } from '../hooks/use-schedule';
import { useTimeScale } from '../hooks/use-time-scale';
import DependencyLayer from './dependency-layer';
import GanttToolbar from './gantt-toolbar';
import TaskBar from './task-bar';
import TaskRowCells, { TABLE_WIDTH, type RowActions } from './task-row-cells';

const ROW_HEIGHT = 34;
const HEADER_H = 52;

/** Converts a task row into the engine's TaskInput shape for recalc edits. */
function toTaskInput(row: TaskRow): TaskInput {
  return {
    id: row.id,
    parentId: row.parentId,
    orderKey: row.sortKey,
    name: row.name,
    taskType: row.taskType,
    isMilestone: row.isMilestone,
    schedulingMode: row.schedulingMode,
    constraintType: row.constraintType,
    constraintDate: row.constraintDate,
    durationMinutes: row.durationMinutes,
    workMinutes: row.workMinutes,
    percentComplete: row.percentComplete,
  };
}

/** Props of {@link GanttView}. */
interface GanttViewProps {
  snapshot: ProjectSnapshot;
}

/**
 * Renders the complete interactive Gantt for a project snapshot.
 * @param props - GanttViewProps containing the (optimistically updated) snapshot.
 * @param props.snapshot - Current project snapshot from the query cache.
 * @returns A JSX element with toolbar, task table and timeline.
 */
export default function GanttView({ snapshot }: GanttViewProps) {
  const router = useRouter();
  const mutations = useProjectMutations(snapshot.project.id);
  const { result, rows, rowIndexById, projectCalendar, ghost } = useSchedule(snapshot);
  const zoom = useGanttStore((s) => s.zoom);
  const setZoom = useGanttStore((s) => s.setZoom);
  const selectedTaskId = useGanttStore((s) => s.selectedTaskId);
  const select = useGanttStore((s) => s.select);
  const collapsed = useGanttStore((s) => s.collapsed);
  const toggleCollapsed = useGanttStore((s) => s.toggleCollapsed);
  const criticalVisible = useGanttStore((s) => s.criticalVisible);
  const toggleCritical = useGanttStore((s) => s.toggleCritical);
  const drag = useGanttStore((s) => s.drag);
  const setDrag = useGanttStore((s) => s.setDrag);
  const linkDrag = useGanttStore((s) => s.linkDrag);
  const setLinkDrag = useGanttStore((s) => s.setLinkDrag);

  const scale = useTimeScale(snapshot.project.startDate, result.projectEnd.date, zoom);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoverChainId, setHoverChainId] = useState<string | null>(null);
  const [cursorTip, setCursorTip] = useState<{ x: number; y: number; text: string } | null>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const taskNames = useMemo(
    () => new Map(snapshot.tasks.map((t) => [t.id, t.name])),
    [snapshot.tasks],
  );
  const assignmentsByTask = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>();
    for (const a of snapshot.assignments) {
      const list = map.get(a.taskId) ?? [];
      list.push(a);
      map.set(a.taskId, list);
    }
    return map;
  }, [snapshot.assignments]);
  const employeesById = useMemo(
    () => new Map(snapshot.employees.map((e) => [e.id, e])),
    [snapshot.employees],
  );
  const overallocatedTaskIds = useMemo(() => {
    const set = new Set<string>();
    for (const cell of result.overallocations) for (const id of cell.taskIds) set.add(id);
    return set;
  }, [result.overallocations]);

  /** Dependency chain (both directions) of the hovered task, for focus highlighting. */
  const chainSet = useMemo(() => {
    if (!hoverChainId) return null;
    const forward = new Map<string, string[]>();
    const backward = new Map<string, string[]>();
    for (const dep of snapshot.dependencies) {
      forward.set(dep.predecessorId, [...(forward.get(dep.predecessorId) ?? []), dep.successorId]);
      backward.set(dep.successorId, [...(backward.get(dep.successorId) ?? []), dep.predecessorId]);
    }
    const set = new Set<string>([hoverChainId]);
    const walk = (id: string, map: Map<string, string[]>) => {
      for (const next of map.get(id) ?? []) {
        if (!set.has(next)) {
          set.add(next);
          walk(next, map);
        }
      }
    };
    walk(hoverChainId, forward);
    walk(hoverChainId, backward);
    return set.size > 1 ? set : null;
  }, [hoverChainId, snapshot.dependencies]);

  /** Absence ranges per row for tasks with exactly one assignee (row shading). */
  const absencesByTask = useMemo(() => {
    const map = new Map<string, { start: string; end: string; type: string }[]>();
    for (const task of snapshot.tasks) {
      const assignments = assignmentsByTask.get(task.id) ?? [];
      if (assignments.length !== 1) continue;
      const absences = snapshot.absences.filter((a) => a.employeeId === assignments[0].employeeId);
      if (absences.length > 0) {
        map.set(task.id, absences.map((a) => ({ start: a.startDate, end: a.endDate, type: a.type })));
      }
    }
    return map;
  }, [snapshot.tasks, snapshot.absences, assignmentsByTask]);

  // ----- commit helpers ---------------------------------------------------

  /** Applies a recalc edit to a task and persists task + rescaled assignments. */
  const commitEdit = useCallback(
    (task: TaskRow, edit: TaskEdit) => {
      const assignments = assignmentsByTask.get(task.id) ?? [];
      const edited = applyTaskEdit(toTaskInput(task), assignments, edit);
      const newRow: TaskRow = {
        ...task,
        durationMinutes: edited.task.durationMinutes,
        workMinutes: edited.task.workMinutes,
      };
      void mutations.upsertTasks([newRow]);
      const unitsChanged =
        edited.assignments.length === assignments.length &&
        edited.assignments.some((a, i) => a.units !== assignments[i]?.units);
      if (unitsChanged) {
        void mutations.setAssignments(
          task.id,
          edited.assignments.map((a) => ({ employeeId: a.employeeId, units: a.units })),
        );
      }
    },
    [assignmentsByTask, mutations],
  );

  /** Moves a task so it starts no earlier than the given date. */
  const commitMove = useCallback(
    (task: TaskRow, newStartDate: string) => {
      void mutations.upsertTasks([
        { ...task, constraintType: 'start_no_earlier_than', constraintDate: newStartDate },
      ]);
    },
    [mutations],
  );

  // ----- row / hierarchy actions -----------------------------------------

  const siblingsOf = useCallback(
    (parentId: string | null) =>
      snapshot.tasks
        .filter((t) => t.parentId === parentId)
        .sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1)),
    [snapshot.tasks],
  );

  const createTask = useCallback(
    (parentId: string | null, afterSortKey: string | null, beforeSortKey: string | null) => {
      const row: TaskRow = {
        id: crypto.randomUUID(),
        projectId: snapshot.project.id,
        parentId,
        sortKey: generateKeyBetween(afterSortKey, beforeSortKey),
        name: 'Neue Aufgabe',
        taskType: 'fixed_units',
        schedulingMode: 'auto',
        isMilestone: false,
        constraintType: 'asap',
        constraintDate: null,
        startAt: null,
        endAt: null,
        durationMinutes: 480,
        workMinutes: 480,
        percentComplete: 0,
        notes: null,
      };
      void mutations.upsertTasks([row]);
      select(row.id);
    },
    [mutations, snapshot.project.id, select],
  );

  const addTaskAtEnd = useCallback(() => {
    const selected = snapshot.tasks.find((t) => t.id === selectedTaskId);
    const parentId = selected?.parentId ?? null;
    const siblings = siblingsOf(parentId);
    const after = selected ?? siblings[siblings.length - 1] ?? null;
    const next = after ? siblings[siblings.findIndex((s) => s.id === after.id) + 1] : null;
    createTask(parentId, after?.sortKey ?? null, next?.sortKey ?? null);
  }, [snapshot.tasks, selectedTaskId, siblingsOf, createTask]);

  const removeWithUndo = useCallback(
    (row: GanttRow) => {
      const toDelete = new Set([row.task.id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const t of snapshot.tasks) {
          if (t.parentId && toDelete.has(t.parentId) && !toDelete.has(t.id)) {
            toDelete.add(t.id);
            grew = true;
          }
        }
      }
      const removedTasks = snapshot.tasks.filter((t) => toDelete.has(t.id));
      const removedDeps = snapshot.dependencies.filter(
        (d) => toDelete.has(d.predecessorId) || toDelete.has(d.successorId),
      );
      const removedAssignments = snapshot.assignments.filter((a) => toDelete.has(a.taskId));
      void mutations.deleteTasks([row.task.id]);
      select(null);
      toast(`„${row.task.name}“ gelöscht`, {
        action: {
          label: 'Rückgängig',
          onClick: () => {
            void (async () => {
              await mutations.upsertTasks(removedTasks);
              for (const dep of removedDeps) {
                await mutations.createDependency({
                  predecessorId: dep.predecessorId,
                  successorId: dep.successorId,
                  type: dep.type,
                  lagMinutes: dep.lagMinutes,
                });
              }
              const byTask = new Map<string, AssignmentRow[]>();
              for (const a of removedAssignments) {
                byTask.set(a.taskId, [...(byTask.get(a.taskId) ?? []), a]);
              }
              for (const [taskId, list] of byTask) {
                await mutations.setAssignments(
                  taskId,
                  list.map((a) => ({ employeeId: a.employeeId, units: a.units })),
                );
              }
            })();
          },
        },
      });
    },
    [snapshot, mutations, select],
  );

  const rowActions: RowActions = useMemo(
    () => ({
      insertBelow: (row) => {
        const siblings = siblingsOf(row.task.parentId);
        const index = siblings.findIndex((s) => s.id === row.task.id);
        createTask(row.task.parentId, row.task.sortKey, siblings[index + 1]?.sortKey ?? null);
      },
      insertAbove: (row) => {
        const siblings = siblingsOf(row.task.parentId);
        const index = siblings.findIndex((s) => s.id === row.task.id);
        createTask(row.task.parentId, siblings[index - 1]?.sortKey ?? null, row.task.sortKey);
      },
      addChild: (row) => {
        const children = siblingsOf(row.task.id);
        createTask(row.task.id, children[children.length - 1]?.sortKey ?? null, null);
      },
      indent: (row) => {
        const siblings = siblingsOf(row.task.parentId);
        const index = siblings.findIndex((s) => s.id === row.task.id);
        const newParent = siblings[index - 1];
        if (!newParent) {
          toast.info('Kein Vorgänger zum Einrücken vorhanden');
          return;
        }
        const children = siblingsOf(newParent.id);
        void mutations.upsertTasks([
          {
            ...row.task,
            parentId: newParent.id,
            sortKey: generateKeyBetween(children[children.length - 1]?.sortKey ?? null, null),
          },
        ]);
      },
      outdent: (row) => {
        const parent = snapshot.tasks.find((t) => t.id === row.task.parentId);
        if (!parent) return;
        const parentSiblings = siblingsOf(parent.parentId);
        const parentIndex = parentSiblings.findIndex((s) => s.id === parent.id);
        void mutations.upsertTasks([
          {
            ...row.task,
            parentId: parent.parentId,
            sortKey: generateKeyBetween(
              parent.sortKey,
              parentSiblings[parentIndex + 1]?.sortKey ?? null,
            ),
          },
        ]);
      },
      toggleMilestone: (row) => {
        const becoming = !row.task.isMilestone;
        void mutations.upsertTasks([
          {
            ...row.task,
            isMilestone: becoming,
            durationMinutes: becoming ? 0 : 480,
            workMinutes: becoming ? 0 : 480,
          },
        ]);
      },
      remove: removeWithUndo,
      open: (row) => router.push(`?task=${row.task.id}`, { scroll: false }),
    }),
    [siblingsOf, createTask, mutations, snapshot.tasks, removeWithUndo, router],
  );

  // ----- drag interactions ------------------------------------------------

  const timelinePoint = useCallback((e: PointerEvent | React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: e.clientX - rect.left + el.scrollLeft - TABLE_WIDTH,
      y: e.clientY - rect.top + el.scrollTop - HEADER_H,
    };
  }, []);

  const startMoveDrag = useCallback(
    (task: TaskRow, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const scheduled = result.tasks.get(task.id);
      if (!scheduled || scheduled.isSummary) return;
      e.preventDefault();
      const originX = e.clientX;
      const startDate = scheduled.start.date;
      setDrag({ kind: 'move', taskId: task.id, originX, deltaDays: 0 });
      const onMove = (ev: PointerEvent) => {
        const deltaDays = Math.round((ev.clientX - originX) / scale.dayWidth);
        useGanttStore.getState().setDrag({ kind: 'move', taskId: task.id, originX, deltaDays });
        const target = addDays(startDate, deltaDays);
        setCursorTip({
          x: ev.clientX,
          y: ev.clientY,
          text:
            deltaDays === 0
              ? 'Ziehen zum Verschieben'
              : `${deltaDays > 0 ? '+' : ''}${deltaDays} Tage → Start ${formatIsoDateShort(target)}`,
        });
      };
      const onUp = () => {
        const state = useGanttStore.getState().drag;
        cleanup();
        if (state && state.kind === 'move' && state.deltaDays !== 0) {
          commitMove(task, addDays(startDate, state.deltaDays));
        }
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') cleanup();
      };
      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('keydown', onKey, true);
        useGanttStore.getState().setDrag(null);
        setCursorTip(null);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('keydown', onKey, true);
    },
    [result.tasks, scale.dayWidth, setDrag, commitMove],
  );

  const startResizeDrag = useCallback(
    (task: TaskRow, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const scheduled = result.tasks.get(task.id);
      if (!scheduled || scheduled.isSummary || task.isMilestone) return;
      e.preventDefault();
      setDrag({ kind: 'resize', taskId: task.id, originX: e.clientX, deltaDays: 0 });
      const onMove = (ev: PointerEvent) => {
        const { x } = timelinePoint(ev);
        const targetEndDate = scale.dateAt(x);
        const target = Math.max(
          60,
          projectCalendar.workingMinutesBetween(scheduled.start, {
            date: targetEndDate,
            minute: 1440,
          }),
        );
        useGanttStore.getState().setDrag({
          kind: 'resize',
          taskId: task.id,
          originX: e.clientX,
          deltaDays: 0,
          targetDurationMinutes: target,
        });
        setCursorTip({
          x: ev.clientX,
          y: ev.clientY,
          text: `Dauer: ${formatDuration(target, projectCalendar.averageDayCapacity)} → Ende ${formatIsoDateShort(targetEndDate)}`,
        });
      };
      const onUp = () => {
        const state = useGanttStore.getState().drag;
        cleanup();
        if (state?.kind === 'resize' && state.targetDurationMinutes !== undefined) {
          commitEdit(task, { kind: 'resize', durationMinutes: state.targetDurationMinutes });
        }
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') cleanup();
      };
      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('keydown', onKey, true);
        useGanttStore.getState().setDrag(null);
        setCursorTip(null);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('keydown', onKey, true);
    },
    [result.tasks, scale, projectCalendar, setDrag, timelinePoint, commitEdit],
  );

  const startLinkDrag = useCallback(
    (task: TaskRow, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const update = (ev: PointerEvent) => {
        const { x, y } = timelinePoint(ev);
        const rowIndex = Math.floor(y / ROW_HEIGHT);
        const target = rows[rowIndex]?.task;
        useGanttStore.getState().setLinkDrag({
          sourceTaskId: task.id,
          toX: x,
          toY: y,
          targetTaskId: target && target.id !== task.id ? target.id : undefined,
        });
      };
      const onUp = () => {
        const state = useGanttStore.getState().linkDrag;
        cleanup();
        if (state?.targetTaskId) {
          const input = buildScheduleInput(snapshot);
          const candidate = { predecessorId: state.sourceTaskId, successorId: state.targetTaskId };
          const withCandidate = {
            ...input,
            dependencies: [
              ...input.dependencies,
              { id: '__x__', type: 'FS' as DepType, lagMinutes: 0, ...candidate },
            ],
          };
          if (prepareGraph(withCandidate).errors.some((err) => err.code === 'CYCLE')) {
            toast.error('Diese Verknüpfung würde einen Zyklus erzeugen');
            return;
          }
          void mutations.createDependency(candidate);
        }
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') cleanup();
      };
      const cleanup = () => {
        window.removeEventListener('pointermove', update);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('keydown', onKey, true);
        useGanttStore.getState().setLinkDrag(null);
      };
      window.addEventListener('pointermove', update);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('keydown', onKey, true);
      update(e.nativeEvent);
    },
    [rows, snapshot, mutations, timelinePoint],
  );

  // ----- keyboard ---------------------------------------------------------

  const scrollToDate = useCallback(
    (date: string) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({
        left: Math.max(0, scale.x(date) - (el.clientWidth - TABLE_WIDTH) / 3),
        behavior: 'smooth',
      });
    },
    [scale],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [role="dialog"], [contenteditable="true"]')) return;
      const selectedRow = rows.find((r) => r.task.id === selectedTaskId);
      const zoomOrder: (typeof zoom)[] = ['day', 'week', 'month', 'quarter'];
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const index = selectedRow ? Math.min(rows.length - 1, selectedRow.index + 1) : 0;
          if (rows[index]) select(rows[index].task.id);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const index = selectedRow ? Math.max(0, selectedRow.index - 1) : 0;
          if (rows[index]) select(rows[index].task.id);
          break;
        }
        case 'ArrowRight':
        case 'ArrowLeft': {
          if (!selectedRow) break;
          e.preventDefault();
          const scheduled = result.tasks.get(selectedRow.task.id);
          if (!scheduled || scheduled.isSummary) break;
          const direction = e.key === 'ArrowRight' ? 1 : -1;
          if (e.shiftKey) {
            const delta = direction * projectCalendar.averageDayCapacity;
            commitEdit(selectedRow.task, {
              kind: 'resize',
              durationMinutes: Math.max(60, selectedRow.task.durationMinutes + delta),
            });
          } else {
            let date = scheduled.start.date;
            do {
              date = addDays(date, direction);
            } while (!projectCalendar.isWorkingDay(date));
            commitMove(selectedRow.task, date);
          }
          break;
        }
        case 'Enter':
          if (selectedRow) {
            e.preventDefault();
            router.push(`?task=${selectedRow.task.id}`, { scroll: false });
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedRow) {
            e.preventDefault();
            removeWithUndo(selectedRow);
          }
          break;
        case '+':
          setZoom(zoomOrder[Math.max(0, zoomOrder.indexOf(zoom) - 1)]);
          break;
        case '-':
          setZoom(zoomOrder[Math.min(zoomOrder.length - 1, zoomOrder.indexOf(zoom) + 1)]);
          break;
        case 'p':
        case 'P':
          toggleCritical();
          break;
        case 'h':
        case 'H':
          scrollToDate(todayIso());
          break;
        case 'Escape':
          select(null);
          break;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rows, selectedTaskId, result.tasks, projectCalendar, zoom, select, setZoom, toggleCritical, commitEdit, commitMove, removeWithUndo, router, scrollToDate]);

  // Scroll to the project start on first mount.
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (!didInitialScroll.current && scrollRef.current) {
      didInitialScroll.current = true;
      scrollRef.current.scrollLeft = Math.max(0, scale.x(snapshot.project.startDate) - 60);
    }
  }, [scale, snapshot.project.startDate]);

  // Ctrl+wheel zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const zoomOrder: (typeof zoom)[] = ['day', 'week', 'month', 'quarter'];
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const index = zoomOrder.indexOf(useGanttStore.getState().zoom);
      const next = e.deltaY > 0 ? Math.min(zoomOrder.length - 1, index + 1) : Math.max(0, index - 1);
      useGanttStore.getState().setZoom(zoomOrder[next]);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ----- render -----------------------------------------------------------

  const totalHeight = rows.length * ROW_HEIGHT;
  const today = todayIso();
  const todayX = today >= scale.rangeStart && today <= scale.rangeEnd ? scale.x(today) : null;
  const gridStep = zoom === 'day' ? scale.dayWidth : 7 * scale.dayWidth;

  return (
    <div className="flex h-full flex-col">
      <GanttToolbar
        project={snapshot.project}
        onAddTask={addTaskAtEnd}
        onScrollToday={() => scrollToDate(today)}
      />
      <div ref={scrollRef} className="relative flex-1 overflow-auto overscroll-none">
        <div
          className="relative"
          style={{ width: TABLE_WIDTH + scale.totalWidth, height: HEADER_H + totalHeight + 80 }}
        >
          {/* ===== header (sticky, first in flow) ===== */}
          <div className="sticky top-0 z-20 flex" style={{ height: HEADER_H, width: TABLE_WIDTH + scale.totalWidth }}>
            <div
              className="sticky left-0 z-30 flex shrink-0 items-end gap-0 border-r border-b bg-background text-[11px] font-medium text-muted-foreground"
              style={{ width: TABLE_WIDTH }}
            >
              <div className="min-w-0 flex-1 px-2 pb-1.5">Aufgabe</div>
              <div style={{ width: 88 }} className="px-1 pb-1.5">Start</div>
              <div style={{ width: 88 }} className="px-1 pb-1.5">Ende</div>
              <div style={{ width: 64 }} className="px-1 pb-1.5 text-right">Dauer</div>
              <div style={{ width: 64 }} className="px-1 pb-1.5 text-right">Arbeit</div>
              <div style={{ width: 76 }} className="px-1 pb-1.5 text-right">Team</div>
            </div>
            <div className="relative shrink-0 border-b bg-background" style={{ width: scale.totalWidth }}>
              {scale.months.map((month) => (
                <div
                  key={month.start}
                  className="absolute top-0 flex h-[26px] items-center overflow-hidden border-r px-1.5 text-[11px] font-medium whitespace-nowrap"
                  style={{ left: month.x, width: month.width }}
                >
                  {month.width > 60 && month.label}
                </div>
              ))}
              {scale.ticks.map((tick) => {
                const weekend = zoom === 'day' && !projectCalendar.isWorkingDay(tick.date);
                return (
                  <div
                    key={tick.date}
                    className={cn(
                      'absolute top-[26px] flex h-[26px] items-center justify-center border-r text-[10px] tabular-nums',
                      weekend ? 'bg-muted/60 text-muted-foreground/60' : 'text-muted-foreground',
                    )}
                    style={{ left: tick.x, width: tick.width }}
                  >
                    {tick.width > 14 && tick.label}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ===== timeline background layers ===== */}
          <div
            className="absolute"
            style={{ left: TABLE_WIDTH, top: HEADER_H, width: scale.totalWidth, height: totalHeight }}
          >
            {/* vertical grid */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `repeating-linear-gradient(to right, transparent, transparent ${gridStep - 1}px, var(--border) ${gridStep - 1}px, var(--border) ${gridStep}px)`,
                opacity: 0.5,
              }}
            />
            {/* non-working day shading */}
            {scale.days.map((date) => {
              const day = projectCalendar.resolveDay(date);
              if (day.intervals.length > 0) return null;
              const isException = day.source !== 'week';
              return (
                <div
                  key={date}
                  title={day.exceptionName}
                  className={cn(
                    'absolute top-0 bottom-0',
                    isException ? 'bg-rose-500/10' : 'bg-muted/60',
                  )}
                  style={{ left: scale.x(date), width: scale.dayWidth }}
                />
              );
            })}
            {/* per-row absence stripes (single-assignee tasks) */}
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              const ranges = absencesByTask.get(row.task.id);
              if (!ranges) return null;
              return ranges.map((range, i) => {
                if (range.end < scale.rangeStart || range.start > scale.rangeEnd) return null;
                const from = range.start < scale.rangeStart ? scale.rangeStart : range.start;
                const width = (daysBetween(from, range.end > scale.rangeEnd ? scale.rangeEnd : range.end) + 1) * scale.dayWidth;
                return (
                  <div
                    key={`${row.task.id}-${i}`}
                    className="absolute rounded-sm"
                    title={`Abwesenheit ${range.type === 'vacation' ? '(Urlaub)' : range.type === 'sick' ? '(Krank)' : ''}`}
                    style={{
                      left: scale.x(from),
                      top: item.start + 4,
                      width,
                      height: ROW_HEIGHT - 8,
                      backgroundImage:
                        'repeating-linear-gradient(45deg, rgba(245,158,11,0.18) 0 4px, transparent 4px 8px)',
                    }}
                  />
                );
              });
            })}
            {/* today line */}
            {todayX !== null && (
              <div className="absolute top-0 bottom-0 z-[6] w-px bg-red-500" style={{ left: todayX }}>
                <span className="absolute -top-0.5 -left-[17px] rounded bg-red-500 px-1 text-[9px] font-medium text-white">
                  Heute
                </span>
              </div>
            )}
            {/* dependency arrows */}
            <DependencyLayer
              dependencies={snapshot.dependencies}
              result={result}
              rowIndexById={rowIndexById}
              scale={scale}
              rowHeight={ROW_HEIGHT}
              highlightTaskIds={chainSet}
              onChangeType={(id, type) => void mutations.updateDependency(id, { type })}
              onDelete={(id) => void mutations.deleteDependency(id)}
            />
            {/* ghost what-if bars */}
            {ghost &&
              [...ghost.entries()].map(([id, pos]) => {
                const index = rowIndexById.get(id);
                if (index === undefined) return null;
                const x = scale.xOfMoment(pos.start);
                const width = Math.max(6, scale.xOfMoment(pos.end) - x);
                return (
                  <div
                    key={id}
                    className="absolute z-[7] h-[18px] rounded-md border-2 border-dashed border-primary bg-primary/25"
                    style={{ left: x, top: index * ROW_HEIGHT + (ROW_HEIGHT - 18) / 2, width }}
                  />
                );
              })}
            {/* link drag line */}
            {linkDrag && (
              <svg className="pointer-events-none absolute inset-0 z-[8]" width={scale.totalWidth} height={totalHeight}>
                {(() => {
                  const source = result.tasks.get(linkDrag.sourceTaskId);
                  const sourceIndex = rowIndexById.get(linkDrag.sourceTaskId);
                  if (!source || sourceIndex === undefined) return null;
                  const x1 = scale.xOfMoment(source.end);
                  const y1 = sourceIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
                  return (
                    <line
                      x1={x1}
                      y1={y1}
                      x2={linkDrag.toX}
                      y2={linkDrag.toY}
                      className="stroke-primary"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                    />
                  );
                })()}
              </svg>
            )}
          </div>

          {/* ===== rows ===== */}
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            const scheduled = result.tasks.get(row.task.id);
            const assignments = assignmentsByTask.get(row.task.id) ?? [];
            const assignees = assignments
              .map((a) => employeesById.get(a.employeeId))
              .filter((e): e is NonNullable<typeof e> => Boolean(e));
            const barX = scheduled ? scale.xOfMoment(scheduled.start) : 0;
            const barWidth = scheduled ? scale.xOfMoment(scheduled.end) - barX : 0;
            const slackWidth = scheduled
              ? (scheduled.totalSlackMinutes / projectCalendar.averageDayCapacity) * scale.dayWidth
              : 0;
            const barColor = assignees.length === 1 ? assignees[0].color : snapshot.project.color;
            return (
              <div
                key={row.task.id}
                className={cn(
                  'absolute left-0 flex hover:bg-accent/30',
                  selectedTaskId === row.task.id && 'bg-accent/40',
                )}
                style={{
                  top: HEADER_H + item.start,
                  height: ROW_HEIGHT,
                  width: TABLE_WIDTH + scale.totalWidth,
                }}
              >
                <TaskRowCells
                  row={row}
                  scheduled={scheduled}
                  assignees={assignees}
                  selected={selectedTaskId === row.task.id}
                  avgDayCapacity={projectCalendar.averageDayCapacity}
                  collapsed={collapsed.has(row.task.id)}
                  onSelect={() => select(row.task.id)}
                  onToggleCollapsed={() => toggleCollapsed(row.task.id)}
                  onCommitName={(name) => void mutations.upsertTasks([{ ...row.task, name }])}
                  onCommitStart={(date) => {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) commitMove(row.task, date);
                  }}
                  onCommitEnd={(date) => {
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !scheduled) return;
                    const target = Math.max(
                      60,
                      projectCalendar.workingMinutesBetween(scheduled.start, { date, minute: 1440 }),
                    );
                    commitEdit(row.task, { kind: 'resize', durationMinutes: target });
                  }}
                  onCommitDuration={(raw) => {
                    const minutes = parseDurationInput(raw, projectCalendar.averageDayCapacity);
                    if (minutes !== undefined) {
                      commitEdit(row.task, { kind: 'setDuration', durationMinutes: minutes });
                    }
                  }}
                  onCommitWork={(raw) => {
                    const minutes = parseDurationInput(raw.endsWith('h') || raw.endsWith('T') || raw.endsWith('t') ? raw : `${raw}h`, projectCalendar.averageDayCapacity);
                    if (minutes !== undefined) commitEdit(row.task, { kind: 'setWork', workMinutes: minutes });
                  }}
                  actions={rowActions}
                />
                <div className="relative h-full border-b" style={{ width: scale.totalWidth }}>
                  {scheduled && (
                    <TaskBar
                      task={row.task}
                      scheduled={scheduled}
                      x={barX}
                      width={barWidth}
                      color={barColor}
                      critical={scheduled.isCritical}
                      criticalVisible={criticalVisible}
                      dimmed={chainSet !== null && !chainSet.has(row.task.id)}
                      chainHighlighted={chainSet !== null && chainSet.has(row.task.id) && hoverChainId !== row.task.id}
                      overallocated={overallocatedTaskIds.has(row.task.id)}
                      assignees={assignments.map((a) => ({
                        employee: employeesById.get(a.employeeId)!,
                        units: a.units,
                      })).filter((a) => a.employee)}
                      slackWidth={slackWidth}
                      taskNames={taskNames}
                      onPointerDownBody={(e) => startMoveDrag(row.task, e)}
                      onPointerDownResize={(e) => startResizeDrag(row.task, e)}
                      onPointerDownLink={(e) => startLinkDrag(row.task, e)}
                      onHoverChain={setHoverChainId}
                      onJumpToTask={(taskId) => {
                        select(taskId);
                        const s = result.tasks.get(taskId);
                        if (s) scrollToDate(s.start.date);
                      }}
                      onOpen={() => rowActions.open(row)}
                    />
                  )}
                </div>
              </div>
            );
          })}

        </div>
        {rows.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto rounded-xl border bg-background p-8 text-center shadow-sm">
              <p className="font-medium">Noch keine Aufgaben</p>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">
                Lege die erste Aufgabe an — Start- und Endtermine werden automatisch berechnet.
              </p>
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                onClick={addTaskAtEnd}
              >
                Erste Aufgabe anlegen
              </button>
            </div>
          </div>
        )}
      </div>
      {/* drag delta tooltip */}
      {cursorTip && drag && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border bg-background px-2 py-1 text-xs shadow-md"
          style={{ left: cursorTip.x + 14, top: cursorTip.y + 16 }}
        >
          {cursorTip.text}
        </div>
      )}
    </div>
  );
}
