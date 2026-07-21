/**
 * Core types of the WWPro scheduling engine.
 *
 * The engine is pure TypeScript with no imports from React, Next.js or Supabase.
 * All date arithmetic is DST-free by construction: moments are represented as a
 * calendar date plus a minute-of-day, durations are expressed in working minutes.
 * Timezone conversion happens exclusively at the persistence/display boundary
 * (see lib/mappers.ts).
 */

/** ISO calendar date "YYYY-MM-DD" — timezone-free by construction. */
export type IsoDate = string;

/** A moment in project-local working time. `minute` is 0..1439. DST-proof. */
export interface WorkMoment {
  date: IsoDate;
  minute: number;
}

/** Half-open interval [startMinute, endMinute) within a day, e.g. [480, 720] = 08:00–12:00. */
export type Interval = [number, number];

/** Working configuration of a single weekday. */
export interface WeekDayConfig {
  working: boolean;
  /** Sorted, non-overlapping intervals. Empty when `working` is false. */
  intervals: Interval[];
}

/** Absence types supported by employee calendars. */
export type AbsenceType = 'vacation' | 'sick' | 'other';

/** A date-specific deviation from the weekly template (holiday, half-day, special working day). */
export interface CalendarException {
  date: IsoDate;
  working: boolean;
  /** Only present when `working` is true (e.g. a half working day). */
  intervals?: Interval[];
  name: string;
}

/** An employee absence merged into their effective calendar. */
export interface CalendarAbsence {
  start: IsoDate;
  end: IsoDate;
  type: AbsenceType;
}

/**
 * Full calendar definition consumed by the engine.
 * Resolution order per day: absence → own exception → base exception → weekday template.
 */
export interface CalendarConfig {
  id: string;
  /** Monday-first, exactly 7 entries. */
  week: WeekDayConfig[];
  exceptions: CalendarException[];
  /** Merged-in absences (employee calendars only). */
  absences?: CalendarAbsence[];
  /** Base calendar whose exceptions are inherited (resource calendars). */
  base?: CalendarConfig;
}

/** MS-Project-style task types controlling which quantity is recomputed on edit. */
export type TaskType = 'fixed_units' | 'fixed_work' | 'fixed_duration';

/** Scheduling constraints supported in v1. */
export type ConstraintType = 'asap' | 'start_no_earlier_than' | 'must_start_on';

/** Dependency types (Finish/Start × Start/Finish). */
export type DepType = 'FS' | 'SS' | 'FF' | 'SF';

/** Task snapshot handed to the engine. */
export interface TaskInput {
  id: string;
  parentId: string | null;
  /** Fractional-indexing string; sibling order = lexicographic order. */
  orderKey: string;
  name: string;
  taskType: TaskType;
  isMilestone: boolean;
  schedulingMode: 'auto' | 'manual';
  constraintType: ConstraintType;
  constraintDate: IsoDate | null;
  /** Working minutes. */
  durationMinutes: number;
  /** Person-minutes of effort. */
  workMinutes: number;
  percentComplete: number;
  /** Only respected when schedulingMode === 'manual'. */
  manualStart?: WorkMoment;
  manualEnd?: WorkMoment;
}

/** Dependency snapshot handed to the engine. */
export interface DependencyInput {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DepType;
  /** Lag in working minutes on the successor's driving calendar. May be negative (lead). */
  lagMinutes: number;
}

/** Assignment of an employee to a task at a given allocation. */
export interface AssignmentInput {
  id: string;
  taskId: string;
  employeeId: string;
  /** 1.0 = full allocation of that employee's working time. */
  units: number;
}

/** Complete input snapshot for a schedule computation. */
export interface ScheduleInput {
  projectStart: IsoDate;
  projectCalendar: CalendarConfig;
  /** employeeId → effective calendar (absences already merged in). */
  employeeCalendars: Record<string, CalendarConfig>;
  tasks: TaskInput[];
  dependencies: DependencyInput[];
  assignments: AssignmentInput[];
}

