import { z } from 'zod';
import { handleRoute } from '@/lib/api/route-helpers';
import { getStore } from '@/lib/store';

const taskRowSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  parentId: z.string().nullable(),
  sortKey: z.string().min(1),
  name: z.string(),
  taskType: z.enum(['fixed_units', 'fixed_work', 'fixed_duration']),
  schedulingMode: z.enum(['auto', 'manual']),
  isMilestone: z.boolean(),
  constraintType: z.enum(['asap', 'start_no_earlier_than', 'must_start_on']),
  constraintDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  durationMinutes: z.number().int().min(0),
  workMinutes: z.number().int().min(0),
  percentComplete: z.number().int().min(0).max(100),
  notes: z.string().nullable(),
  category: z
    .enum(['positionsplan', 'schalplan', 'bewehrungsplan', 'berechnung', 'sonstiges'])
    .default('sonstiges'),
  planNumber: z.string().nullable().default(null),
  status: z.enum(['entwurf', 'in_bearbeitung', 'zur_pruefung', 'freigegeben']).default('in_bearbeitung'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

const batchSchema = z.object({
  projectId: z.string().min(1),
  upserts: z.array(taskRowSchema),
  deletes: z.array(z.string()),
});

/**
 * Batched task persistence: the client recomputes the schedule in memory and
 * sends all changed rows plus deletions in a single request.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const batch = batchSchema.parse(await request.json());
    await getStore().batchTasks(batch);
  });
}
