/**
 * Supabase-backed store (server-side only, service-role key). Implements the
 * same Store interface as the JSON file store; camelCase rows are mapped to
 * the snake_case SQL schema in supabase/migrations. On first access the
 * workspace and default calendars are bootstrapped automatically.
 */

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_WEEK } from '@/engine/calendar';
import type { Interval } from '@/engine/types';
import type {
  AbsenceRow,
  AssignmentRow,
  CalendarExceptionRow,
  CalendarRow,
  DependencyRow,
  EmployeeRow,
  ProjectRow,
  ProjectSnapshot,
  Store,
  TaskBatch,
  TaskRow,
  WorkspaceRow,
} from './types';

function fail(message: string, status = 500): never {
  throw Object.assign(new Error(message), { status });
}

/* ---------- row mappers (db snake_case ⇄ app camelCase) ---------- */

type Db = Record<string, unknown>;

const mapWorkspace = (r: Db): WorkspaceRow => ({
  id: r.id as string,
  name: r.name as string,
  timezone: r.timezone as string,
  defaultCalendarId: r.default_calendar_id as string,
  bundesland: (r.bundesland ?? null) as WorkspaceRow['bundesland'],
});

const mapCalendar = (r: Db): CalendarRow => ({
  id: r.id as string,
  name: r.name as string,
  kind: r.kind as CalendarRow['kind'],
  baseCalendarId: (r.base_calendar_id ?? null) as string | null,
  week: r.week as CalendarRow['week'],
});

const mapException = (r: Db): CalendarExceptionRow => ({
  id: r.id as string,
  calendarId: r.calendar_id as string,
  date: r.date as string,
  name: r.name as string,
  working: r.working as boolean,
  intervals: (r.intervals ?? null) as Interval[] | null,
});

const mapEmployee = (r: Db): EmployeeRow => ({
  id: r.id as string,
  name: r.name as string,
  email: (r.email ?? null) as string | null,
  calendarId: (r.calendar_id ?? null) as string | null,
  color: r.color as string,
  active: r.active as boolean,
});

const mapAbsence = (r: Db): AbsenceRow => ({
  id: r.id as string,
  employeeId: r.employee_id as string,
  type: r.type as AbsenceRow['type'],
  startDate: r.start_date as string,
  endDate: r.end_date as string,
  note: (r.note ?? null) as string | null,
});

const mapProject = (r: Db): ProjectRow => ({
  id: r.id as string,
  name: r.name as string,
  code: (r.code ?? null) as string | null,
  status: r.status as ProjectRow['status'],
  startDate: r.start_date as string,
  calendarId: r.calendar_id as string,
  color: r.color as string,
  createdAt: r.created_at as string,
});

const mapTask = (r: Db): TaskRow => ({
  id: r.id as string,
  projectId: r.project_id as string,
  parentId: (r.parent_id ?? null) as string | null,
  sortKey: r.sort_key as string,
  name: r.name as string,
  taskType: r.task_type as TaskRow['taskType'],
  schedulingMode: r.scheduling_mode as TaskRow['schedulingMode'],
  isMilestone: r.is_milestone as boolean,
  constraintType: r.constraint_type as TaskRow['constraintType'],
  constraintDate: (r.constraint_date ?? null) as string | null,
  startAt: (r.start_at ?? null) as string | null,
  endAt: (r.end_at ?? null) as string | null,
  durationMinutes: r.duration_minutes as number,
  workMinutes: r.work_minutes as number,
  percentComplete: r.percent_complete as number,
  notes: (r.notes ?? null) as string | null,
  category: r.category as TaskRow['category'],
  planNumber: (r.plan_number ?? null) as string | null,
  status: r.status as TaskRow['status'],
  dueDate: (r.due_date ?? null) as string | null,
});

const mapDependency = (r: Db): DependencyRow => ({
  id: r.id as string,
  projectId: r.project_id as string,
  predecessorId: r.predecessor_id as string,
  successorId: r.successor_id as string,
  type: r.type as DependencyRow['type'],
  lagMinutes: r.lag_minutes as number,
});

