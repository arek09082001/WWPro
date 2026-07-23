'use client';

/**
 * Zustand store of the Gantt view: zoom, selection, collapsed summaries and
 * the transient drag state. Kept outside React context because drag/zoom
 * updates happen at pointer-move frequency.
 */

import { create } from 'zustand';
import type { PlanCategory, PlanStatus } from '@/lib/plan-meta';

/** Available zoom levels (pixel-per-day widths are defined in useTimeScale). */
export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter';

/** Row filter of the Gantt (empty arrays = no restriction). */
export interface GanttFilter {
  employeeIds: string[];
  categories: PlanCategory[];
  statuses: PlanStatus[];
  onlyCritical: boolean;
  onlyLate: boolean;
}

/** The neutral filter (shows everything). */
export const EMPTY_FILTER: GanttFilter = {
  employeeIds: [],
  categories: [],
  statuses: [],
  onlyCritical: false,
  onlyLate: false,
};

/** Number of active filter dimensions (for the toolbar badge). */
export function activeFilterCount(filter: GanttFilter): number {
  return (
    (filter.employeeIds.length > 0 ? 1 : 0) +
    (filter.categories.length > 0 ? 1 : 0) +
    (filter.statuses.length > 0 ? 1 : 0) +
    (filter.onlyCritical ? 1 : 0) +
    (filter.onlyLate ? 1 : 0)
  );
}

/** Transient state of an active bar drag. */
export interface DragState {
  kind: 'move' | 'resize';
  taskId: string;
  /** Pointer x at drag start (timeline coordinates). */
  originX: number;
  /** Current day delta (move) relative to the original position. */
  deltaDays: number;
  /** Target duration in working minutes (resize). */
  targetDurationMinutes?: number;
}

/** Transient state of a dependency link drag. */
export interface LinkDragState {
  sourceTaskId: string;
  toX: number;
  toY: number;
  targetTaskId?: string;
}

/** Transient state of a row reorder drag (kept separate from the date drag). */
export interface ReorderDragState {
  /** Id of the task being dragged. */
  taskId: string;
  /** Live insertion gap the pointer currently points at (row-boundary index). */
  boundary: number;
  /** Gap shown as an opened slot once the settle delay elapsed (null = none). */
  settledBoundary: number | null;
  /** Parent the task would get on drop (null = root). */
  targetParentId: string | null;
  /** Indentation depth of the placeholder at the settled slot. */
  targetDepth: number;
  /** True while the gap is a real move target (drives the live insertion line). */
  valid: boolean;
  /** True only when the gap lies inside the dragged subtree (drop forbidden). */
  blocked: boolean;
}

interface GanttState {
  zoom: ZoomLevel;
  selectedTaskId: string | null;
  collapsed: Set<string>;
  criticalVisible: boolean;
  filter: GanttFilter;
  drag: DragState | null;
  linkDrag: LinkDragState | null;
  reorderDrag: ReorderDragState | null;
  setZoom(zoom: ZoomLevel): void;
  select(taskId: string | null): void;
  toggleCollapsed(taskId: string): void;
  toggleCritical(): void;
  setFilter(patch: Partial<GanttFilter>): void;
  resetFilter(): void;
  setDrag(drag: DragState | null): void;
  setLinkDrag(drag: LinkDragState | null): void;
  setReorderDrag(drag: ReorderDragState | null): void;
}

/** Global store hook of the Gantt view. */
export const useGanttStore = create<GanttState>((set) => ({
  zoom: 'day',
  selectedTaskId: null,
  collapsed: new Set<string>(),
  criticalVisible: false,
  filter: EMPTY_FILTER,
  drag: null,
  linkDrag: null,
  reorderDrag: null,
  setZoom: (zoom) => set({ zoom }),
  setFilter: (patch) => set((state) => ({ filter: { ...state.filter, ...patch } })),
  resetFilter: () => set({ filter: EMPTY_FILTER }),
  select: (selectedTaskId) => set({ selectedTaskId }),
  toggleCollapsed: (taskId) =>
    set((state) => {
      const collapsed = new Set(state.collapsed);
      if (collapsed.has(taskId)) collapsed.delete(taskId);
      else collapsed.add(taskId);
      return { collapsed };
    }),
  toggleCritical: () => set((state) => ({ criticalVisible: !state.criticalVisible })),
  setDrag: (drag) => set({ drag }),
  setLinkDrag: (linkDrag) => set({ linkDrag }),
  setReorderDrag: (reorderDrag) => set({ reorderDrag }),
}));
