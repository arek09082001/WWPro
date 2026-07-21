import { z } from 'zod';
import { handleRoute } from '@/lib/api/route-helpers';
import { weekSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/store';

type Params = { params: Promise<{ calendarId: string }> };

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  baseCalendarId: z.string().nullable().optional(),
  week: weekSchema.optional(),
});

/** Updates calendar name/base/week. */
export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { calendarId } = await params;
    const patch = patchSchema.parse(await request.json());
    return getStore().updateCalendar(calendarId, patch);
  });
}

/** Deletes a calendar (references fall back to the default calendar). */
export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { calendarId } = await params;
    await getStore().deleteCalendar(calendarId);
  });
}
