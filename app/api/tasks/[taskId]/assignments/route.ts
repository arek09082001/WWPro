import { z } from 'zod';
import { handleRoute, newId } from '@/lib/api/route-helpers';
import { getStore } from '@/lib/store';

type Params = { params: Promise<{ taskId: string }> };

const putSchema = z.object({
  assignments: z.array(
    z.object({
      employeeId: z.string().min(1),
      units: z.number().gt(0).lte(2),
    }),
  ),
});

/** Replaces all assignments of a task. */
export async function PUT(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { taskId } = await params;
    const body = putSchema.parse(await request.json());
    await getStore().setTaskAssignments(
      taskId,
      body.assignments.map((a) => ({ id: newId(), taskId, employeeId: a.employeeId, units: a.units })),
    );
  });
}
