/**
 * Demo seed for a freshly created store: a default calendar, a part-time
 * calendar, four employees and a realistic demo project with hierarchy,
 * dependencies, a milestone and one absence — so the app demonstrates the
 * scheduling features on first launch.
 */

import { generateKeyBetween } from 'fractional-indexing';
import { DEFAULT_WEEK } from '@/engine/calendar';
import { addDays, weekdayIndex } from '@/engine/date-utils';
import type { Interval, IsoDate } from '@/engine/types';
import type {
  AbsenceRow,
  AssignmentRow,
  CalendarExceptionRow,
  CalendarRow,
  DependencyRow,
  EmployeeRow,
  ProjectRow,
  TaskRow,
  UserRow,
  WorkspaceRow,
} from './types';

/** Full in-memory database shape of the JSON store. */
export interface DbShape {
  users: UserRow[];
  workspace: WorkspaceRow;
  calendars: CalendarRow[];
  calendarExceptions: CalendarExceptionRow[];
  employees: EmployeeRow[];
  absences: AbsenceRow[];
  projects: ProjectRow[];
  tasks: TaskRow[];
  dependencies: DependencyRow[];
  assignments: AssignmentRow[];
}

/** Next Monday on or after the given date. */
function nextMonday(from: IsoDate): IsoDate {
  const shift = (7 - weekdayIndex(from)) % 7;
  return addDays(from, shift === 0 ? 0 : shift);
}