/** Reasons a moment was snapped to the next working moment. */
export type SnapReason = 'weekend' | 'exception' | 'absence' | 'outsideHours';

/**
 * Structured reasons explaining how a task's start was determined.
 * The UI translates these into human-readable sentences ("Warum dieses Datum?").
 */
export type StartDriver =
  | { kind: 'projectStart'; date: IsoDate; binding: boolean }
  | {
      kind: 'dependency';
      dependencyId: string;
      predecessorId: string;
      type: DepType;
      lagMinutes: number;
      binding: boolean;
    }
  | { kind: 'constraint'; constraintType: ConstraintType; date: IsoDate; binding: boolean }
  | {
      kind: 'calendarSnap';
      calendarId: string;
      from: WorkMoment;
      to: WorkMoment;
      reason: SnapReason;
      exceptionName?: string;
    }
  | { kind: 'manual' };

/** Structured reasons explaining how a task's end was determined. */
export type EndDriver =
  | { kind: 'durationFromWork'; workMinutes: number; units: number }
  | { kind: 'durationFixed'; durationMinutes: number }
  | { kind: 'milestone' }
  | { kind: 'manual' }
  | { kind: 'summaryRollup' };

/** Warning codes attached to a task's explanation. */
export type ScheduleWarningCode = 'CONSTRAINT_CONFLICT' | 'NO_WORKING_TIME';

/** A non-fatal scheduling warning attached to a task. */
export interface ScheduleWarning {
  code: ScheduleWarningCode;
  message?: string;
}

/** Full explanation payload of a scheduled task. */
export interface ScheduleExplanation {
  startDrivers: StartDriver[];
  endDrivers: EndDriver[];
  warnings: ScheduleWarning[];
}

/** A task with computed schedule values. */
export interface ScheduledTask {
  id: string;
  start: WorkMoment;
  end: WorkMoment;
  durationMinutes: number;
  workMinutes: number;
  isSummary: boolean;
  isCritical: boolean;
  /** Total slack in working minutes (0 on the critical path). */
  totalSlackMinutes: number;
  explanation: ScheduleExplanation;
}

/** Fatal errors of a schedule computation (the pass still completes where possible). */
export type ScheduleError =
  | { code: 'CYCLE'; taskIds: string[] }
  | { code: 'NO_WORKING_TIME'; taskId: string; calendarId: string };

/** One employee/day capacity violation. */
export interface Overallocation {
  employeeId: string;
  date: IsoDate;
  assignedMinutes: number;
  capacityMinutes: number;
  taskIds: string[];
}

/** Per employee/day workload entry (also below capacity — powers the team heatmap). */
export interface WorkloadCell {
  employeeId: string;
  date: IsoDate;
  assignedMinutes: number;
  capacityMinutes: number;
  taskIds: string[];
}

/** Result of a full schedule computation. */
export interface ScheduleResult {
  tasks: Map<string, ScheduledTask>;
  projectEnd: WorkMoment;
  errors: ScheduleError[];
  /** All per-employee/day workload cells (also below capacity). */
  workload: WorkloadCell[];
  /** Subset of {@link workload} exceeding capacity. */
  overallocations: Overallocation[];
}

/** Compares two moments chronologically (-1, 0, 1). */
export function compareMoments(a: WorkMoment, b: WorkMoment): number {
  if (a.date < b.date) return -1;
  if (a.date > b.date) return 1;
  if (a.minute < b.minute) return -1;
  if (a.minute > b.minute) return 1;
  return 0;
}

/** Returns the chronologically later of two moments. */
export function maxMoment(a: WorkMoment, b: WorkMoment): WorkMoment {
  return compareMoments(a, b) >= 0 ? a : b;
}

/** Returns the chronologically earlier of two moments. */
export function minMoment(a: WorkMoment, b: WorkMoment): WorkMoment {
  return compareMoments(a, b) <= 0 ? a : b;
}
