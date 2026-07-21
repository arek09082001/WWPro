import { z } from 'zod';
import { handleRoute } from '@/lib/api/route-helpers';
import { getStore } from '@/lib/store';

type Params = { params: Promise<{ projectId: string }> };

/** Returns the full project snapshot (tasks, dependencies, assignments, calendars, employees). */
export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { projectId } = await params;
    const snapshot = await getStore().getProjectSnapshot(projectId);
    if (!snapshot) {
      throw Object.assign(new Error('Projekt nicht gefunden'), { status: 404 });
    }
    return snapshot;
  });
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().nullable().optional(),
  status: z.enum(['active', 'on_hold', 'done', 'archived']).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  calendarId: z.string().min(1).optional(),
  color: z.string().optional(),
});

/** Updates project fields. */
export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { projectId } = await params;
    const patch = patchSchema.parse(await request.json());
    return getStore().updateProject(projectId, patch);
  });
}

/** Deletes a project including its tasks, dependencies and assignments. */
export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { projectId } = await params;
    await getStore().deleteProject(projectId);
  });
}
