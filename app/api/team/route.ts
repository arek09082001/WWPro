import { handleRoute } from '@/lib/api/route-helpers';
import { getStore } from '@/lib/store';

/** Returns all data needed for the cross-project team workload view. */
export async function GET() {
  return handleRoute(() => getStore().getTeamSnapshot());
}