const mapAssignment = (r: Db): AssignmentRow => ({
  id: r.id as string,
  taskId: r.task_id as string,
  employeeId: r.employee_id as string,
  units: Number(r.units),
});

const taskToDb = (t: TaskRow, workspaceId: string): Db => ({
  id: t.id,
  workspace_id: workspaceId,
  project_id: t.projectId,
  parent_id: t.parentId,
  sort_key: t.sortKey,
  name: t.name,
  task_type: t.taskType,
  scheduling_mode: t.schedulingMode,
  is_milestone: t.isMilestone,
  constraint_type: t.constraintType,
  constraint_date: t.constraintDate,
  start_at: t.startAt,
  end_at: t.endAt,
  duration_minutes: t.durationMinutes,
  work_minutes: t.workMinutes,
  percent_complete: t.percentComplete,
  notes: t.notes,
  category: t.category,
  plan_number: t.planNumber,
  status: t.status,
  due_date: t.dueDate,
});

/* ---------- store ---------- */

/** Supabase implementation of the {@link Store} interface. */
export class SupabaseStore implements Store {
  private client: SupabaseClient;
  private workspaceId: string | undefined;

  /**
   * @param url - Supabase project URL.
   * @param serviceRoleKey - Service-role key (server-side only, bypasses RLS).
   */
  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /** Returns the singleton workspace, bootstrapping workspace + calendars on first run. */
  private async ensureWorkspace(): Promise<WorkspaceRow> {
    const { data, error } = await this.client.from('workspaces').select('*').limit(1);
    if (error) fail(error.message);
    if (data && data.length > 0) {
      this.workspaceId = data[0].id as string;
      return mapWorkspace(data[0]);
    }
    // Bootstrap: workspace + standard/part-time calendars.
    const ws = await this.client
      .from('workspaces')
      .insert({ name: 'Mein Workspace', timezone: 'Europe/Berlin' })
      .select('*')
      .single();
    if (ws.error) fail(ws.error.message);
    const workspaceId = ws.data.id as string;
    const std = await this.client
      .from('calendars')
      .insert({
        workspace_id: workspaceId,
        name: 'Standard (Mo–Fr, 8h)',
        kind: 'base',
        week: DEFAULT_WEEK,
      })
      .select('*')
      .single();
    if (std.error) fail(std.error.message);
    await this.client.from('calendars').insert({
      workspace_id: workspaceId,
      name: 'Teilzeit vormittags (Mo–Fr, 4h)',
      kind: 'base',
      week: DEFAULT_WEEK.map((d) =>
        d.working ? { working: true, intervals: [[480, 720]] } : { working: false, intervals: [] },
      ),
    });
    const updated = await this.client
      .from('workspaces')
      .update({ default_calendar_id: std.data.id })
      .eq('id', workspaceId)
      .select('*')
      .single();
    if (updated.error) fail(updated.error.message);
    this.workspaceId = workspaceId;
    return mapWorkspace(updated.data);
  }

  private async wsId(): Promise<string> {
    if (!this.workspaceId) await this.ensureWorkspace();
    return this.workspaceId!;
  }

  async getWorkspace(): Promise<WorkspaceRow> {
    return this.ensureWorkspace();
  }

  async updateWorkspace(patch: Partial<Omit<WorkspaceRow, 'id'>>): Promise<WorkspaceRow> {
    const id = await this.wsId();
    const db: Db = {};
    if (patch.name !== undefined) db.name = patch.name;
    if (patch.timezone !== undefined) db.timezone = patch.timezone;
    if (patch.defaultCalendarId !== undefined) db.default_calendar_id = patch.defaultCalendarId;
    if (patch.bundesland !== undefined) db.bundesland = patch.bundesland;
    const { data, error } = await this.client.from('workspaces').update(db).eq('id', id).select('*').single();
    if (error) fail(error.message);
    return mapWorkspace(data);
  }

