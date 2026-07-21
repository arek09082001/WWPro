'use client';

/**
 * Zustand store of the Gantt view: zoom, selection, collapsed summaries and
 * the transient drag state. Kept outside React context because drag/zoom
 * updates happen at pointer-move frequency.
 */

import { create } from 'zustand';

/** Available zoom levels (pixel-per-day widths are defined in useTimeScale). */
export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter';

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

interface GanttState {
  zoom: ZoomLevel;
  selectedTaskId: string | null;
  collapsed: Set<string>;
  criticalVisible: boolean;
  drag: DragState | null;
  linkDrag: LinkDragState | null;
  setZoom(zoom: ZoomLevel): void;
  select(taskId: string | null): void;
  toggleCollapsed(taskId: string): void;
  toggleCritical(): void;
  setDrag(drag: DragState | null): void;
  setLinkDrag(drag: LinkDragState | null): void;
}

/** Global store hook of the Gantt view. */
export const useGanttStore = create<GanttState>((set) => ({
  zoom: 'day',
  selectedTaskId: null,
  collapsed: new Set<string>(),
  criticalVisible: false,
  drag: null,
  linkDrag: null,
  setZoom: (zoom) => set({ zoom }),
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
}));
