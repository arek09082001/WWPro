import { handleRoute } from '@/lib/api/route-helpers';
import { getStore } from '@/lib/store';

type Params = { params: Promise<{ absenceId: string }> };

/** Deletes an absence. */
export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { absenceId } = await params;
    await getStore().deleteAbsence(absenceId);
  });
}