  async listProjects(): Promise<ProjectRow[]> {
    await this.wsId();
    const { data, error } = await this.client.from('projects').select('*').order('created_at');
    if (error) fail(error.message);
    return data.map(mapProject);
  }

  async createProject(row: ProjectRow): Promise<ProjectRow> {
    const workspaceId = await this.wsId();
    const { data, error } = await this.client
      .from('projects')
      .insert({
        id: row.id,
        workspace_id: workspaceId,
        name: row.name,
        code: row.code,
        status: row.status,
        start_date: row.startDate,
        calendar_id: row.calendarId,
        color: row.color,
      })
      .select('*')
      .single();
    if (error) fail(error.message);
    return mapProject(data);
  }

  async updateProject(id: string, patch: Partial<Omit<ProjectRow, 'id'>>): Promise<ProjectRow> {
    const db: Db = {};
    if (patch.name !== undefined) db.name = patch.name;
    if (patch.code !== undefined) db.code = patch.code;
    if (patch.status !== undefined) db.status = patch.status;
    if (patch.startDate !== undefined) db.start_date = patch.startDate;
    if (patch.calendarId !== undefined) db.calendar_id = patch.calendarId;
    if (patch.color !== undefined) db.color = patch.color;
    const { data, error } = await this.client.from('projects').update(db).eq('id', id).select('*').single();
    if (error) fail(error.message);
    return mapProject(data);
  }

  async deleteProject(id: string): Promise<void> {
    const { error } = await this.client.from('projects').delete().eq('id', id);
    if (error) fail(error.message);
  }

  async getProjectSnapshot(projectId: string): Promise<ProjectSnapshot | null> {
    const workspace = await this.ensureWorkspace();
    const project = await this.client.from('projects').select('*').eq('id', projectId).maybeSingle();
    if (project.error) fail(project.error.message);
    if (!project.data) return null;
    const [tasks, dependencies, employees, absences, calendars, exceptions] = await Promise.all([
      this.client.from('tasks').select('*').eq('project_id', projectId),
      this.client.from('task_dependencies').select('*').eq('project_id', projectId),
      this.client.from('employees').select('*').order('name'),
      this.client.from('absences').select('*'),
      this.client.from('calendars').select('*'),
      this.client.from('calendar_exceptions').select('*'),
    ]);
    for (const r of [tasks, dependencies, employees, absences, calendars, exceptions]) {
      if (r.error) fail(r.error.message);
    }
    const taskIds = (tasks.data ?? []).map((t) => t.id as string);
    const assignments =
      taskIds.length > 0
        ? await this.client.from('task_assignments').select('*').in('task_id', taskIds)
        : { data: [], error: null };
    if (assignments.error) fail(assignments.error.message);
    return {
      workspace,
      project: mapProject(project.data),
      tasks: (tasks.data ?? []).map(mapTask),
      dependencies: (dependencies.data ?? []).map(mapDependency),
      assignments: (assignments.data ?? []).map(mapAssignment),
      employees: (employees.data ?? []).map(mapEmployee),
      absences: (absences.data ?? []).map(mapAbsence),
      calendars: (calendars.data ?? []).map(mapCalendar),
      exceptions: (exceptions.data ?? []).map(mapException),
    };
  }

  async batchTasks(batch: TaskBatch): Promise<void> {
    const workspaceId = await this.wsId();
    if (batch.deletes.length > 0) {
      // Children/dependencies/assignments cascade via FK constraints.
      const { error } = await this.client.from('tasks').delete().in('id', batch.deletes);
      if (error) fail(error.message);
    }
    if (batch.upserts.length > 0) {
      const { error } = await this.client
        .from('tasks')
        .upsert(batch.upserts.map((t) => taskToDb(t, workspaceId)));
      if (error) fail(error.message);
    }
  }

  async createDependency(row: DependencyRow): Promise<DependencyRow> {
    const workspaceId = await this.wsId();
    const { data, error } = await this.client
      .from('task_dependencies')
      .insert({
        id: row.id,
        workspace_id: workspaceId,
        project_id: row.projectId,
        predecessor_id: row.predecessorId,
        successor_id: row.successorId,
        type: row.type,
        lag_minutes: row.lagMinutes,
      })
      .select('*')
      .single();
    if (error) fail(error.message, error.code === '23505' ? 409 : 500);
    return mapDependency(data);
  }

