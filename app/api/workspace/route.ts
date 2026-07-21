import { z } from 'zod';
import { handleRoute } from '@/lib/api/route-helpers';
import { getStore } from '@/lib/store';

/** Returns the workspace settings. */
export async function GET() {
  return handleRoute(() => getStore().getWorkspace());
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  defaultCalendarId: z.string().min(1).optional(),
  bundesland: z
    .enum(['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'])
    .nullable()
    .optional(),
});

/** Updates workspace settings. */
export async function PATCH(request: Request) {
  return handleRoute(async () => {
    const patch = patchSchema.parse(await request.json());
    return getStore().updateWorkspace(patch);
  });
}
