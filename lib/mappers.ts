/**
 * Mapping between persistence rows and engine types.
 * This module is the ONLY place in the app where timezones exist: WorkMoments
 * are converted to/from UTC ISO strings using the workspace timezone
 * (default Europe/Berlin) via @date-fns/tz.
 */

import { TZDate } from '@date-fns/tz';
import type {
  AssignmentInput,
  CalendarConfig,
  DependencyInput,
  ScheduleInput,
  ScheduledTask,
  TaskInput,
  WorkMoment,
} from '@/engine/types';
import type { ProjectSnapshot, TaskRow } from '@/lib/store/types';

/** Converts a WorkMoment (project-local wall time) to a UTC ISO string. */
export function workMomentToUtc(m: WorkMoment, timezone: string): string {
  const year = Number(m.date.slice(0, 4));
  const month = Number(m.date.slice(5, 7)) - 1;
  const day = Number(m.date.slice(8, 10));
  const hours = Math.floor(m.minute / 60);
  const minutes = m.minute % 60;
  return new TZDate(year, month, day, hours, minutes, 0, 0, timezone).toISOString();
}

/** Converts a UTC ISO string back to a WorkMoment in the given timezone. */
export function utcToWorkMoment(iso: string, timezone: string): WorkMoment {
  const d = new TZDate(iso, timezone);
  const yyyy = String(d.getFullYear()).padStart(4, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, minute: d.getHours() * 60 + d.getMinutes() };
}

/** Builds the CalendarConfig of a calendar row, including inherited base exceptions. */
function calendarConfigOf(
  snapshot: Pick<ProjectSnapshot, 'calendars' | 'exceptions'>,
  calendarId: string,
): CalendarConfig | undefined {
  const row = snapshot.calendars.find((c) => c.id === calendarId);
  if (!row) return undefined;
  const config: CalendarConfig = {
    id: row.id,
    week: row.week,
    exceptions: snapshot.exceptions
      .filter((e) => e.calendarId === row.id)
      .map((e) => ({
        date: e.date,
        working: e.working,
        intervals: e.intervals ?? undefined,
        name: e.name,
      })),
  };
  if (row.baseCalendarId) {
    config.base = calendarConfigOf(snapshot, row.baseCalendarId);
  }
  return config;
}

/** Maps a task row to the engine's TaskInput. */
function taskInputOf(row: TaskRow, timezone: string): TaskInput {
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
    manualStart:
      row.schedulingMode === 'manual' && row.startAt
        ? utcToWorkMoment(row.startAt, timezone)
        : undefined,
    manualEnd:
      row.schedulingMode === 'manual' && row.endAt
        ? utcToWorkMoment(row.endAt, timezone)
        : undefined,
  };
}

/**
 * Builds the complete engine input from a project snapshot: project calendar,
 * effective employee calendars (own or default calendar + merged absences),
 * tasks, dependencies and assignments.
 */
export function buildScheduleInput(snapshot: ProjectSnapshot): ScheduleInput {
  const timezone = snapshot.workspace.timezone;
  const fallbackCalendarId = snapshot.project.calendarId || snapshot.workspace.defaultCalendarId;
  const projectCalendar =
    calendarConfigOf(snapshot, fallbackCalendarId) ??
    calendarConfigOf(snapshot, snapshot.workspace.defaultCalendarId)!;

  const employeeCalendars: Record<string, CalendarConfig> = {};
  for (const employee of snapshot.employees) {
    const baseConfig =
      (employee.calendarId ? calendarConfigOf(snapshot, employee.calendarId) : undefined) ??
      projectCalendar;
    employeeCalendars[employee.id] = {
      ...baseConfig,
      id: `${baseConfig.id}::${employee.id}`,
      absences: snapshot.absences
        .filter((a) => a.employeeId === employee.id)
        .map((a) => ({ start: a.startDate, end: a.endDate, type: a.type })),
    };
  }

  const dependencies: DependencyInput[] = snapshot.dependencies.map((d) => ({
    id: d.id,
    predecessorId: d.predecessorId,
    successorId: d.successorId,
    type: d.type,
    lagMinutes: d.lagMinutes,
  }));

  const assignments: AssignmentInput[] = snapshot.assignments.map((a) => ({
    id: a.id,
    taskId: a.taskId,
    employeeId: a.employeeId,
    units: a.units,
  }));

  return {
    projectStart: snapshot.project.startDate,
    projectCalendar,
    employeeCalendars,
    tasks: snapshot.tasks.map((t) => taskInputOf(t, timezone)),
    dependencies,
    assignments,
  };
}

/**
 * Builds the effective CalendarConfig per employee (own or default calendar
 * plus merged absences) from any snapshot-like data set. Used by the team
 * workload view, which is not bound to a single project.
 */
export function employeeCalendarConfigs(
  data: Pick<ProjectSnapshot, 'calendars' | 'exceptions' | 'employees' | 'absences' | 'workspace'>,
): Record<string, CalendarConfig> {
  const fallback = calendarConfigOf(data, data.workspace.defaultCalendarId);
  const configs: Record<string, CalendarConfig> = {};
  for (const employee of data.employees) {
    const base =
      (employee.calendarId ? calendarConfigOf(data, employee.calendarId) : undefined) ?? fallback;
    if (!base) continue;
    configs[employee.id] = {
      ...base,
      id: `${base.id}::${employee.id}`,
      absences: data.absences
        .filter((a) => a.employeeId === employee.id)
        .map((a) => ({ start: a.startDate, end: a.endDate, type: a.type })),
    };
  }
  return configs;
}

/**
 * Produces the persisted patch of a scheduled task (start/end as UTC ISO).
 * Returns undefined when nothing changed compared to the stored row.
 */
export function scheduledPatchOf(
  row: TaskRow,
  scheduled: ScheduledTask,
  timezone: string,
): TaskRow | undefined {
  const startAt = workMomentToUtc(scheduled.start, timezone);
  const endAt = workMomentToUtc(scheduled.end, timezone);
  if (
    row.startAt === startAt &&
    row.endAt === endAt &&
    row.durationMinutes === scheduled.durationMinutes &&
    row.workMinutes === scheduled.workMinutes
  ) {
    return undefined;
  }
  return {
    ...row,
    startAt,
    endAt,
    durationMinutes: scheduled.durationMinutes,
    workMinutes: scheduled.workMinutes,
  };
}
