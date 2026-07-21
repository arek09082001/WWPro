'use client';

/**
 * Gantt page wrapper: loads the project snapshot, renders the Gantt view and
 * the URL-addressable task detail sheet (?task=<id>).
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useProjectSnapshot } from '@/lib/queries/use-project';
import { Skeleton } from '@/components/ui/skeleton';
import TaskDetailSheet from '@/features/tasks/components/task-detail-sheet';
import GanttView from '../components/gantt-view';

/** Inner component using useSearchParams (needs a Suspense boundary). */
function GanttPageInner({ projectId }: { projectId: string }) {
  const { data: snapshot, isLoading, isError, error } = useProjectSnapshot(projectId);
  const searchParams = useSearchParams();
  const router = useRouter();
  const taskId = searchParams.get('task');

  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }
  if (isError || !snapshot) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Projekt konnte nicht geladen werden{error instanceof Error ? `: ${error.message}` : ''}.
      </div>
    );
  }
  return (
    <>
      <GanttView snapshot={snapshot} />
      <TaskDetailSheet
        snapshot={snapshot}
        taskId={taskId}
        onClose={() => router.push('?', { scroll: false })}
      />
    </>
  );
}

/**
 * Renders the Gantt page for a project.
 * @param props - Contains the project id from the route.
 * @param props.projectId - Id of the project to display.
 * @returns A JSX element with the full Gantt experience.
 */
export default function GanttPage({ projectId }: { projectId: string }) {
  return (
    <Suspense>
      <GanttPageInner projectId={projectId} />
    </Suspense>
  );
}
