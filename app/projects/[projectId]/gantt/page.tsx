import GanttPage from '@/features/gantt/pages/gantt-page';

/**
 * Route: interactive Gantt of one project.
 * @param props - Contains the awaited route params with the project id.
 * @returns The Gantt page.
 */
export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <GanttPage projectId={projectId} />;
}
