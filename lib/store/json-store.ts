/**
 * File-backed JSON store — the zero-setup default persistence of WWPro.
 * Data lives in `data/wwpro.db.json` (gitignored). Writes are atomic
 * (temp file + rename). Server-side only.
 */

import 'server-only';

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSeed, type DbShape } from './seed';
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
  WorkspaceRow,
} from './types';

/** Module-level cache surviving Next.js dev hot reloads. */
const globalCache = globalThis as unknown as { __wwproDb?: Promise<DbShape>; __wwproDir?: string };

/**
 * Resolves the writable data directory: WWPRO_DATA_DIR, else ./data, else the
 * OS temp dir (serverless platforms like Vercel have a read-only app dir —
 * the temp fallback keeps the demo functional, but data is ephemeral there).
 */
async function dataDir(): Promise<string> {
  if (globalCache.__wwproDir) return globalCache.__wwproDir;
  const preferred = process.env.WWPRO_DATA_DIR ?? path.join(process.cwd(), 'data');
  try {
    await mkdir(preferred, { recursive: true });
    globalCache.__wwproDir = preferred;
  } catch {
    const fallback = path.join(os.tmpdir(), 'wwpro-data');
    await mkdir(fallback, { recursive: true });
    globalCache.__wwproDir = fallback;
  }
  return globalCache.__wwproDir;
}

async function dbFile(): Promise<string> {
  return path.join(await dataDir(), 'wwpro.db.json');
}

async function loadDb(): Promise<DbShape> {
  try {
    const raw = await readFile(await dbFile(), 'utf8');
    return JSON.parse(raw) as DbShape;
  } catch {
    const seeded = createSeed(new Date().toISOString().slice(0, 10));
    await persist(seeded);
    return seeded;
  }
}

async function persist(db: DbShape): Promise<void> {
  const file = await dbFile();
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
  await rename(tmp, file);
}

function getDb(): Promise<DbShape> {
  if (!globalCache.__wwproDb) {
    globalCache.__wwproDb = loadDb();
  }
  return globalCache.__wwproDb;
}

/** Applies a mutation to the database and persists the result. */
async function mutate<T>(fn: (db: DbShape) => T): Promise<T> {
  const db = await getDb();
  const result = fn(db);
  await persist(db);
  return result;
}

function notFound(entity: string, id: string): never {
  throw Object.assign(new Error(`${entity} ${id} nicht gefunden`), { status: 404 });
}

/** JSON-file implementation of the {@link Store} interface. */
export class JsonStore implements Store {
  async getWorkspace(): Promise<WorkspaceRow> {
    return (await getDb()).workspace;
  }

  async updateWorkspace(patch: Partial<Omit<WorkspaceRow, 'id'>>): Promise<WorkspaceRow> {
    return mutate((db) => {
      Object.assign(db.workspace, patch);
      return db.workspace;
    });
  }