/** Creates the initial database content, anchored around `today`. */
export function createSeed(today: IsoDate): DbShape {
  const calStandard = 'cal-standard';
  const calPartTime = 'cal-teilzeit';
  const monday = nextMonday(today);

  const workspace: WorkspaceRow = {
    id: 'ws-default',
    name: 'Mein Workspace',
    timezone: 'Europe/Berlin',
    defaultCalendarId: calStandard,
    bundesland: 'NW',
  };

  const calendars: CalendarRow[] = [
    {
      id: calStandard,
      name: 'Standard (Mo–Fr, 8h)',
      kind: 'base',
      baseCalendarId: null,
      week: DEFAULT_WEEK.map((d) => ({ working: d.working, intervals: [...d.intervals] })),
    },
    {
      id: calPartTime,
      name: 'Teilzeit vormittags (Mo–Fr, 4h)',
      kind: 'base',
      baseCalendarId: null,
      week: DEFAULT_WEEK.map((d) =>
        d.working
          ? { working: true, intervals: [[480, 720]] as Interval[] }
          : { working: false, intervals: [] as Interval[] },
      ),
    },
  ];

  const employees: EmployeeRow[] = [
    { id: 'emp-anna', name: 'Anna Weber', email: 'anna@example.com', calendarId: null, color: '#6366f1', active: true },
    { id: 'emp-ben', name: 'Ben Fischer', email: 'ben@example.com', calendarId: null, color: '#0ea5e9', active: true },
    { id: 'emp-clara', name: 'Clara Schmitt', email: 'clara@example.com', calendarId: calPartTime, color: '#10b981', active: true },
    { id: 'emp-david', name: 'David Krause', email: 'david@example.com', calendarId: null, color: '#f59e0b', active: true },
  ];

  const project: ProjectRow = {
    id: 'proj-wohnhaus',
    name: 'BV Wohnhaus Lindenweg 12',
    code: 'WH-L12',
    status: 'active',
    startDate: monday,
    calendarId: calStandard,
    color: '#0ea5e9',
    createdAt: new Date().toISOString(),
  };

  // Task tree with fractional order keys.
  let key: string | null = null;
  const nextKey = () => (key = generateKeyBetween(key, null));
  const day = 480;
  const due = (days: number) => addDays(monday, days);

  const mk = (id: string, name: string, patch: Partial<TaskRow> = {}): TaskRow => ({
    id,
    projectId: project.id,
    parentId: null,
    sortKey: nextKey(),
    name,
    taskType: 'fixed_units',
    schedulingMode: 'auto',
    isMilestone: false,
    constraintType: 'asap',
    constraintDate: null,
    startAt: null,
    endAt: null,
    durationMinutes: day,
    workMinutes: day,
    percentComplete: 0,
    notes: null,
    category: 'sonstiges',
    planNumber: null,
    status: 'in_bearbeitung',
    dueDate: null,
    ...patch,
  });

  const tasks: TaskRow[] = [
    mk('t-statik', 'Statische Berechnung'),
    mk('t-lasten', 'Lastannahmen & Vorbemessung', { parentId: 't-statik', durationMinutes: 2 * day, workMinutes: 2 * day, category: 'berechnung', planNumber: 'ST-01', status: 'freigegeben', percentComplete: 100 }),
    mk('t-st-fund', 'Statik Fundamente & Bodenplatte', { parentId: 't-statik', durationMinutes: 3 * day, workMinutes: 3 * day, category: 'berechnung', planNumber: 'ST-02', status: 'freigegeben', percentComplete: 100 }),
    mk('t-st-decken', 'Statik Decken EG + OG', { parentId: 't-statik', durationMinutes: 4 * day, workMinutes: 4 * day, category: 'berechnung', planNumber: 'ST-03', status: 'zur_pruefung', percentComplete: 60, dueDate: due(10) }),
    mk('t-einreichung', 'Einreichung Prüfstatiker', { parentId: 't-statik', isMilestone: true, durationMinutes: 0, workMinutes: 0, category: 'berechnung', dueDate: due(11) }),
    mk('t-pos', 'Positionspläne'),
    mk('t-p100', 'Positionsplan EG', { parentId: 't-pos', durationMinutes: 2 * day, workMinutes: 2 * day, category: 'positionsplan', planNumber: 'P-100', status: 'in_bearbeitung', percentComplete: 40 }),
    mk('t-p101', 'Positionsplan OG', { parentId: 't-pos', durationMinutes: 2 * day, workMinutes: 2 * day, category: 'positionsplan', planNumber: 'P-101', status: 'entwurf' }),
    mk('t-schal', 'Schalpläne'),
    mk('t-s100', 'Schalplan Fundament & Bodenplatte', { parentId: 't-schal', durationMinutes: 3 * day, workMinutes: 3 * day, category: 'schalplan', planNumber: 'S-100', status: 'zur_pruefung', percentComplete: 80, dueDate: due(9) }),
    mk('t-s101', 'Schalplan Decke über EG', { parentId: 't-schal', durationMinutes: 4 * day, workMinutes: 4 * day, category: 'schalplan', planNumber: 'S-101', status: 'in_bearbeitung', percentComplete: 20, dueDate: due(16) }),
    mk('t-s102', 'Schalplan Decke über OG', { parentId: 't-schal', durationMinutes: 3 * day, workMinutes: 3 * day, category: 'schalplan', planNumber: 'S-102', status: 'entwurf', dueDate: due(24) }),
    mk('t-bew', 'Bewehrungspläne'),
    mk('t-b100', 'Bewehrungsplan Fundament', { parentId: 't-bew', durationMinutes: 4 * day, workMinutes: 4 * day, category: 'bewehrungsplan', planNumber: 'B-100', status: 'in_bearbeitung', percentComplete: 30, dueDate: due(16) }),
    mk('t-b101', 'Bewehrungsplan Decke über EG', { parentId: 't-bew', durationMinutes: 5 * day, workMinutes: 5 * day, category: 'bewehrungsplan', planNumber: 'B-101', status: 'entwurf', dueDate: due(25) }),
    mk('t-b102', 'Bewehrungsplan Decke über OG', { parentId: 't-bew', durationMinutes: 4 * day, workMinutes: 4 * day, category: 'bewehrungsplan', planNumber: 'B-102', status: 'entwurf', dueDate: due(32) }),
    mk('t-lieferung', 'Planlieferung Rohbau komplett', { isMilestone: true, durationMinutes: 0, workMinutes: 0, dueDate: due(32) }),
  ];

  const dep = (predecessorId: string, successorId: string, patch: Partial<DependencyRow> = {}): DependencyRow => ({
    id: `dep-${predecessorId}-${successorId}`,
    projectId: project.id,
    predecessorId,
    successorId,
    type: 'FS',
    lagMinutes: 0,
    ...patch,
  });

  const dependencies: DependencyRow[] = [
    dep('t-lasten', 't-st-fund'),
    dep('t-st-fund', 't-st-decken'),
    dep('t-st-decken', 't-einreichung'),
    dep('t-lasten', 't-p100'),
    dep('t-p100', 't-p101'),
    dep('t-st-fund', 't-s100'),
    dep('t-st-decken', 't-s101'),
    dep('t-p100', 't-s101'),
    dep('t-s101', 't-s102', { type: 'SS', lagMinutes: 2 * day }),
    dep('t-p101', 't-s102'),
    // Klassische Statik-Kette: Bewehrung erst, wenn der Schalplan fertig ist.
    dep('t-s100', 't-b100'),
    dep('t-s101', 't-b101'),
    dep('t-s102', 't-b102'),
    dep('t-b100', 't-lieferung'),
    dep('t-b101', 't-lieferung'),
    dep('t-b102', 't-lieferung'),
  ];

  const assign = (taskId: string, employeeId: string, units = 1): AssignmentRow => ({
    id: `as-${taskId}-${employeeId}`,
    taskId,
    employeeId,
    units,
  });

  const assignments: AssignmentRow[] = [
    assign('t-lasten', 'emp-anna'),
    assign('t-st-fund', 'emp-anna'),
    assign('t-st-decken', 'emp-anna'),
    assign('t-p100', 'emp-ben'),
    assign('t-p101', 'emp-ben'),
    assign('t-s100', 'emp-david'),
    assign('t-s101', 'emp-david'),
    assign('t-s102', 'emp-clara'),
    assign('t-b100', 'emp-ben'),
    assign('t-b101', 'emp-ben'),
    assign('t-b102', 'emp-clara'),
  ];

  const absences: AbsenceRow[] = [
    {
      id: 'abs-ben-urlaub',
      employeeId: 'emp-ben',
      type: 'vacation',
      startDate: addDays(monday, 14),
      endDate: addDays(monday, 18),
      note: 'Sommerurlaub',
    },
  ];

  return {
    users: [],
    workspace,
    calendars,
    calendarExceptions: [],
    employees,
    absences,
    projects: [project],
    tasks,
    dependencies,
    assignments,
  };
}
