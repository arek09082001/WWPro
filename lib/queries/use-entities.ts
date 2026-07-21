'use client';

/**
 * Query hooks for the workspace-level entities: projects list, employees,
 * calendars, absences, workspace settings and the team snapshot.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import type { WeekDayConfig } from '@/engine/types';
import type { Bundesland } from '@/engine/holidays';
import type {
  AbsenceRow,
  CalendarExceptionRow,
  CalendarRow,
  EmployeeRow,
  ProjectRow,
  ProjectSnapshot,
  WorkspaceRow,
} from '@/lib/store/types';

/** Cross-project data of the team view. */
export type TeamSnapshot = Omit<ProjectSnapshot, 'project'> & { projects: ProjectRow[] };

function useInvalidatingMutation<TInput>(
  keys: string[][],
  fn: (input: TInput) => Promise<unknown>,
  successMessage?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of keys) queryClient.invalidateQueries({ queryKey: key });
      if (successMessage) toast.success(successMessage);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Lists all projects. */
export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: () => api<ProjectRow[]>('/api/projects') });
}

/** Creates a project. */
export function useCreateProject() {
  return useInvalidatingMutation(
    [['projects']],
    (input: { name: string; code?: string | null; startDate: string; calendarId?: string; color?: string }) =>
      api<ProjectRow>('/api/projects', { method: 'POST', json: input }),
    'Projekt angelegt',
  );
}

/** Updates a project. */
export function useUpdateProject() {
  return useInvalidatingMutation(
    [['projects'], ['project'], ['team']],
    (input: { id: string; patch: Partial<Omit<ProjectRow, 'id'>> }) =>
      api(`/api/projects/${input.id}`, { method: 'PATCH', json: input.patch }),
  );
}

/** Deletes a project. */
export function useDeleteProject() {
  return useInvalidatingMutation(
    [['projects'], ['team']],
    (id: string) => api(`/api/projects/${id}`, { method: 'DELETE' }),
    'Projekt gelöscht',
  );
}

/** Lists all employees. */
export function useEmployees() {
  return useQuery({ queryKey: ['employees'], queryFn: () => api<EmployeeRow[]>('/api/employees') });
}

/** Creates an employee. */
export function useCreateEmployee() {
  return useInvalidatingMutation(
    [['employees'], ['team'], ['project']],
    (input: { name: string; email?: string | null; calendarId?: string | null; color?: string }) =>
      api<EmployeeRow>('/api/employees', { method: 'POST', json: input }),
    'Mitarbeiter angelegt',
  );
}

/** Updates an employee. */
export function useUpdateEmployee() {
  return useInvalidatingMutation(
    [['employees'], ['team'], ['project']],
    (input: { id: string; patch: Partial<Omit<EmployeeRow, 'id'>> }) =>
      api(`/api/employees/${input.id}`, { method: 'PATCH', json: input.patch }),
  );
}

/** Deletes an employee. */
export function useDeleteEmployee() {
  return useInvalidatingMutation(
    [['employees'], ['team'], ['project']],
    (id: string) => api(`/api/employees/${id}`, { method: 'DELETE' }),
    'Mitarbeiter gelöscht',
  );
}

/** Lists calendars with exceptions. */
export function useCalendars() {
  return useQuery({
    queryKey: ['calendars'],
    queryFn: () => api<{ calendars: CalendarRow[]; exceptions: CalendarExceptionRow[] }>('/api/calendars'),
  });
}

/** Creates a calendar. */
export function useCreateCalendar() {
  return useInvalidatingMutation(
    [['calendars'], ['team'], ['project']],
    (input: { name: string; kind?: 'base' | 'resource'; week: WeekDayConfig[] }) =>
      api<CalendarRow>('/api/calendars', { method: 'POST', json: input }),
    'Kalender angelegt',
  );
}

/** Updates a calendar (name/week). */
export function useUpdateCalendar() {
  return useInvalidatingMutation(
    [['calendars'], ['team'], ['project']],
    (input: { id: string; patch: { name?: string; week?: WeekDayConfig[] } }) =>
      api(`/api/calendars/${input.id}`, { method: 'PATCH', json: input.patch }),
    'Kalender gespeichert',
  );
}

/** Deletes a calendar. */
export function useDeleteCalendar() {
  return useInvalidatingMutation(
    [['calendars'], ['team'], ['project']],
    (id: string) => api(`/api/calendars/${id}`, { method: 'DELETE' }),
    'Kalender gelöscht',
  );
}

/** Replaces all exceptions of a calendar. */
export function useSetCalendarExceptions() {
  return useInvalidatingMutation(
    [['calendars'], ['team'], ['project']],
    (input: { calendarId: string; exceptions: Omit<CalendarExceptionRow, 'id' | 'calendarId'>[] }) =>
      api(`/api/calendars/${input.calendarId}/exceptions`, {
        method: 'PUT',
        json: { exceptions: input.exceptions },
      }),
    'Ausnahmen gespeichert',
  );
}

/** Lists all absences. */
export function useAbsences() {
  return useQuery({ queryKey: ['absences'], queryFn: () => api<AbsenceRow[]>('/api/absences') });
}

/** Creates an absence. */
export function useCreateAbsence() {
  return useInvalidatingMutation(
    [['absences'], ['team'], ['project']],
    (input: {
      employeeId: string;
      type: AbsenceRow['type'];
      startDate: string;
      endDate: string;
      note?: string | null;
    }) => api<AbsenceRow>('/api/absences', { method: 'POST', json: input }),
    'Abwesenheit eingetragen',
  );
}

/** Deletes an absence. */
export function useDeleteAbsence() {
  return useInvalidatingMutation(
    [['absences'], ['team'], ['project']],
    (id: string) => api(`/api/absences/${id}`, { method: 'DELETE' }),
    'Abwesenheit gelöscht',
  );
}

/** Loads the workspace settings. */
export function useWorkspace() {
  return useQuery({ queryKey: ['workspace'], queryFn: () => api<WorkspaceRow>('/api/workspace') });
}

/** Updates the workspace settings. */
export function useUpdateWorkspace() {
  return useInvalidatingMutation(
    [['workspace'], ['project'], ['team']],
    (patch: { name?: string; bundesland?: Bundesland | null; defaultCalendarId?: string }) =>
      api('/api/workspace', { method: 'PATCH', json: patch }),
  );
}

/** Loads the cross-project team snapshot. */
export function useTeamSnapshot() {
  return useQuery({ queryKey: ['team'], queryFn: () => api<TeamSnapshot>('/api/team') });
}
