/**
 * Data layer of the cross-project team workload view.
 *
 * Runs the scheduling engine once per project, merges the resulting
 * per-employee/day workload cells across all projects and derives display
 * cells (utilization, absences, holidays) for arbitrary date ranges. Also
 * provides the lazy per-task breakdown that powers the cell detail popover,
 * mirroring the distribution semantics of engine/allocation.ts exactly.
 */

import { compileCalendar, type CompiledCalendar } from '@/engine/calendar';
import { addDays, daysBetween, weekdayIndex } from '@/engine/date-utils';
import { computeSchedule } from '@/engine/schedule';
import type {
  AbsenceType,
  CalendarConfig,
  IsoDate,
  ScheduleInput,
  ScheduleResult,
  WeekDayConfig,
} from '@/engine/types';
import { buildScheduleInput, employeeCalendarConfigs } from '@/lib/mappers';
import type { TeamSnapshot } from '@/lib/queries/use-entities';
import type {
  AbsenceRow,
  AssignmentRow,
  ProjectRow,
  ProjectSnapshot,
  TaskRow,
} from '@/lib/store/types';

/** Short German weekday labels, Monday-first (matches `weekdayIndex`). */
export const WEEKDAY_LABELS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Full German weekday labels, Monday-first (matches `weekdayIndex`). */
export const WEEKDAY_LABELS_LONG = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
];

/** Full German month labels (index 0 = Januar). */
export const MONTH_LABELS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

/** German labels of the absence types. */
export const ABSENCE_LABELS: Record<AbsenceType, string> = {
  vacation: 'Urlaub',
  sick: 'Krank',
  other: 'Sonstiges',
};

/** One engine run of a single project, kept for lazy per-task breakdowns. */
export interface ProjectRun {
  /** The project this run belongs to. */
  project: ProjectRow;
  /** The engine input built from the project snapshot. */
  input: ScheduleInput;
  /** The engine output of this project. */
  result: ScheduleResult;
  /** Task ids that are summaries (have children) in this project. */
  parentIds: Set<string>;
  /** Assignment rows of this project grouped by task id. */
  assignmentsByTask: Map<string, AssignmentRow[]>;
}

/** A per-employee/day workload cell merged across all projects. */
export interface MergedDayCell {
  /** Sum of assigned working minutes across all projects. */
  assignedMinutes: number;
  /** Day capacity of the employee (identical per project; max kept). */
  capacityMinutes: number;
  /** Union of contributing task ids across all projects. */
  taskIds: string[];
  /** Assigned minutes per contributing project id. */
  byProject: Map<string, number>;
}

/** Precomputed cross-project workload data of the whole team. */
export interface TeamWorkload {
  /** employeeId → date → merged workload cell (only days with assigned work). */
  byEmployee: Map<string, Map<IsoDate, MergedDayCell>>;
  /** Compiled effective calendar per employee (absences merged in). */
  calendars: Map<string, CompiledCalendar>;
  /** Weekly template capacity in minutes per employee (for "40 h/Woche"). */
  weeklyMinutes: Map<string, number>;
  /** One engine run per project, for lazy per-task breakdowns. */
  runs: ProjectRun[];
  /** All task rows by id. */
  tasksById: Map<string, TaskRow>;
  /** All project rows by id. */
  projectsById: Map<string, ProjectRow>;
  /** Absence rows grouped by employee id. */
  absencesByEmployee: Map<string, AbsenceRow[]>;
  /** Cache of compiled driving calendars keyed by calendar config id. */
  compiledCache: Map<string, CompiledCalendar>;
}

/** Sums the working minutes of a weekly template (Monday-first, 7 entries). */
function weeklyTemplateMinutes(week: WeekDayConfig[]): number {
  let total = 0;
  for (const day of week) {
    if (!day.working) continue;
    for (const [start, end] of day.intervals) total += end - start;
  }
  return total;
}

/**
 * Builds the merged cross-project workload of the whole team by running the
 * scheduling engine once per project and merging the workload cells.
 * @param team - The cross-project team snapshot from `useTeamSnapshot()`.
 * @returns The precomputed {@link TeamWorkload} (memoize the call per snapshot).
 */
