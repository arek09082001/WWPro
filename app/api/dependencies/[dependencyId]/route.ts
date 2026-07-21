import { z } from 'zod';
import { handleRoute } from '@/lib/api/route-helpers';
import { getStore } from '@/lib/store';

type Params = { params: Promise<{ dependencyId: string }> };

const patchSchema = z.object({
  type: z.enum(['FS', 'SS', 'FF', 'SF']).optional(),
  lagMinutes: z.number().int().optional(),
});

/** Updates dependency type/lag. */
export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { dependencyId } = await params;
    const patch = patchSchema.parse(await request.json());
    return getStore().updateDependency(dependencyId, patch);
  });
}

/** Deletes a dependency. */
export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { dependencyId } = await params;
    await getStore().deleteDependency(dependencyId);
  });
}
