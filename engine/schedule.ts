/**
 * Schedule computation: topological forward pass over the dependency graph,
 * summary rollups, and integration of the CPM backward pass and workload
 * calculation. This is the engine's main entry point.
 */

import { computeBackwardPass } from './cpm';
import { compileCalendar, NoWorkingTimeError, type CompiledCalendar } from './calendar';
import { computeWorkload } from './allocation';
import type {
  AssignmentInput,
  DependencyInput,
  IsoDate,
  ScheduleError,
  ScheduleExplanation,
  ScheduleInput,
  ScheduleResult,
  ScheduledTask,
  StartDriver,
  TaskInput,
  WorkMoment,
} from './types';
import { compareMoments, maxMoment, minMoment } from './types';

/** Internal per-task computation context shared between passes. */
export interface TaskContext {
  task: TaskInput;
  calendar: CompiledCalendar;
  isSummary: boolean;
  assignments: AssignmentInput[];
  /** Leaf descendants (for summaries; contains the task itself for leaves). */
  leafIds: string[];
}

/** Fully prepared graph structures for a schedule pass. */
export interface PreparedGraph {
  contexts: Map<string, TaskContext>;
  /** Leaf-level dependencies after expanding summary endpoints. */
  expandedDeps: DependencyInput[];
  /** Leaves in topological order. */
  topoOrder: string[];
  errors: ScheduleError[];
}

/**
 * Builds task contexts, expands summary dependencies to leaf level and
 * topologically sorts the leaves (Kahn). Cycles are reported as errors and the
 * offending edges are dropped for this pass.
 */
export function prepareGraph(input: ScheduleInput): PreparedGraph {
  const errors: ScheduleError[] = [];
  const contexts = new Map<string, TaskContext>();
  const childrenOf = new Map<string | null, TaskInput[]>();
  for (const task of input.tasks) {
    const list = childrenOf.get(task.parentId) ?? [];
    list.push(task);
    childrenOf.set(task.parentId, list);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => (a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0));
  }

  const projectCalendar = compileCalendar(input.projectCalendar);
  const employeeCalendars = new Map<string, CompiledCalendar>();
  for (const [employeeId, config] of Object.entries(input.employeeCalendars)) {
    employeeCalendars.set(employeeId, compileCalendar(config));
  }

  const assignmentsByTask = new Map<string, AssignmentInput[]>();
  for (const assignment of input.assignments) {
    const list = assignmentsByTask.get(assignment.taskId) ?? [];
    list.push(assignment);
    assignmentsByTask.set(assignment.taskId, list);
  }

  /** Collects leaf descendant ids depth-first. */
  function collectLeaves(task: TaskInput): string[] {
    const children = childrenOf.get(task.id) ?? [];
    if (children.length === 0) return [task.id];
    const leaves: string[] = [];
    for (const child of children) leaves.push(...collectLeaves(child));
    return leaves;
  }

  for (const task of input.tasks) {
    const children = childrenOf.get(task.id) ?? [];
    const isSummary = children.length > 0;
    const assignments = assignmentsByTask.get(task.id) ?? [];
    // Driving calendar: exactly one assignee → that employee's calendar, else project calendar.
    let calendar = projectCalendar;
    if (!isSummary && assignments.length === 1) {
      calendar = employeeCalendars.get(assignments[0].employeeId) ?? projectCalendar;
    }
    contexts.set(task.id, {
      task,
      calendar,
      isSummary,
      assignments,
      leafIds: collectLeaves(task),
    });
  }

  // Expand dependencies whose endpoints are summaries down to their leaves.
  const expandedDeps: DependencyInput[] = [];
  for (const dep of input.dependencies) {
    const predCtx = contexts.get(dep.predecessorId);
    const succCtx = contexts.get(dep.successorId);
    if (!predCtx || !succCtx) continue;
    for (const predLeaf of predCtx.leafIds) {
      for (const succLeaf of succCtx.leafIds) {
        if (predLeaf === succLeaf) continue;
        expandedDeps.push({ ...dep, predecessorId: predLeaf, successorId: succLeaf });
      }
    }
  }

  // Kahn topological sort over the leaves.
  const leaves = input.tasks.filter((t) => !contexts.get(t.id)!.isSummary).map((t) => t.id);
  const indegree = new Map<string, number>(leaves.map((id) => [id, 0]));
  const outgoing = new Map<string, DependencyInput[]>();
  for (const dep of expandedDeps) {
    if (!indegree.has(dep.successorId) || !indegree.has(dep.predecessorId)) continue;
    indegree.set(dep.successorId, (indegree.get(dep.successorId) ?? 0) + 1);
    const list = outgoing.get(dep.predecessorId) ?? [];
    list.push(dep);
    outgoing.set(dep.predecessorId, list);
  }
  const queue = leaves.filter((id) => (indegree.get(id) ?? 0) === 0);
  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    topoOrder.push(id);
    for (const dep of outgoing.get(id) ?? []) {
      const remaining = (indegree.get(dep.successorId) ?? 0) - 1;
      indegree.set(dep.successorId, remaining);
      if (remaining === 0) queue.push(dep.successorId);
    }
  }
  if (topoOrder.length < leaves.length) {
    const cyclic = leaves.filter((id) => !topoOrder.includes(id));
    errors.push({ code: 'CYCLE', taskIds: cyclic });
    // Drop edges among cyclic nodes and append the nodes in document order.
    const cyclicSet = new Set(cyclic);
    for (const [pred, deps] of outgoing) {
      if (cyclicSet.has(pred)) {
        outgoing.set(pred, deps.filter((d) => !cyclicSet.has(d.successorId)));
      }
    }
    topoOrder.push(...cyclic);
  }

  return { contexts, expandedDeps, topoOrder, errors };
}

