/**
 * Persistence row types shared by all store implementations (JSON file store
 * and Supabase). Shapes mirror the SQL schema in supabase/migrations, with
 * camelCase property names; the Supabase store maps to snake_case columns.
 */

import type {
  AbsenceType,
  ConstraintType,
  DepType,
  Interval,
  IsoDate,
  TaskType,
  WeekDayConfig,
} from '@/engine/types';
import type { Bundesland } from '@/engine/holidays';

/** Singleton workspace of the v1 single-tenant setup. */
export interface WorkspaceRow {
  id: string;
  name: string;
  timezone: string;
  defaultCalendarId: string;
  /** Preselected state for the holiday import. */
  bundesland: Bundesland | null;
}

/** A work-week template or per-employee calendar. */
export interface CalendarRow {
  id: string;
  name: string;
  kind: 'base' | 'resource';
  baseCalendarId: string | null;
  /** Monday-first, 7 entries. */
  week: WeekDayConfig[];
}

/** Date-specific deviation of a calendar (holiday, half day, special day). */
export interface CalendarExceptionRow {
  id: string;
  calendarId: string;
  date: IsoDate;
  name: string;
  working: boolean;
  intervals: Interval[] | null;
}

/** An employee (pure data record in v1, no login). */
export interface EmployeeRow {
  id: string;
  name: string;
  email: string | null;
  calendarId: string | null;
  color: string;
  active: boolean;
}

/** A typed absence of an employee. */
export interface AbsenceRow {
  id: string;
  employeeId: string;
  type: AbsenceType;
  startDate: IsoDate;
  endDate: IsoDate;
  note: string | null;
}

/** Project lifecycle states. */
export type ProjectStatus = 'active' | 'on_hold' | 'done' | 'archived';

/** A project. */
export interface ProjectRow {
  id: string;
  name: string;
  code: string | null;
  status: ProjectStatus;
  startDate: IsoDate;
  calendarId: string;
  color: string;
  createdAt: string;
}

/** A task; engine outputs (startAt/endAt) are denormalized as UTC ISO strings. */
export interface TaskRow {
  id: string;
  projectId: string;
  parentId: string | null;
  sortKey: string;
  name: string;
  taskType: TaskType;
  schedulingMode: 'auto' | 'manual';
  isMilestone: boolean;
  constraintType: ConstraintType;
  constraintDate: IsoDate | null;
  startAt: string | null;
  endAt: string | null;
  durationMinutes: number;
  workMinutes: number;
  percentComplete: number;
  notes: string | null;
}

/** A dependency between two tasks of the same project. */
export interface DependencyRow {
  id: string;
  projectId: string;
  predecessorId: string;
  successorId: string;
  type: DepType;
  lagMinutes: number;
}

/** An employee assignment on a task. */
export interface AssignmentRow {
  id: string;
  taskId: string;
  employeeId: string;
  units: number;
}

/** Everything a project view (Gantt, engine) needs in one round trip. */
export interface ProjectSnapshot {
  workspace: WorkspaceRow;
  project: ProjectRow;
  tasks: TaskRow[];
  dependencies: DependencyRow[];
  assignments: AssignmentRow[];
  employees: EmployeeRow[];
  absences: AbsenceRow[];
  calendars: CalendarRow[];
  exceptions: CalendarExceptionRow[];
}

/** Batch mutation payload for task persistence after an engine run. */
export interface TaskBatch {
  projectId: string;
  upserts: TaskRow[];
  deletes: string[];
}

/** Storage abstraction implemented by the JSON file store and the Supabase store. */
export interface Store {
  getWorkspace(): Promise<WorkspaceRow>;
  updateWorkspace(patch: Partial<Omit<WorkspaceRow, 'id'>>): Promise<WorkspaceRow>;

  listProjects(): Promise<ProjectRow[]>;
  createProject(row: ProjectRow): Promise<ProjectRow>;
  updateProject(id: string, patch: Partial<Omit<ProjectRow, 'id'>>): Promise<ProjectRow>;
  deleteProject(id: string): Promise<void>;
  getProjectSnapshot(projectId: string): Promise<ProjectSnapshot | null>;

  batchTasks(batch: TaskBatch): Promise<void>;
  createDependency(row: DependencyRow): Promise<DependencyRow>;
  updateDependency(id: string, patch: Partial<Omit<DependencyRow, 'id'>>): Promise<DependencyRow>;
  deleteDependency(id: string): Promise<void>;
  setTaskAssignments(taskId: string, rows: AssignmentRow[]): Promise<void>;

  listEmployees(): Promise<EmployeeRow[]>;
  createEmployee(row: EmployeeRow): Promise<EmployeeRow>;
  updateEmployee(id: string, patch: Partial<Omit<EmployeeRow, 'id'>>): Promise<EmployeeRow>;
  deleteEmployee(id: string): Promise<void>;

  listCalendars(): Promise<{ calendars: CalendarRow[]; exceptions: CalendarExceptionRow[] }>;
  createCalendar(row: CalendarRow): Promise<CalendarRow>;
  updateCalendar(id: string, patch: Partial<Omit<CalendarRow, 'id'>>): Promise<CalendarRow>;
  deleteCalendar(id: string): Promise<void>;
  /** Replaces all exceptions of a calendar (week editor + holiday import write whole sets). */
  setCalendarExceptions(calendarId: string, rows: CalendarExceptionRow[]): Promise<void>;

  listAbsences(): Promise<AbsenceRow[]>;
  createAbsence(row: AbsenceRow): Promise<AbsenceRow>;
  deleteAbsence(id: string): Promise<void>;

  /** All data needed for the cross-project team workload view. */
  getTeamSnapshot(): Promise<{
    workspace: WorkspaceRow;
    projects: ProjectRow[];
    tasks: TaskRow[];
    dependencies: DependencyRow[];
    assignments: AssignmentRow[];
    employees: EmployeeRow[];
    absences: AbsenceRow[];
    calendars: CalendarRow[];
    exceptions: CalendarExceptionRow[];
  }>;
}
