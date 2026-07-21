/**
 * Shared absence metadata for the employee views: German labels, badge
 * styling per absence type and the "active" predicate used by counters.
 */

import type { AbsenceType } from '@/engine/types';
import type { AbsenceRow } from '@/lib/store/types';

/** German label and badge classes per absence type (Urlaub/Krank/Sonstiges). */
export const ABSENCE_TYPES: Record<AbsenceType, { label: string; badgeClass: string }> = {
  vacation: {
    label: 'Urlaub',
    badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  },
  sick: {
    label: 'Krank',
    badgeClass: 'bg-red-500/15 text-red-700 dark:text-red-400',
  },
  other: {
    label: 'Sonstiges',
    badgeClass: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  },
};

/** True when an absence is still relevant (ongoing or upcoming) on the given day. */
export function isActiveAbsence(absence: AbsenceRow, today: string): boolean {
  return absence.endDate >= today;
}