export function buildTeamWorkload(team: TeamSnapshot): TeamWorkload {
  const byEmployee = new Map<string, Map<IsoDate, MergedDayCell>>();
  const runs: ProjectRun[] = [];
  const tasksById = new Map<string, TaskRow>();
  for (const task of team.tasks) tasksById.set(task.id, task);
  const projectsById = new Map<string, ProjectRow>();
  for (const project of team.projects) projectsById.set(project.id, project);

  for (const project of team.projects) {
    const tasks = team.tasks.filter((t) => t.projectId === project.id);
    if (tasks.length === 0) continue;
    const taskIds = new Set(tasks.map((t) => t.id));
    const snapshot: ProjectSnapshot = {
      workspace: team.workspace,
      project,
      tasks,
      dependencies: team.dependencies.filter((d) => d.projectId === project.id),
      assignments: team.assignments.filter((a) => taskIds.has(a.taskId)),
      employees: team.employees,
      absences: team.absences,
      calendars: team.calendars,
      exceptions: team.exceptions,
    };
    const input = buildScheduleInput(snapshot);
    const result = computeSchedule(input);

    for (const cell of result.workload) {
      let byDate = byEmployee.get(cell.employeeId);
      if (!byDate) {
        byDate = new Map();
        byEmployee.set(cell.employeeId, byDate);
      }
      let merged = byDate.get(cell.date);
      if (!merged) {
        merged = { assignedMinutes: 0, capacityMinutes: 0, taskIds: [], byProject: new Map() };
        byDate.set(cell.date, merged);
      }
      merged.assignedMinutes += cell.assignedMinutes;
      merged.capacityMinutes = Math.max(merged.capacityMinutes, cell.capacityMinutes);
      for (const id of cell.taskIds) {
        if (!merged.taskIds.includes(id)) merged.taskIds.push(id);
      }
      merged.byProject.set(
        project.id,
        (merged.byProject.get(project.id) ?? 0) + cell.assignedMinutes,
      );
    }

    const parentIds = new Set<string>();
    for (const task of tasks) {
      if (task.parentId) parentIds.add(task.parentId);
    }
    const assignmentsByTask = new Map<string, AssignmentRow[]>();
    for (const assignment of snapshot.assignments) {
      const list = assignmentsByTask.get(assignment.taskId);
      if (list) list.push(assignment);
      else assignmentsByTask.set(assignment.taskId, [assignment]);
    }
    runs.push({ project, input, result, parentIds, assignmentsByTask });
  }

  const configs = employeeCalendarConfigs(team);
  const calendars = new Map<string, CompiledCalendar>();
  const weeklyMinutes = new Map<string, number>();
  for (const employee of team.employees) {
    const config = configs[employee.id];
    if (!config) continue;
    calendars.set(employee.id, compileCalendar(config));
    weeklyMinutes.set(employee.id, weeklyTemplateMinutes(config.week));
  }

  const absencesByEmployee = new Map<string, AbsenceRow[]>();
  for (const absence of team.absences) {
    const list = absencesByEmployee.get(absence.employeeId);
    if (list) list.push(absence);
    else absencesByEmployee.set(absence.employeeId, [absence]);
  }

  return {
    byEmployee,
    calendars,
    weeklyMinutes,
    runs,
    tasksById,
    projectsById,
    absencesByEmployee,
    compiledCache: new Map(),
  };
}

/**
 * Looks up the absence type of an employee on a given day.
 * @param workload - The precomputed team workload.
 * @param employeeId - The employee to check.
 * @param date - ISO day to check.
 * @returns The absence type, or undefined when not absent.
 */
export function absenceTypeOn(
  workload: TeamWorkload,
  employeeId: string,
  date: IsoDate,
): AbsenceType | undefined {
  const absences = workload.absencesByEmployee.get(employeeId);
  if (!absences) return undefined;
  for (const absence of absences) {
    if (date >= absence.startDate && date <= absence.endDate) return absence.type;
  }
  return undefined;
}

/** Display cell of the workload grid: one employee over one day or week. */
export interface CellInfo {
  /** First ISO day of the cell (inclusive). */
  start: IsoDate;
  /** Last ISO day of the cell (inclusive; equals `start` for day cells). */
  end: IsoDate;
  /** Sum of assigned working minutes in the range. */
  assignedMinutes: number;
  /** Sum of the employee's capacity minutes in the range. */
  capacityMinutes: number;
  /** assigned/capacity; Infinity when work is assigned despite zero capacity. */
  utilization: number;
  /** Visual category: workable day, absence, or non-working (weekend/holiday). */
  kind: 'work' | 'absence' | 'off';
  /** Absence type when `kind` is 'absence'. */
  absenceType?: AbsenceType;
  /** Holiday/exception name when the range contains a named non-working day. */
  exceptionName?: string;
  /** Assigned minutes per contributing project id. */
  byProject: Map<string, number>;
}

/**
 * Computes the display cell of one employee over an inclusive day range.
 * Capacity for days without workload cells comes from the employee's compiled
 * calendar, so weekends, holidays and absences shade correctly.
 * @param workload - The precomputed team workload.
 * @param employeeId - The employee of the row.
 * @param start - First ISO day (inclusive).
 * @param end - Last ISO day (inclusive).
 * @returns The aggregated {@link CellInfo} for rendering.
 */