  async updateDependency(id: string, patch: Partial<Omit<DependencyRow, 'id'>>): Promise<DependencyRow> {
    const db: Db = {};
    if (patch.type !== undefined) db.type = patch.type;
    if (patch.lagMinutes !== undefined) db.lag_minutes = patch.lagMinutes;
    const { data, error } = await this.client
      .from('task_dependencies')
      .update(db)
      .eq('id', id)
      .select('*')
      .single();
    if (error) fail(error.message);
    return mapDependency(data);
  }

  async deleteDependency(id: string): Promise<void> {
    const { error } = await this.client.from('task_dependencies').delete().eq('id', id);
    if (error) fail(error.message);
  }

  async setTaskAssignments(taskId: string, rows: AssignmentRow[]): Promise<void> {
    const workspaceId = await this.wsId();
    const del = await this.client.from('task_assignments').delete().eq('task_id', taskId);
    if (del.error) fail(del.error.message);
    if (rows.length > 0) {
      const { error } = await this.client.from('task_assignments').insert(
        rows.map((a) => ({
          id: a.id,
          workspace_id: workspaceId,
          task_id: a.taskId,
          employee_id: a.employeeId,
          units: a.units,
        })),
      );
      if (error) fail(error.message);
    }
  }

  async listEmployees(): Promise<EmployeeRow[]> {
    await this.wsId();
    const { data, error } = await this.client.from('employees').select('*').order('name');
    if (error) fail(error.message);
    return data.map(mapEmployee);
  }

  async createEmployee(row: EmployeeRow): Promise<EmployeeRow> {
    const workspaceId = await this.wsId();
    const { data, error } = await this.client
      .from('employees')
      .insert({
        id: row.id,
        workspace_id: workspaceId,
        name: row.name,
        email: row.email,
        calendar_id: row.calendarId,
        color: row.color,
        active: row.active,
      })
      .select('*')
      .single();
    if (error) fail(error.message);
    return mapEmployee(data);
  }

  async updateEmployee(id: string, patch: Partial<Omit<EmployeeRow, 'id'>>): Promise<EmployeeRow> {
    const db: Db = {};
    if (patch.name !== undefined) db.name = patch.name;
    if (patch.email !== undefined) db.email = patch.email;
    if (patch.calendarId !== undefined) db.calendar_id = patch.calendarId;
    if (patch.color !== undefined) db.color = patch.color;
    if (patch.active !== undefined) db.active = patch.active;
    const { data, error } = await this.client.from('employees').update(db).eq('id', id).select('*').single();
    if (error) fail(error.message);
    return mapEmployee(data);
  }

  async deleteEmployee(id: string): Promise<void> {
    const { error } = await this.client.from('employees').delete().eq('id', id);
    if (error) fail(error.message);
  }

  async listCalendars(): Promise<{ calendars: CalendarRow[]; exceptions: CalendarExceptionRow[] }> {
    await this.wsId();
    const [calendars, exceptions] = await Promise.all([
      this.client.from('calendars').select('*').order('created_at'),
      this.client.from('calendar_exceptions').select('*').order('date'),
    ]);
    if (calendars.error) fail(calendars.error.message);
    if (exceptions.error) fail(exceptions.error.message);
    return {
      calendars: (calendars.data ?? []).map(mapCalendar),
      exceptions: (exceptions.data ?? []).map(mapException),
    };
  }

  async createCalendar(row: CalendarRow): Promise<CalendarRow> {
    const workspaceId = await this.wsId();
    const { data, error } = await this.client
      .from('calendars')
      .insert({
        id: row.id,
        workspace_id: workspaceId,
        name: row.name,
        kind: row.kind,
        base_calendar_id: row.baseCalendarId,
        week: row.week,
      })
      .select('*')
      .single();
    if (error) fail(error.message);
    return mapCalendar(data);
  }