/**
 * Detects whether adding `candidate` to the existing dependencies would create a cycle.
 * Used by the UI to refuse a link before persisting it.
 */
export function wouldCreateCycle(
  input: ScheduleInput,
  candidate: Pick<DependencyInput, 'predecessorId' | 'successorId'>,
): boolean {
  const withCandidate: ScheduleInput = {
    ...input,
    dependencies: [
      ...input.dependencies,
      { id: '__candidate__', type: 'FS', lagMinutes: 0, ...candidate },
    ],
  };
  return prepareGraph(withCandidate).errors.some((e) => e.code === 'CYCLE');
}

/**
 * Computes the full schedule: forward pass, summary rollups, CPM backward pass
 * and per-employee workload/overallocation.
 * @param input - Complete snapshot of tasks, dependencies, assignments and calendars.
 * @returns The computed {@link ScheduleResult}; never throws on content errors — they are reported in `errors`.
 */
export function computeSchedule(input: ScheduleInput): ScheduleResult {
  const prepared = prepareGraph(input);
  const { contexts, expandedDeps, topoOrder } = prepared;
  const errors = [...prepared.errors];

  const incoming = new Map<string, DependencyInput[]>();
  for (const dep of expandedDeps) {
    const list = incoming.get(dep.successorId) ?? [];
    list.push(dep);
    incoming.set(dep.successorId, list);
  }

  const scheduled = new Map<string, ScheduledTask>();

  for (const id of topoOrder) {
    const ctx = contexts.get(id)!;
    const { task, calendar } = ctx;
    const explanation: ScheduleExplanation = { startDrivers: [], endDrivers: [], warnings: [] };

    try {
      if (task.schedulingMode === 'manual' && task.manualStart && task.manualEnd) {
        explanation.startDrivers.push({ kind: 'manual' });
        explanation.endDrivers.push({ kind: 'manual' });
        scheduled.set(id, {
          id,
          start: task.manualStart,
          end: task.manualEnd,
          durationMinutes: task.durationMinutes,
          workMinutes: task.workMinutes,
          isSummary: false,
          isCritical: false,
          totalSlackMinutes: 0,
          explanation,
        });
        continue;
      }

      const duration = task.isMilestone ? 0 : task.durationMinutes;
      const projectStartMoment: WorkMoment = { date: input.projectStart, minute: 0 };
      const candidates: { moment: WorkMoment; driver: Extract<StartDriver, { binding: boolean }> }[] = [
        {
          moment: projectStartMoment,
          driver: { kind: 'projectStart', date: input.projectStart, binding: false },
        },
      ];

      for (const dep of incoming.get(id) ?? []) {
        const pred = scheduled.get(dep.predecessorId);
        if (!pred) continue;
        let required: WorkMoment;
        switch (dep.type) {
          case 'FS':
            required = calendar.addWorkingMinutes(pred.end, dep.lagMinutes);
            break;
          case 'SS':
            required = calendar.addWorkingMinutes(pred.start, dep.lagMinutes);
            break;
          case 'FF': {
            const requiredEnd = calendar.addWorkingMinutes(pred.end, dep.lagMinutes);
            required = calendar.addWorkingMinutes(requiredEnd, -duration);
            break;
          }
          case 'SF': {
            const requiredEnd = calendar.addWorkingMinutes(pred.start, dep.lagMinutes);
            required = calendar.addWorkingMinutes(requiredEnd, -duration);
            break;
          }
        }
        candidates.push({
          moment: required,
          driver: {
            kind: 'dependency',
            dependencyId: dep.id,
            predecessorId: dep.predecessorId,
            type: dep.type,
            lagMinutes: dep.lagMinutes,
            binding: false,
          },
        });
      }

      if (task.constraintType === 'start_no_earlier_than' && task.constraintDate) {
        candidates.push({
          moment: { date: task.constraintDate, minute: 0 },
          driver: {
            kind: 'constraint',
            constraintType: 'start_no_earlier_than',
            date: task.constraintDate,
            binding: false,
          },
        });
      }

      let winner = candidates[0];
      for (const candidate of candidates) {
        if (compareMoments(candidate.moment, winner.moment) > 0) winner = candidate;
      }

      let rawStart = winner.moment;
      if (task.constraintType === 'must_start_on' && task.constraintDate) {
        const forced: WorkMoment = { date: task.constraintDate, minute: 0 };
        const forcedDriver: StartDriver = {
          kind: 'constraint',
          constraintType: 'must_start_on',
          date: task.constraintDate,
          binding: true,
        };
        if (compareMoments(forced, rawStart) < 0 && candidates.length > 1) {
          explanation.warnings.push({ code: 'CONSTRAINT_CONFLICT' });
        }
        explanation.startDrivers.push(forcedDriver);
        rawStart = forced;
      } else {
        winner.driver.binding = true;
        for (const candidate of candidates) explanation.startDrivers.push(candidate.driver);
      }

      const start = calendar.nextWorkingMoment(rawStart);
      if (compareMoments(start, rawStart) !== 0) {
        const reason = calendar.classifySnapReason(rawStart);
        if (reason) {
          explanation.startDrivers.push({
            kind: 'calendarSnap',
            calendarId: calendar.id,
            from: rawStart,
            to: start,
            reason,
            exceptionName: calendar.resolveDay(rawStart.date).exceptionName,
          });
        }
      }

      const end = task.isMilestone ? start : calendar.addWorkingMinutes(start, duration);
      if (task.isMilestone) {
        explanation.endDrivers.push({ kind: 'milestone' });
      } else if (task.taskType === 'fixed_duration') {
        explanation.endDrivers.push({ kind: 'durationFixed', durationMinutes: duration });
      } else {
        explanation.endDrivers.push({
          kind: 'durationFromWork',
          workMinutes: task.workMinutes,
          units: ctx.assignments.reduce((sum, a) => sum + a.units, 0) || 1,
        });
      }

      scheduled.set(id, {
        id,
        start,
        end,
        durationMinutes: duration,
        workMinutes: task.isMilestone ? 0 : task.workMinutes,
        isSummary: false,
        isCritical: false,
        totalSlackMinutes: 0,
        explanation,
      });
    } catch (error) {
      if (error instanceof NoWorkingTimeError) {
        errors.push({ code: 'NO_WORKING_TIME', taskId: id, calendarId: error.calendarId });
        const fallback: WorkMoment = { date: input.projectStart, minute: 0 };
        scheduled.set(id, {
          id,
          start: fallback,
          end: fallback,
          durationMinutes: 0,
          workMinutes: 0,
          isSummary: false,
          isCritical: false,
          totalSlackMinutes: 0,
          explanation: { startDrivers: [], endDrivers: [], warnings: [{ code: 'NO_WORKING_TIME' }] },
        });
      } else {
        throw error;
      }
    }
  }

  // Summary rollups, bottom-up (deepest first).
  const summaries = [...contexts.values()].filter((ctx) => ctx.isSummary);
  const depthOf = (ctx: TaskContext): number => {
    let depth = 0;
    let parentId = ctx.task.parentId;
    while (parentId) {
      depth += 1;
      parentId = contexts.get(parentId)?.task.parentId ?? null;
    }
    return depth;
  };
  summaries.sort((a, b) => depthOf(b) - depthOf(a));
  const projectCalendar = compileCalendar(input.projectCalendar);
  for (const ctx of summaries) {
    const leafTasks = ctx.leafIds
      .map((leafId) => scheduled.get(leafId))
      .filter((t): t is ScheduledTask => Boolean(t));
    if (leafTasks.length === 0) continue;
    let start = leafTasks[0].start;
    let end = leafTasks[0].end;
    let work = 0;
    let weightedPercent = 0;
    for (const leaf of leafTasks) {
      start = minMoment(start, leaf.start);
      end = maxMoment(end, leaf.end);
      work += leaf.workMinutes;
      const leafInput = contexts.get(leaf.id)!.task;
      weightedPercent += leafInput.percentComplete * leaf.workMinutes;
    }
    scheduled.set(ctx.task.id, {
      id: ctx.task.id,
      start,
      end,
      durationMinutes: projectCalendar.workingMinutesBetween(start, end),
      workMinutes: work,
      isSummary: true,
      isCritical: false,
      totalSlackMinutes: 0,
      explanation: { startDrivers: [], endDrivers: [{ kind: 'summaryRollup' }], warnings: [] },
    });
  }

  let projectEnd: WorkMoment = { date: input.projectStart, minute: 0 };
  for (const task of scheduled.values()) {
    projectEnd = maxMoment(projectEnd, task.end);
  }

  computeBackwardPass({ contexts, expandedDeps, topoOrder, scheduled, projectEnd });

  // A summary is critical when any of its leaves is critical.
  for (const ctx of summaries) {
    const summary = scheduled.get(ctx.task.id);
    if (!summary) continue;
    summary.isCritical = ctx.leafIds.some((leafId) => scheduled.get(leafId)?.isCritical);
  }

  const workload = computeWorkload({ input, contexts, scheduled });

  return {
    tasks: scheduled,
    projectEnd,
    errors,
    workload,
    overallocations: workload.filter((cell) => cell.assignedMinutes > cell.capacityMinutes),
  };
}
