/**
 * Critical-path (CPM) backward pass: late start/finish, total slack and the
 * critical flag for every scheduled leaf task.
 *
 * All slack arithmetic runs in working minutes on each task's driving calendar,
 * so a task followed only by weekend has zero *working* slack contribution from
 * those days — matching what a project lead intuitively expects.
 */

import type { DependencyInput, ScheduledTask, WorkMoment } from './types';
import { compareMoments, minMoment } from './types';
import type { TaskContext } from './schedule';

/** Inputs of the backward pass (shared structures from the forward pass). */
export interface BackwardPassArgs {
  contexts: Map<string, TaskContext>;
  expandedDeps: DependencyInput[];
  topoOrder: string[];
  scheduled: Map<string, ScheduledTask>;
  projectEnd: WorkMoment;
}

/**
 * Runs the CPM backward pass in reverse topological order and mutates the
 * scheduled leaves in place (totalSlackMinutes, isCritical).
 */
export function computeBackwardPass(args: BackwardPassArgs): void {
  const { contexts, expandedDeps, topoOrder, scheduled, projectEnd } = args;

  const outgoing = new Map<string, DependencyInput[]>();
  for (const dep of expandedDeps) {
    const list = outgoing.get(dep.predecessorId) ?? [];
    list.push(dep);
    outgoing.set(dep.predecessorId, list);
  }

  const lateFinish = new Map<string, WorkMoment>();

  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const id = topoOrder[i];
    const ctx = contexts.get(id);
    const task = scheduled.get(id);
    if (!ctx || !task) continue;
    const calendar = ctx.calendar;
    const duration = task.durationMinutes;

    let lf: WorkMoment | undefined;
    for (const dep of outgoing.get(id) ?? []) {
      const succ = scheduled.get(dep.successorId);
      const succCtx = contexts.get(dep.successorId);
      const succLF = lateFinish.get(dep.successorId);
      if (!succ || !succCtx || !succLF) continue;
      const succCal = succCtx.calendar;
      const succLS = succCal.addWorkingMinutes(succLF, -succ.durationMinutes);
      let candidate: WorkMoment;
      switch (dep.type) {
        case 'FS':
          candidate = succCal.addWorkingMinutes(succLS, -dep.lagMinutes);
          break;
        case 'SS': {
          const predLS = succCal.addWorkingMinutes(succLS, -dep.lagMinutes);
          candidate = calendar.addWorkingMinutes(predLS, duration);
          break;
        }
        case 'FF':
          candidate = succCal.addWorkingMinutes(succLF, -dep.lagMinutes);
          break;
        case 'SF': {
          const predLS = succCal.addWorkingMinutes(succLF, -dep.lagMinutes);
          candidate = calendar.addWorkingMinutes(predLS, duration);
          break;
        }
      }
      lf = lf === undefined ? candidate : minMoment(lf, candidate);
    }
    if (lf === undefined) {
      lf = projectEnd;
    }
    lateFinish.set(id, lf);

    const lateStart = calendar.addWorkingMinutes(lf, -duration);
    const slack = calendar.workingMinutesBetween(task.start, lateStart);
    task.totalSlackMinutes = Math.max(0, slack);
    task.isCritical = compareMoments(lateStart, task.start) <= 0 || slack <= 0;
  }
}
