import EmployeeDetailPage from '@/features/employees/pages/employee-detail-page';

/**
 * Route: employee detail.
 * @param props - Route props containing the dynamic segment params.
 * @param props.params - Promise resolving to the route params with the employee id.
 * @returns The employee detail page for the routed employee.
 */
export default async function Page({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  return <EmployeeDetailPage employeeId={employeeId} />;
}
