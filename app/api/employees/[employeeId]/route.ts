import { z } from 'zod';
import { handleRoute } from '@/lib/api/route-helpers';
import { getStore } from '@/lib/store';

type Params = { params: Promise<{ employeeId: string }> };

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  calendarId: z.string().nullable().optional(),
  color: z.string().optional(),
  active: z.boolean().optional(),
});

/** Updates employee fields. */
export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { employeeId } = await params;
    const patch = patchSchema.parse(await request.json());
    return getStore().updateEmployee(employeeId, patch);
  });
}

/** Deletes an employee including absences and assignments. */
export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { employeeId } = await params;
    await getStore().deleteEmployee(employeeId);
  });
}
