import { z } from 'zod';
import { handleRoute, newId } from '@/lib/api/route-helpers';
import { exceptionSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/store';

type Params = { params: Promise<{ calendarId: string }> };

const putSchema = z.object({ exceptions: z.array(exceptionSchema) });

/** Replaces all exceptions of a calendar (used by the editor and the holiday import). */
export async function PUT(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { calendarId } = await params;
    const body = putSchema.parse(await request.json());
    await getStore().setCalendarExceptions(
      calendarId,
      body.exceptions.map((e) => ({
        id: newId(),
        calendarId,
        date: e.date,
        name: e.name,
        working: e.working,
        intervals: e.intervals,
      })),
    );
  });
}
