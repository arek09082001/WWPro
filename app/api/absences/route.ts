import { z } from 'zod';
import { handleRoute, newId } from '@/lib/api/route-helpers';
import { getStore } from '@/lib/store';

/** Lists all absences. */
export async function GET() {
  return handleRoute(() => getStore().listAbsences());
}

const createSchema = z
  .object({
    employeeId: z.string().min(1),
    type: z.enum(['vacation', 'sick', 'other']),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().nullish(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'Enddatum liegt vor dem Startdatum' });

/** Creates an absence. */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = createSchema.parse(await request.json());
    return getStore().createAbsence({
      id: newId(),
      employeeId: body.employeeId,
      type: body.type,
      startDate: body.startDate,
      endDate: body.endDate,
      note: body.note ?? null,
    });
  });
}
