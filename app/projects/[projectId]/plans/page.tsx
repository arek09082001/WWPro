import PlansPage from '@/features/plans/pages/plans-page';

/**
 * Route: plan delivery list of one project.
 * @param props - Contains the awaited route params with the project id.
 * @returns The plan list page.
 */
export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <PlansPage projectId={projectId} />;
}
