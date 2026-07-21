/**
 * Shared builders for engine tests.
 * Reference week: 2026-07-20 (Monday) … 2026-07-26 (Sunday).
 */

import { DEFAULT_WEEK } from '../calendar';
import type {
  AssignmentInput,
  CalendarConfig,
  DependencyInput,
  ScheduleInput,
  TaskInput,
} from '../types';

/** Standard calendar: Mo–Fr 08:00–12:00 / 13:00–17:00 (480 min/day). */
export function stdCalendar(overrides: Partial<CalendarConfig> = {}): CalendarConfig {
  return {
    id: 'cal-std',
    week: DEFAULT_WEEK.map((d) => ({ working: d.working, intervals: [...d.intervals] })),
    exceptions: [],
    ...overrides,
  };
}

/** Builds a task with sensible defaults (1 day duration/work, auto, asap). */
export function mkTask(id: string, overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    id,
    parentId: null,
    orderKey: id,
    name: `Task ${id}`,
    taskType: 'fixed_units',
    isMilestone: false,
    schedulingMode: 'auto',
    constraintType: 'asap',
    constraintDate: null,
    durationMinutes: 480,
    workMinutes: 480,
    percentComplete: 0,
    ...overrides,
  };
}

/** Builds a dependency with FS/0 defaults. */
export function mkDep(
  predecessorId: string,
  successorId: string,
  overrides: Partial<DependencyInput> = {},
): DependencyInput {
  return {
    id: `${predecessorId}->${successorId}`,
    predecessorId,
    successorId,
    type: 'FS',
    lagMinutes: 0,
    ...overrides,
  };
}

/** Builds an assignment at full units by default. */
export function mkAssignment(
  taskId: string,
  employeeId: string,
  units = 1,
): AssignmentInput {
  return { id: `${taskId}:${employeeId}`, taskId, employeeId, units };
}

/** Builds a complete schedule input starting Monday 2026-07-20. */
export function mkInput(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    projectStart: '2026-07-20',
    projectCalendar: stdCalendar(),
    employeeCalendars: {},
    tasks: [],
    dependencies: [],
    assignments: [],
    ...overrides,
  };
}
