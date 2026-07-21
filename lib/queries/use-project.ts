'use client';

/**
 * Project snapshot query + the central mutation pattern of WWPro:
 * every edit is applied to the in-memory snapshot, the scheduling engine
 * recomputes synchronously, computed dates are merged back, the Query cache is
 * updated optimistically and changed task rows are persisted in ONE batch call.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { computeSchedule } from '@/engine/schedule';
import { buildScheduleInput, scheduledPatchOf } from '@/lib/mappers';
import { api } from '@/lib/api-client';
import type { DepType } from '@/engine/types';
import type { AssignmentRow, ProjectSnapshot, TaskRow } from '@/lib/store/types';

/** Query key of a project snapshot. */
export function projectKey(projectId: string) {
  return ['project', projectId] as const;
}

/** Loads the full project snapshot (tasks, dependencies, assignments, calendars, employees). */
export function useProjectSnapshot(projectId: string) {
  return useQuery({
    queryKey: projectKey(projectId),
    queryFn: () => api<ProjectSnapshot>(`/api/projects/${projectId}`),
  });
}

/**
 * Recomputes the schedule of a snapshot and merges the computed start/end
 * dates into the task rows. Returns the new snapshot plus all rows whose
 * persisted fields changed.
 */
export function reschedule(snapshot: ProjectSnapshot): {
  snapshot: ProjectSnapshot;
  changed: TaskRow[];
} {
  const result = computeSchedule(buildScheduleInput(snapshot));
  const changed: TaskRow[] = [];
  const tasks = snapshot.tasks.map((row) => {
    const scheduled = result.tasks.get(row.id);
    if (!scheduled) return row;
    const patch = scheduledPatchOf(row, scheduled, snapshot.workspace.timezone);
    if (patch) {
      changed.push(patch);
      return patch;
    }
    return row;
  });
  return { snapshot: { ...snapshot, tasks }, changed };
}

/** A snapshot transformation applied by {@link useProjectMutations.apply}. */
export type SnapshotPatch = (snapshot: ProjectSnapshot) => ProjectSnapshot;

/**
 * Central mutation hook: applies a snapshot patch, reschedules, updates the
 * cache optimistically and persists — first the optional side request (e.g.
 * dependency create), then all changed/edited task rows as one batch.
 */
