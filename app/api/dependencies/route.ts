import { z } from 'zod';
import { handleRoute, newId } from '@/lib/api/route-helpers';
import { getStore } from '@/lib/store';

const createSchema = z.object({
  projectId: z.string().min(1),
  predecessorId: z.string().min(1),
  successorId: z.string().min(1),
  type: z.enum(['FS', 'SS', 'FF', 'SF']).default('FS'),
  lagMinutes: z.number().int().default(0),
});

/** Creates a task dependency. Cycle prevention happens client-side via the engine. */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = createSchema.parse(await request.json());
    if (body.predecessorId === body.successorId) {
      throw Object.assign(new Error('Eine Aufgabe kann nicht von sich selbst abhängen'), { status: 400 });
    }
    return getStore().createDependency({ id: newId(), ...body });
  });
}