export function cellInfo(
  workload: TeamWorkload,
  employeeId: string,
  start: IsoDate,
  end: IsoDate,
): CellInfo {
  const calendar = workload.calendars.get(employeeId);
  const byDate = workload.byEmployee.get(employeeId);
  let assigned = 0;
  let capacity = 0;
  const byProject = new Map<string, number>();
  let absenceType: AbsenceType | undefined;
  let exceptionName: string | undefined;

  for (let date = start; date <= end; date = addDays(date, 1)) {
    const merged = byDate?.get(date);
    const dayCapacity = Math.max(calendar?.dayCapacity(date) ?? 0, merged?.capacityMinutes ?? 0);
    capacity += dayCapacity;
    if (merged) {
      assigned += merged.assignedMinutes;
      for (const [projectId, minutes] of merged.byProject) {
        byProject.set(projectId, (byProject.get(projectId) ?? 0) + minutes);
      }
    }
    if (dayCapacity === 0 && calendar) {
      const resolved = calendar.resolveDay(date);
      if (resolved.source === 'absence' && !absenceType) {
        absenceType = absenceTypeOn(workload, employeeId, date) ?? 'other';
      } else if (!exceptionName && resolved.exceptionName) {
        exceptionName = resolved.exceptionName;
      }
    }
  }

  const kind: CellInfo['kind'] = capacity > 0 ? 'work' : absenceType ? 'absence' : 'off';
  const utilization =
    capacity > 0 ? assigned / capacity : assigned > 0 ? Number.POSITIVE_INFINITY : 0;
  return {
    start,
    end,
    assignedMinutes: assigned,
    capacityMinutes: capacity,
    utilization,
    kind,
    absenceType,
    exceptionName,
    byProject,
  };
}

/** One task's contribution to an employee's workload within a date range. */
export interface TaskContribution {
  /** The contributing task row. */
  task: TaskRow;
  /** The project the task belongs to. */
  project: ProjectRow;
  /** Assigned working minutes of this task inside the range. */
  minutes: number;
}

/** Returns (and caches) the compiled calendar of a driving-calendar config. */
function compiledFor(workload: TeamWorkload, config: CalendarConfig): CompiledCalendar {
  const cached = workload.compiledCache.get(config.id);
  if (cached) return cached;
  const compiled = compileCalendar(config);
  workload.compiledCache.set(config.id, compiled);
  return compiled;
}

/**
 * Computes the per-task workload breakdown of an employee over a date range,
 * using the exact distribution rules of engine/allocation.ts (task minutes on
 * the task's driving calendar times assignment units, rounded per day).
 * @param workload - The precomputed team workload.
 * @param employeeId - The employee whose tasks are listed.
 * @param start - First ISO day (inclusive).
 * @param end - Last ISO day (inclusive).
 * @returns Contributions sorted by minutes descending.
 */
export function taskContributions(
  workload: TeamWorkload,
  employeeId: string,
  start: IsoDate,
  end: IsoDate,
): TaskContribution[] {
  const out: TaskContribution[] = [];
  for (const run of workload.runs) {
    for (const [taskId, scheduled] of run.result.tasks) {
      if (scheduled.isSummary || scheduled.durationMinutes === 0) continue;
      if (run.parentIds.has(taskId)) continue;
      const assignments = run.assignmentsByTask.get(taskId) ?? [];
      const mine = assignments.find((a) => a.employeeId === employeeId);
      if (!mine || mine.units <= 0) continue;
      if (scheduled.end.date < start || scheduled.start.date > end) continue;

      // Driving calendar: exactly one assignee → that employee's calendar,
      // otherwise the project calendar (mirrors engine/schedule.ts).
      const config =
        assignments.length === 1
          ? (run.input.employeeCalendars[assignments[0].employeeId] ?? run.input.projectCalendar)
          : run.input.projectCalendar;
      const calendar = compiledFor(workload, config);

      let minutes = 0;
      const first = scheduled.start.date > start ? scheduled.start.date : start;
      const last = scheduled.end.date < end ? scheduled.end.date : end;
      for (let date = first; date <= last; date = addDays(date, 1)) {
        const dayStart = {
          date,
          minute: date === scheduled.start.date ? scheduled.start.minute : 0,
        };
        const dayEnd = { date, minute: date === scheduled.end.date ? scheduled.end.minute : 1440 };
        const taskMinutes = calendar.workingMinutesBetween(dayStart, dayEnd);
        if (taskMinutes > 0) minutes += Math.round(taskMinutes * mine.units);
      }
      if (minutes <= 0) continue;

      const task = workload.tasksById.get(taskId);
      const project = workload.projectsById.get(run.project.id);
      if (!task || !project) continue;
      out.push({ task, project, minutes });
    }
  }
  return out.sort((a, b) => b.minutes - a.minutes);
}

/**
 * Returns the ISO 8601 week number of a date (week containing its Thursday).
 * @param date - ISO day.
 * @returns The calendar week number (1–53).
 */
export function isoWeekNumber(date: IsoDate): number {
  const thursday = addDays(date, 3 - weekdayIndex(date));
  const jan1 = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor(daysBetween(jan1, thursday) / 7) + 1;
}

/**
 * Returns the Monday of the week containing the given date.
 * @param date - ISO day.
 * @returns The ISO date of that week's Monday.
 */
export function mondayOf(date: IsoDate): IsoDate {
  return addDays(date, -weekdayIndex(date));
}
