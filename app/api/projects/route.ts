import { z } from 'zod';
import { handleRoute, newId } from '@/lib/api/route-helpers';
import { getStore } from '@/lib/store';

/** Lists all projects. */
export async function GET() {
  return handleRoute(() => getStore().listProjects());
}

const createProjectSchema = z.object({
  name: z.string().min(1),
  code: z.string().nullish(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  calendarId: z.string().min(1).optional(),
  color: z.string().optional(),
});

/** Creates a project. */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = createProjectSchema.parse(await request.json());
    const store = getStore();
    const workspace = await store.getWorkspace();
    return store.createProject({
      id: newId(),
      name: body.name,
      code: body.code ?? null,
      status: 'active',
      startDate: body.startDate,
      calendarId: body.calendarId ?? workspace.defaultCalendarId,
      color: body.color ?? '#0ea5e9',
      createdAt: new Date().toISOString(),
    });
  });
}