  async updateCalendar(id: string, patch: Partial<Omit<CalendarRow, 'id'>>): Promise<CalendarRow> {
    const db: Db = {};
    if (patch.name !== undefined) db.name = patch.name;
    if (patch.baseCalendarId !== undefined) db.base_calendar_id = patch.baseCalendarId;
    if (patch.week !== undefined) db.week = patch.week;
    const { data, error } = await this.client.from('calendars').update(db).eq('id', id).select('*').single();
    if (error) fail(error.message);
    return mapCalendar(data);
  }

  async deleteCalendar(id: string): Promise<void> {
    const workspace = await this.ensureWorkspace();
    if (workspace.defaultCalendarId === id) {
      fail('Der Standardkalender kann nicht gelöscht werden', 409);
    }
    await this.client.from('employees').update({ calendar_id: null }).eq('calendar_id', id);
    await this.client
      .from('projects')
      .update({ calendar_id: workspace.defaultCalendarId })
      .eq('calendar_id', id);
    const { error } = await this.client.from('calendars').delete().eq('id', id);
    if (error) fail(error.message);
  }

  async setCalendarExceptions(calendarId: string, rows: CalendarExceptionRow[]): Promise<void> {
    const workspaceId = await this.wsId();
    const del = await this.client.from('calendar_exceptions').delete().eq('calendar_id', calendarId);
    if (del.error) fail(del.error.message);
    if (rows.length > 0) {
      const { error } = await this.client.from('calendar_exceptions').insert(
        rows.map((e) => ({
          id: e.id,
          workspace_id: workspaceId,
          calendar_id: calendarId,
          date: e.date,
          name: e.name,
          working: e.working,
          intervals: e.intervals,
        })),
      );
      if (error) fail(error.message);
    }
  }

  async listAbsences(): Promise<AbsenceRow[]> {
    await this.wsId();
    const { data, error } = await this.client.from('absences').select('*').order('start_date');
    if (error) fail(error.message);
    return data.map(mapAbsence);
  }

  async createAbsence(row: AbsenceRow): Promise<AbsenceRow> {
    const workspaceId = await this.wsId();
    const { data, error } = await this.client
      .from('absences')
      .insert({
        id: row.id,
        workspace_id: workspaceId,
        employee_id: row.employeeId,
        type: row.type,
        start_date: row.startDate,
        end_date: row.endDate,
        note: row.note,
      })
      .select('*')
      .single();
    if (error) fail(error.message);
    return mapAbsence(data);
  }

  async deleteAbsence(id: string): Promise<void> {
    const { error } = await this.client.from('absences').delete().eq('id', id);
    if (error) fail(error.message);
  }

  async getTeamSnapshot() {
    const workspace = await this.ensureWorkspace();
    const [projects, tasks, dependencies, assignments, employees, absences, calendars, exceptions] =
      await Promise.all([
        this.client.from('projects').select('*').order('created_at'),
        this.client.from('tasks').select('*'),
        this.client.from('task_dependencies').select('*'),
        this.client.from('task_assignments').select('*'),
        this.client.from('employees').select('*').order('name'),
        this.client.from('absences').select('*'),
        this.client.from('calendars').select('*'),
        this.client.from('calendar_exceptions').select('*'),
      ]);
    for (const r of [projects, tasks, dependencies, assignments, employees, absences, calendars, exceptions]) {
      if (r.error) fail(r.error.message);
    }
    return {
      workspace,
      projects: (projects.data ?? []).map(mapProject),
      tasks: (tasks.data ?? []).map(mapTask),
      dependencies: (dependencies.data ?? []).map(mapDependency),
      assignments: (assignments.data ?? []).map(mapAssignment),
      employees: (employees.data ?? []).map(mapEmployee),
      absences: (absences.data ?? []).map(mapAbsence),
      calendars: (calendars.data ?? []).map(mapCalendar),
      exceptions: (exceptions.data ?? []).map(mapException),
    };
  }
}
