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
  WorkspaceRow,
} from './types';

/** Full in-memory database shape of the JSON store. */
export interface DbShape {
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
    id: 'proj-relaunch',
    name: 'Website-Relaunch',
    code: 'WEB',
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
    ...patch,
  });

  const tasks: TaskRow[] = [
    mk('t-konzept', 'Konzeption'),
    mk('t-kickoff', 'Kickoff & Anforderungen', { parentId: 't-konzept', durationMinutes: day, workMinutes: day, percentComplete: 100 }),
    mk('t-ia', 'Informationsarchitektur', { parentId: 't-konzept', durationMinutes: 2 * day, workMinutes: 2 * day, percentComplete: 60 }),
    mk('t-wireframes', 'Wireframes', { parentId: 't-konzept', durationMinutes: 3 * day, workMinutes: 3 * day }),
    mk('t-design', 'Design'),
    mk('t-moodboard', 'Moodboard & Styleguide', { parentId: 't-design', durationMinutes: 2 * day, workMinutes: 2 * day }),
    mk('t-screendesign', 'Screendesigns', { parentId: 't-design', durationMinutes: 5 * day, workMinutes: 5 * day, taskType: 'fixed_work' }),
    mk('t-design-review', 'Design-Review', { parentId: 't-design', isMilestone: true, durationMinutes: 0, workMinutes: 0 }),
    mk('t-umsetzung', 'Umsetzung'),
    mk('t-setup', 'Projekt-Setup & CI', { parentId: 't-umsetzung', durationMinutes: day, workMinutes: day }),
    mk('t-frontend', 'Frontend-Umsetzung', { parentId: 't-umsetzung', durationMinutes: 8 * day, workMinutes: 8 * day, taskType: 'fixed_work' }),
    mk('t-cms', 'CMS-Integration', { parentId: 't-umsetzung', durationMinutes: 5 * day, workMinutes: 5 * day }),
    mk('t-inhalte', 'Inhalte einpflegen', { parentId: 't-umsetzung', durationMinutes: 4 * day, workMinutes: 4 * day }),
    mk('t-qa', 'QA & Bugfixing', { durationMinutes: 3 * day, workMinutes: 3 * day }),
    mk('t-golive', 'Go-Live', { isMilestone: true, durationMinutes: 0, workMinutes: 0 }),
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
    dep('t-kickoff', 't-ia'),
    dep('t-ia', 't-wireframes'),
    dep('t-wireframes', 't-moodboard'),
    dep('t-moodboard', 't-screendesign'),
    dep('t-screendesign', 't-design-review'),
    dep('t-design-review', 't-frontend'),
    dep('t-kickoff', 't-setup'),
    dep('t-setup', 't-frontend', { type: 'FS' }),
    dep('t-frontend', 't-cms', { type: 'SS', lagMinutes: 3 * day }),
    dep('t-cms', 't-inhalte'),
    dep('t-inhalte', 't-qa'),
    dep('t-qa', 't-golive'),
  ];

  const assign = (taskId: string, employeeId: string, units = 1): AssignmentRow => ({
    id: `as-${taskId}-${employeeId}`,
    taskId,
    employeeId,
    units,
  });

  const assignments: AssignmentRow[] = [
    assign('t-kickoff', 'emp-anna'),
    assign('t-ia', 'emp-anna'),
    assign('t-wireframes', 'emp-clara'),
    assign('t-moodboard', 'emp-ben'),
    assign('t-screendesign', 'emp-ben'),
    assign('t-setup', 'emp-david'),
    assign('t-frontend', 'emp-david'),
    assign('t-cms', 'emp-david', 0.5),
    assign('t-inhalte', 'emp-clara'),
    assign('t-qa', 'emp-anna', 0.5),
    assign('t-qa', 'emp-ben', 0.5),
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
