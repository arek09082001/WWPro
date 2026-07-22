/**
 * Pure helpers for drag-and-drop row reordering in the Gantt.
 *
 * A drop only rewrites the dragged task's `parentId` + `sortKey`; its whole
 * subtree follows automatically because depth/order are recomputed from the
 * tree. The target parent and position are inferred purely from where the
 * pointer drops between rows ("aus Ablageposition"):
 *
 * - The task adopts the parent of the row *below* the insertion gap and is
 *   inserted right before it (dropping before a shallower row pulls the task
 *   out; dropping among a section's children nests it in).
 * - Dropping past the last row lands the task at root level.
 *
 * Kept free of React so both the live ghost preview and the commit reuse it.
 */

import { generateKeyBetween } from 'fractional-indexing';
import type { TaskRow } from '@/lib/store/types';
import type { GanttRow } from '../hooks/use-schedule';

/** Resolved outcome of dropping the dragged task at a given insertion gap. */
export interface DropTarget {
  /** Parent the dragged task would get (null = root/top-level). */
  targetParentId: string | null;
  /** Indentation depth the placeholder should render at. */
  targetDepth: number;
  /** sortKey of the sibling immediately before the insertion point. */
  beforeSortKey: string | null;
  /** sortKey of the sibling immediately after the insertion point. */
  afterSortKey: string | null;
  /** New key for the dragged task (null when the drop is invalid or a no-op). */
  newSortKey: string | null;
  /** False when the gap lies inside the dragged task's own subtree. */
  valid: boolean;
  /** True when the drop resolves to the task's current position. */
  noop: boolean;
}

/** The invalid/no-op result (nothing to show, nothing to commit). */
const NO_DROP: DropTarget = {
  targetParentId: null,
  targetDepth: 0,
  beforeSortKey: null,
  afterSortKey: null,
  newSortKey: null,
  valid: false,
  noop: false,
};

/** Lexicographic sortKey comparison (matches flattenTasks/engine ordering). */
function bySortKey(a: TaskRow, b: TaskRow): number {
  return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0;
}

/**
 * Collects all descendant ids of a task (excluding the task itself).
 * @param tasks - All task rows of the project.
 * @param id - The root task whose subtree is collected.
 * @returns A set of descendant task ids.
 */
export function collectDescendants(tasks: TaskRow[], id: string): Set<string> {
  const childrenOf = new Map<string | null, string[]>();
  for (const task of tasks) {
    const list = childrenOf.get(task.parentId) ?? [];
    list.push(task.id);
    childrenOf.set(task.parentId, list);
  }
  const out = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const child of childrenOf.get(current) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        stack.push(child);
      }
    }
  }
  return out;
}

/** Arguments of {@link resolveDrop}. */
export interface ResolveDropArgs {
  /** The flattened, visible rows in display order. */
  rows: GanttRow[];
  /** All task rows (needed for siblings hidden inside collapsed summaries). */
  tasks: TaskRow[];
  /** The task being dragged. */
  draggedId: string;
  /** Insertion gap index in `[0, rows.length]` (0 = above the first row). */
  boundary: number;
}

/**
 * Resolves where a dragged task would land for a given insertion gap.
 * @param args - {@link ResolveDropArgs}.
 * @returns The {@link DropTarget}; `valid=false` when the gap is inside the
 * dragged subtree, `noop=true` when it resolves to the current position.
 */
export function resolveDrop({ rows, tasks, draggedId, boundary }: ResolveDropArgs): DropTarget {
  const startIdx = rows.findIndex((r) => r.task.id === draggedId);
  if (startIdx === -1) return NO_DROP;
  const draggedTask = tasks.find((t) => t.id === draggedId);
  if (!draggedTask) return NO_DROP;

  const subtree = collectDescendants(tasks, draggedId);
  subtree.add(draggedId);

  // Visible extent of the dragged block (contiguous in DFS order).
  let endIdx = startIdx;
  while (rows[endIdx + 1] && subtree.has(rows[endIdx + 1].task.id)) endIdx += 1;

  const b = Math.max(0, Math.min(rows.length, boundary));

  // Strictly inside the dragged block → cannot drop there.
  if (b > startIdx && b < endIdx + 1) return { ...NO_DROP, valid: false };
  // Directly above the block or directly below it → current position.
  if (b === startIdx || b === endIdx + 1) return { ...NO_DROP, valid: true, noop: true };

  const below = rows[b];
  const targetParentId = below ? below.task.parentId : null;
  const targetDepth = below ? below.depth : 0;

  // Siblings of the target parent, in order, excluding the moving subtree.
  const siblings = tasks
    .filter((t) => t.parentId === targetParentId && !subtree.has(t.id))
    .sort(bySortKey);

  let beforeSortKey: string | null;
  let afterSortKey: string | null;
  if (below) {
    const idx = siblings.findIndex((s) => s.id === below.task.id);
    afterSortKey = siblings[idx]?.sortKey ?? null;
    beforeSortKey = siblings[idx - 1]?.sortKey ?? null;
  } else {
    // End of list → append at root level.
    beforeSortKey = siblings[siblings.length - 1]?.sortKey ?? null;
    afterSortKey = null;
  }

  const newSortKey = generateKeyBetween(beforeSortKey, afterSortKey);
  return {
    targetParentId,
    targetDepth,
    beforeSortKey,
    afterSortKey,
    newSortKey,
    valid: true,
    noop: false,
  };
}