  async listProjects(): Promise<ProjectRow[]> {
    const db = await getDb();
    return [...db.projects].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createProject(row: ProjectRow): Promise<ProjectRow> {
    return mutate((db) => {
      db.projects.push(row);
      return row;
    });
  }

  async updateProject(id: string, patch: Partial<Omit<ProjectRow, 'id'>>): Promise<ProjectRow> {
    return mutate((db) => {
      const project = db.projects.find((p) => p.id === id) ?? notFound('Projekt', id);
      Object.assign(project, patch);
      return project;
    });
  }

  async deleteProject(id: string): Promise<void> {
    await mutate((db) => {
      const taskIds = new Set(db.tasks.filter((t) => t.projectId === id).map((t) => t.id));
      db.projects = db.projects.filter((p) => p.id !== id);
      db.tasks = db.tasks.filter((t) => t.projectId !== id);
      db.dependencies = db.dependencies.filter((d) => d.projectId !== id);
      db.assignments = db.assignments.filter((a) => !taskIds.has(a.taskId));
    });
  }

  async getProjectSnapshot(projectId: string): Promise<ProjectSnapshot | null> {
    const db = await getDb();
    const project = db.projects.find((p) => p.id === projectId);
    if (!project) return null;
    const tasks = db.tasks.filter((t) => t.projectId === projectId);
    const taskIds = new Set(tasks.map((t) => t.id));
    return {
      workspace: db.workspace,
      project,
      tasks,
      dependencies: db.dependencies.filter((d) => d.projectId === projectId),
      assignments: db.assignments.filter((a) => taskIds.has(a.taskId)),
      employees: db.employees,
      absences: db.absences,
      calendars: db.calendars,
      exceptions: db.calendarExceptions,
    };
  }

  async batchTasks(batch: TaskBatch): Promise<void> {
    await mutate((db) => {
      const deletes = new Set(batch.deletes);
      // Cascade: also delete descendants of deleted tasks.
      let changed = true;
      while (changed) {
        changed = false;
        for (const task of db.tasks) {
          if (task.parentId && deletes.has(task.parentId) && !deletes.has(task.id)) {
            deletes.add(task.id);
            changed = true;
          }
        }
      }
      db.tasks = db.tasks.filter((t) => !deletes.has(t.id));
      db.dependencies = db.dependencies.filter(
        (d) => !deletes.has(d.predecessorId) && !deletes.has(d.successorId),
      );
      db.assignments = db.assignments.filter((a) => !deletes.has(a.taskId));
      for (const upsert of batch.upserts) {
        const index = db.tasks.findIndex((t) => t.id === upsert.id);
        if (index >= 0) db.tasks[index] = upsert;
        else db.tasks.push(upsert);
      }
    });
  }

  async createDependency(row: DependencyRow): Promise<DependencyRow> {
    return mutate((db) => {
      const duplicate = db.dependencies.some(
        (d) => d.predecessorId === row.predecessorId && d.successorId === row.successorId,
      );
      if (duplicate) {
        throw Object.assign(new Error('Abhängigkeit existiert bereits'), { status: 409 });
      }
      db.dependencies.push(row);
      return row;
    });
  }

  async updateDependency(id: string, patch: Partial<Omit<DependencyRow, 'id'>>): Promise<DependencyRow> {
    return mutate((db) => {
      const dependency = db.dependencies.find((d) => d.id === id) ?? notFound('Abhängigkeit', id);
      Object.assign(dependency, patch);
      return dependency;
    });
  }

  async deleteDependency(id: string): Promise<void> {
    await mutate((db) => {
      db.dependencies = db.dependencies.filter((d) => d.id !== id);
    });
  }

  async setTaskAssignments(taskId: string, rows: AssignmentRow[]): Promise<void> {
    await mutate((db) => {
      db.assignments = db.assignments.filter((a) => a.taskId !== taskId);
      db.assignments.push(...rows);
    });
  }

  async listEmployees(): Promise<EmployeeRow[]> {
    const db = await getDb();
    return [...db.employees].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  async createEmployee(row: EmployeeRow): Promise<EmployeeRow> {
    return mutate((db) => {
      db.employees.push(row);
      return row;
    });
  }

  async updateEmployee(id: string, patch: Partial<Omit<EmployeeRow, 'id'>>): Promise<EmployeeRow> {
    return mutate((db) => {
      const employee = db.employees.find((e) => e.id === id) ?? notFound('Mitarbeiter', id);
      Object.assign(employee, patch);
      return employee;
    });
  }

  async deleteEmployee(id: string): Promise<void> {
    await mutate((db) => {
      db.employees = db.employees.filter((e) => e.id !== id);
      db.absences = db.absences.filter((a) => a.employeeId !== id);
      db.assignments = db.assignments.filter((a) => a.employeeId !== id);
    });
  }

  async listCalendars(): Promise<{ calendars: CalendarRow[]; exceptions: CalendarExceptionRow[] }> {
    const db = await getDb();
    return { calendars: db.calendars, exceptions: db.calendarExceptions };
  }

  async createCalendar(row: CalendarRow): Promise<CalendarRow> {
    return mutate((db) => {
      db.calendars.push(row);
      return row;
    });
  }

  async updateCalendar(id: string, patch: Partial<Omit<CalendarRow, 'id'>>): Promise<CalendarRow> {
    return mutate((db) => {
      const calendar = db.calendars.find((c) => c.id === id) ?? notFound('Kalender', id);
      Object.assign(calendar, patch);
      return calendar;
    });
  }

  async deleteCalendar(id: string): Promise<void> {
    await mutate((db) => {
      if (db.workspace.defaultCalendarId === id) {
        throw Object.assign(new Error('Der Standardkalender kann nicht gelöscht werden'), { status: 409 });
      }
      db.calendars = db.calendars.filter((c) => c.id !== id);
      db.calendarExceptions = db.calendarExceptions.filter((e) => e.calendarId !== id);
      for (const employee of db.employees) {
        if (employee.calendarId === id) employee.calendarId = null;
      }
      for (const project of db.projects) {
        if (project.calendarId === id) project.calendarId = db.workspace.defaultCalendarId;
      }
    });
  }

  async setCalendarExceptions(calendarId: string, rows: CalendarExceptionRow[]): Promise<void> {
    await mutate((db) => {
      db.calendarExceptions = db.calendarExceptions.filter((e) => e.calendarId !== calendarId);
      db.calendarExceptions.push(...rows);
    });
  }

  async listAbsences(): Promise<AbsenceRow[]> {
    const db = await getDb();
    return [...db.absences].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  async createAbsence(row: AbsenceRow): Promise<AbsenceRow> {
    return mutate((db) => {
      db.absences.push(row);
      return row;
    });
  }

  async deleteAbsence(id: string): Promise<void> {
    await mutate((db) => {
      db.absences = db.absences.filter((a) => a.id !== id);
    });
  }

  async getTeamSnapshot() {
    const db = await getDb();
    return {
      workspace: db.workspace,
      projects: db.projects,
      tasks: db.tasks,
      dependencies: db.dependencies,
      assignments: db.assignments,
      employees: db.employees,
      absences: db.absences,
      calendars: db.calendars,
      exceptions: db.calendarExceptions,
    };
  }
}
