import { describe, expect, it } from 'vitest';
import type { TaskRow } from '@/lib/store/types';
import { flattenTasks } from '../../hooks/use-schedule';
import { collectDescendants, resolveDrop } from '../reorder';

/** Builds a minimal task row (only the fields reorder logic cares about). */
function mk(id: string, parentId: string | null, sortKey: string): TaskRow {
  return {
    id,
    projectId: 'p',
    parentId,
    sortKey,
    name: id,
    taskType: 'fixed_units',
    schedulingMode: 'auto',
    isMilestone: false,
    constraintType: 'asap',
    constraintDate: null,
    startAt: null,
    endAt: null,
    durationMinutes: 480,
    workMinutes: 480,
    percentComplete: 0,
    notes: null,
    category: 'sonstiges',
    planNumber: null,
    status: 'in_bearbeitung',
    dueDate: null,
  };
}

/**
 * Sample tree (all expanded):
 *   0 T  (root)
 *   1 S  (root, summary)
 *   2   S1
 *   3   S2
 *   4 U  (root)
 */
function sampleTasks(): TaskRow[] {
  return [
    mk('t', null, 'a0'),
    mk('s', null, 'a1'),
    mk('s1', 's', 'a0'),
    mk('s2', 's', 'a1'),
    mk('u', null, 'a2'),
  ];
}

/** Applies a resolved drop to the dragged task and returns the new task list. */
function apply(tasks: TaskRow[], draggedId: string, parentId: string | null, sortKey: string): TaskRow[] {
  return tasks.map((t) => (t.id === draggedId ? { ...t, parentId, sortKey } : t));
}

/** Visible id order after flattening (all expanded). */
function order(tasks: TaskRow[]): string[] {
  return flattenTasks(tasks, new Set()).map((r) => r.task.id);
}

describe('collectDescendants', () => {
  it('collects the whole subtree, excluding the task itself', () => {
    const set = collectDescendants(sampleTasks(), 's');
    expect([...set].sort()).toEqual(['s1', 's2']);
  });

  it('returns an empty set for a leaf', () => {
    expect(collectDescendants(sampleTasks(), 't').size).toBe(0);
  });
});

describe('resolveDrop — reorder within the same parent', () => {
  it('moves a root task to the end of the list', () => {
    const tasks = sampleTasks();
    const rows = flattenTasks(tasks, new Set());
    const drop = resolveDrop({ rows, tasks, draggedId: 't', boundary: rows.length });
    expect(drop.valid).toBe(true);
    expect(drop.noop).toBe(false);
    expect(drop.targetParentId).toBe(null);
    expect(drop.newSortKey! > 'a2').toBe(true);
    expect(order(apply(tasks, 't', drop.targetParentId, drop.newSortKey!))).toEqual([
      's', 's1', 's2', 'u', 't',
    ]);
  });
});

describe('resolveDrop — pull a subtask out (raus)', () => {
  it('drops a child before a shallower root row → becomes a root sibling', () => {
    const tasks = sampleTasks();
    const rows = flattenTasks(tasks, new Set());
    // Gap 4 is between S2 (row 3) and U (row 4).
    const drop = resolveDrop({ rows, tasks, draggedId: 's1', boundary: 4 });
    expect(drop.valid).toBe(true);
    expect(drop.targetParentId).toBe(null);
    expect(drop.targetDepth).toBe(0);
    expect(order(apply(tasks, 's1', drop.targetParentId, drop.newSortKey!))).toEqual([
      't', 's', 's2', 's1', 'u',
    ]);
  });
});

describe('resolveDrop — nest into a section (rein)', () => {
  it('drops a root task among a section’s children → becomes its child', () => {
    const tasks = sampleTasks();
    const rows = flattenTasks(tasks, new Set());
    // Gap 3 is between S1 (row 2) and S2 (row 3).
    const drop = resolveDrop({ rows, tasks, draggedId: 'u', boundary: 3 });
    expect(drop.valid).toBe(true);
    expect(drop.targetParentId).toBe('s');
    expect(drop.targetDepth).toBe(1);
    expect(order(apply(tasks, 'u', drop.targetParentId, drop.newSortKey!))).toEqual([
      't', 's', 's1', 'u', 's2',
    ]);
  });
});

describe('resolveDrop — end of list lands at root', () => {
  it('appends the task at root level when dropped past the last row', () => {
    const tasks = sampleTasks();
    const rows = flattenTasks(tasks, new Set());
    const drop = resolveDrop({ rows, tasks, draggedId: 's1', boundary: rows.length });
    expect(drop.targetParentId).toBe(null);
    expect(order(apply(tasks, 's1', drop.targetParentId, drop.newSortKey!))).toEqual([
      't', 's', 's2', 'u', 's1',
    ]);
  });
});

describe('resolveDrop — invalid and no-op guards', () => {
  it('refuses a drop inside the dragged task’s own subtree', () => {
    const tasks = sampleTasks();
    const rows = flattenTasks(tasks, new Set());
    // Boundaries 2 and 3 fall inside S’s block (rows 1..3).
    expect(resolveDrop({ rows, tasks, draggedId: 's', boundary: 2 }).valid).toBe(false);
    expect(resolveDrop({ rows, tasks, draggedId: 's', boundary: 3 }).valid).toBe(false);
  });

  it('treats the current position as a no-op', () => {
    const tasks = sampleTasks();
    const rows = flattenTasks(tasks, new Set());
    // Directly above T and directly below T are both its current slot.
    expect(resolveDrop({ rows, tasks, draggedId: 't', boundary: 0 }).noop).toBe(true);
    expect(resolveDrop({ rows, tasks, draggedId: 't', boundary: 1 }).noop).toBe(true);
    // Directly below the whole S block is S’s current slot.
    expect(resolveDrop({ rows, tasks, draggedId: 's', boundary: 4 }).noop).toBe(true);
  });

  it('allows moving a whole summary (with its subtree) to the end', () => {
    const tasks = sampleTasks();
    const rows = flattenTasks(tasks, new Set());
    const drop = resolveDrop({ rows, tasks, draggedId: 's', boundary: rows.length });
    expect(drop.valid).toBe(true);
    expect(drop.noop).toBe(false);
    expect(order(apply(tasks, 's', drop.targetParentId, drop.newSortKey!))).toEqual([
      't', 'u', 's', 's1', 's2',
    ]);
  });
});

describe('resolveDrop — collapsed sibling neighbour keys', () => {
  it('uses the full sibling set even when a neighbour summary is collapsed', () => {
    // Root: A, B (summary, collapsed), C. B has a hidden child B1.
    const tasks = [
      mk('a', null, 'a0'),
      mk('b', null, 'a1'),
      mk('b1', 'b', 'a0'),
      mk('c', null, 'a2'),
    ];
    const collapsed = new Set(['b']);
    const rows = flattenTasks(tasks, collapsed); // [A, B, C] — B1 hidden
    // Drop C into the gap between A (row 0) and the collapsed B (row 1).
    const drop = resolveDrop({ rows, tasks, draggedId: 'c', boundary: 1 });
    expect(drop.valid).toBe(true);
    expect(drop.targetParentId).toBe(null);
    expect(drop.beforeSortKey).toBe('a0'); // A
    expect(drop.afterSortKey).toBe('a1'); // B
    const next = apply(tasks, 'c', drop.targetParentId, drop.newSortKey!);
    expect(flattenTasks(next, collapsed).map((r) => r.task.id)).toEqual(['a', 'c', 'b']);
    // B1 still belongs to B.
    expect(next.find((t) => t.id === 'b1')!.parentId).toBe('b');
  });
});
