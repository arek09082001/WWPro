/**
 * Per-employee daily workload and overallocation detection.
 *
 * The assigned minutes of a task are distributed flat over the task's span:
 * for each day, the working minutes of the task's driving calendar that fall
 * inside the task's start/end are multiplied by the assignment units. Capacity
 * always comes from the employee's own calendar, so part-time employees are
 * never misjudged by a full-time project calendar.
 */

import { compileCalendar, type CompiledCalendar } from './calendar';
import { addDays } from './date-utils';
import type { ScheduleInput, ScheduledTask, WorkloadCell } from './types';
import type { TaskContext } from './schedule';

/** Inputs of the workload computation. */
export interface WorkloadArgs {
  input: ScheduleInput;
  contexts: Map<string, TaskContext>;
  scheduled: Map<string, ScheduledTask>;
}

/**
 * Computes the per-employee, per-day workload over the span of all scheduled tasks.
 * @returns One {@link WorkloadCell} per employee/day with at least one assigned minute,
 * plus capacity information for overallocation checks.
 */
export function computeWorkload(args: WorkloadArgs): WorkloadCell[] {
  const { input, contexts, scheduled } = args;

  const employeeCals = new Map<string, CompiledCalendar>();
  for (const [employeeId, config] of Object.entries(input.employeeCalendars)) {
    employeeCals.set(employeeId, compileCalendar(config));
  }
  const projectCal = compileCalendar(input.projectCalendar);

  /** key = employeeId|date */
  const cells = new Map<string, WorkloadCell>();

  for (const ctx of contexts.values()) {
    if (ctx.isSummary || ctx.assignments.length === 0) continue;
    const task = scheduled.get(ctx.task.id);
    if (!task || task.durationMinutes === 0) continue;
    const calendar = ctx.calendar;

    let date = task.start.date;
    while (date <= task.end.date) {
      const dayStart = { date, minute: date === task.start.date ? task.start.minute : 0 };
      const dayEnd = { date, minute: date === task.end.date ? task.end.minute : 1440 };
      const taskMinutes = calendar.workingMinutesBetween(dayStart, dayEnd);
      if (taskMinutes > 0) {
        for (const assignment of ctx.assignments) {
          const assigned = Math.round(taskMinutes * assignment.units);
          if (assigned <= 0) continue;
          const key = `${assignment.employeeId}|${date}`;
          const employeeCal = employeeCals.get(assignment.employeeId) ?? projectCal;
          let cell = cells.get(key);
          if (!cell) {
            cell = {
              employeeId: assignment.employeeId,
              date,
              assignedMinutes: 0,
              capacityMinutes: employeeCal.dayCapacity(date),
              taskIds: [],
            };
            cells.set(key, cell);
          }
          cell.assignedMinutes += assigned;
          if (!cell.taskIds.includes(ctx.task.id)) cell.taskIds.push(ctx.task.id);
        }
      }
      if (date === task.end.date) break;
      date = addDays(date, 1);
    }
  }

  return [...cells.values()].sort((a, b) =>
    a.employeeId === b.employeeId
      ? a.date.localeCompare(b.date)
      : a.employeeId.localeCompare(b.employeeId),
  );
}
