import { z } from 'zod';
import { handleRoute, newId } from '@/lib/api/route-helpers';
import { getStore } from '@/lib/store';

/** Lists all employees. */
export async function GET() {
  return handleRoute(() => getStore().listEmployees());
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullish(),
  calendarId: z.string().nullish(),
  color: z.string().optional(),
});

/** Creates an employee. */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = createSchema.parse(await request.json());
    return getStore().createEmployee({
      id: newId(),
      name: body.name,
      email: body.email ?? null,
      calendarId: body.calendarId ?? null,
      color: body.color ?? '#6366f1',
      active: true,
    });
  });
}