export function useProjectMutations(projectId: string) {
  const queryClient = useQueryClient();

  const persistBatch = useMutation({
    mutationFn: (batch: { upserts: TaskRow[]; deletes: string[] }) =>
      api('/api/tasks/batch', { method: 'POST', json: { projectId, ...batch } }),
    onError: (error) => {
      toast.error(`Speichern fehlgeschlagen: ${error.message}`);
      queryClient.invalidateQueries({ queryKey: projectKey(projectId) });
    },
  });

  /**
   * Applies an edit to the snapshot.
   * @param patch - Pure transformation of the snapshot (task edits, dependency changes …).
   * @param options.sideRequest - Optional server call persisted alongside the task batch.
   * @param options.editedTaskIds - Rows the user edited directly (persisted even if scheduling left them unchanged).
   * @param options.deletes - Task ids removed by the patch.
   */
  const apply = useCallback(
    async (
      patch: SnapshotPatch,
      options?: {
        sideRequest?: () => Promise<unknown>;
        editedTaskIds?: string[];
        deletes?: string[];
      },
    ) => {
      const current = queryClient.getQueryData<ProjectSnapshot>(projectKey(projectId));
      if (!current) return;
      const patched = patch(current);
      const { snapshot, changed } = reschedule(patched);
      queryClient.setQueryData(projectKey(projectId), snapshot);

      const upsertIds = new Set(changed.map((t) => t.id));
      for (const id of options?.editedTaskIds ?? []) upsertIds.add(id);
      const upserts = snapshot.tasks.filter((t) => upsertIds.has(t.id));

      try {
        if (options?.sideRequest) await options.sideRequest();
        if (upserts.length > 0 || (options?.deletes?.length ?? 0) > 0) {
          await persistBatch.mutateAsync({ upserts, deletes: options?.deletes ?? [] });
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Speichern fehlgeschlagen');
        queryClient.invalidateQueries({ queryKey: projectKey(projectId) });
      }
    },
    [projectId, queryClient, persistBatch],
  );

  /** Upserts edited task rows (already containing the user's changes). */
  const upsertTasks = useCallback(
    (rows: TaskRow[]) =>
      apply(
        (snapshot) => {
          const byId = new Map(rows.map((r) => [r.id, r]));
          const existing = new Set(snapshot.tasks.map((t) => t.id));
          const tasks = snapshot.tasks.map((t) => byId.get(t.id) ?? t);
          const added = rows.filter((r) => !existing.has(r.id));
          return { ...snapshot, tasks: [...tasks, ...added] };
        },
        { editedTaskIds: rows.map((r) => r.id) },
      ),
    [apply],
  );

  /** Deletes tasks (children cascade server-side; the patch removes them locally too). */
  const deleteTasks = useCallback(
    (ids: string[]) =>
      apply(
        (snapshot) => {
          const toDelete = new Set(ids);
          let changed = true;
          while (changed) {
            changed = false;
            for (const task of snapshot.tasks) {
              if (task.parentId && toDelete.has(task.parentId) && !toDelete.has(task.id)) {
                toDelete.add(task.id);
                changed = true;
              }
            }
          }
          return {
            ...snapshot,
            tasks: snapshot.tasks.filter((t) => !toDelete.has(t.id)),
            dependencies: snapshot.dependencies.filter(
              (d) => !toDelete.has(d.predecessorId) && !toDelete.has(d.successorId),
            ),
            assignments: snapshot.assignments.filter((a) => !toDelete.has(a.taskId)),
          };
        },
        { deletes: ids },
      ),
    [apply],
  );

  /** Creates a dependency (id generated client-side for the optimistic update). */
  const createDependency = useCallback(
    (dep: { predecessorId: string; successorId: string; type?: DepType; lagMinutes?: number }) => {
      const row = {
        id: crypto.randomUUID(),
        projectId,
        predecessorId: dep.predecessorId,
        successorId: dep.successorId,
        type: dep.type ?? ('FS' as DepType),
        lagMinutes: dep.lagMinutes ?? 0,
      };
      return apply(
        (snapshot) => ({ ...snapshot, dependencies: [...snapshot.dependencies, row] }),
        {
          sideRequest: async () => {
            const created = await api<{ id: string }>('/api/dependencies', {
              method: 'POST',
              json: row,
            });
            // Reconcile the server-generated id in the cache.
            const current = queryClient.getQueryData<ProjectSnapshot>(projectKey(projectId));
            if (current) {
              queryClient.setQueryData(projectKey(projectId), {
                ...current,
                dependencies: current.dependencies.map((d) =>
                  d.id === row.id ? { ...d, id: created.id } : d,
                ),
              });
            }
          },
        },
      );
    },
    [apply, projectId, queryClient],
  );

  /** Updates dependency type/lag. */
  const updateDependency = useCallback(
    (id: string, patch: { type?: DepType; lagMinutes?: number }) =>
      apply(
        (snapshot) => ({
          ...snapshot,
          dependencies: snapshot.dependencies.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        }),
        {
          sideRequest: () => api(`/api/dependencies/${id}`, { method: 'PATCH', json: patch }),
        },
      ),
    [apply],
  );

  /** Deletes a dependency. */
  const deleteDependency = useCallback(
    (id: string) =>
      apply(
        (snapshot) => ({
          ...snapshot,
          dependencies: snapshot.dependencies.filter((d) => d.id !== id),
        }),
        { sideRequest: () => api(`/api/dependencies/${id}`, { method: 'DELETE' }) },
      ),
    [apply],
  );

  /** Replaces the assignments of a task. */
  const setAssignments = useCallback(
    (taskId: string, assignments: { employeeId: string; units: number }[]) =>
      apply(
        (snapshot) => ({
          ...snapshot,
          assignments: [
            ...snapshot.assignments.filter((a) => a.taskId !== taskId),
            ...assignments.map(
              (a): AssignmentRow => ({
                id: crypto.randomUUID(),
                taskId,
                employeeId: a.employeeId,
                units: a.units,
              }),
            ),
          ],
        }),
        {
          sideRequest: () =>
            api(`/api/tasks/${taskId}/assignments`, { method: 'PUT', json: { assignments } }),
        },
      ),
    [apply],
  );

  return {
    apply,
    upsertTasks,
    deleteTasks,
    createDependency,
    updateDependency,
    deleteDependency,
    setAssignments,
  };
}
