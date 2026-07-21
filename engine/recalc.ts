/**
 * Task recalculation rules following the (simplified) MS Project semantics.
 *
 * Invariant: Work = Duration × Units, where Units is the sum of assignment
 * units (1.0 when the task has no assignments — a "virtual" full resource).
 * On each user edit exactly one other quantity is recomputed, depending on
 * the task type.
 */

import type { AssignmentInput, TaskInput } from './types';

/** An edit a user can apply to a task's scheduling quantities. */
export type TaskEdit =
  | { kind: 'setWork'; workMinutes: number }
  | { kind: 'setDuration'; durationMinutes: number }
  | { kind: 'setAssignments'; assignments: AssignmentInput[] }
  | { kind: 'resize'; durationMinutes: number };

/** Result of applying an edit: updated task fields and (possibly rescaled) assignments. */
export interface RecalcResult {
  task: TaskInput;
  assignments: AssignmentInput[];
}

/** Sums assignment units, defaulting to 1.0 for unassigned tasks. */
export function effectiveUnits(assignments: AssignmentInput[]): number {
  if (assignments.length === 0) return 1;
  let total = 0;
  for (const a of assignments) total += a.units;
  return total > 0 ? total : 1;
}

/** Proportionally rescales assignment units so their sum matches `targetUnits`. */
function rescaleAssignments(assignments: AssignmentInput[], targetUnits: number): AssignmentInput[] {
  const current = effectiveUnits(assignments);
  if (assignments.length === 0 || current <= 0) return assignments;
  const factor = targetUnits / current;
  return assignments.map((a) => ({ ...a, units: Math.round(a.units * factor * 100) / 100 }));
}

/**
 * Applies a scheduling edit to a task, recomputing the dependent quantity
 * according to the task-type matrix:
 *
 * | Task type      | edit Work  | edit Duration | edit Assignments | resize (drag)        |
 * |----------------|-----------|---------------|------------------|----------------------|
 * | fixed_units    | → Duration | → Work        | → Duration       | → Duration → Work    |
 * | fixed_work     | → Duration | → Units       | → Duration       | → Duration → Units   |
 * | fixed_duration | → Units    | → Work        | → Work           | → Duration → Work    |
 *
 * Milestones always pin duration and work to 0.
 *
 * @param task - Current task snapshot.
 * @param assignments - Current assignments of the task.
 * @param edit - The edit to apply.
 * @returns Updated task and assignments (assignments are rescaled only for unit-recomputing edits).
 */
export function applyTaskEdit(
  task: TaskInput,
  assignments: AssignmentInput[],
  edit: TaskEdit,
): RecalcResult {
  if (task.isMilestone) {
    if (edit.kind === 'setAssignments') {
      return { task: { ...task, durationMinutes: 0, workMinutes: 0 }, assignments: edit.assignments };
    }
    return { task: { ...task, durationMinutes: 0, workMinutes: 0 }, assignments };
  }

  const units = effectiveUnits(assignments);

  switch (edit.kind) {
    case 'setWork': {
      const workMinutes = Math.max(0, Math.round(edit.workMinutes));
      if (task.taskType === 'fixed_duration') {
        const targetUnits = task.durationMinutes > 0 ? workMinutes / task.durationMinutes : units;
        return {
          task: { ...task, workMinutes },
          assignments: rescaleAssignments(assignments, targetUnits),
        };
      }
      // fixed_units and fixed_work: duration follows work.
      const durationMinutes = Math.round(workMinutes / units);
      return { task: { ...task, workMinutes, durationMinutes }, assignments };
    }
    case 'setDuration':
    case 'resize': {
      const durationMinutes = Math.max(0, Math.round(edit.durationMinutes));
      if (task.taskType === 'fixed_work') {
        const targetUnits = durationMinutes > 0 ? task.workMinutes / durationMinutes : units;
        return {
          task: { ...task, durationMinutes },
          assignments: rescaleAssignments(assignments, targetUnits),
        };
      }
      // fixed_units and fixed_duration: work follows duration.
      const workMinutes = Math.round(durationMinutes * units);
      return { task: { ...task, durationMinutes, workMinutes }, assignments };
    }
    case 'setAssignments': {
      const newUnits = effectiveUnits(edit.assignments);
      if (task.taskType === 'fixed_duration') {
        const workMinutes = Math.round(task.durationMinutes * newUnits);
        return { task: { ...task, workMinutes }, assignments: edit.assignments };
      }
      // fixed_units and fixed_work: duration follows the new unit total.
      const durationMinutes = Math.round(task.workMinutes / newUnits);
      return { task: { ...task, durationMinutes }, assignments: edit.assignments };
    }
  }
}
