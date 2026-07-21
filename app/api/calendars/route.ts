import { z } from 'zod';
import { handleRoute, newId } from '@/lib/api/route-helpers';
import { weekSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/store';

/** Lists all calendars with their exceptions. */
export async function GET() {
  return handleRoute(() => getStore().listCalendars());
}

const createSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['base', 'resource']).default('base'),
  baseCalendarId: z.string().nullish(),
  week: weekSchema,
});

/** Creates a calendar. */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = createSchema.parse(await request.json());
    return getStore().createCalendar({
      id: newId(),
      name: body.name,
      kind: body.kind,
      baseCalendarId: body.baseCalendarId ?? null,
      week: body.week,
    });
  });
}
