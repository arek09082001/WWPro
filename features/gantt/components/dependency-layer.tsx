'use client';

/**
 * Single SVG overlay drawing all dependency arrows as orthogonal elbow paths.
 * Hovering an arrow reveals it; right-click opens a small context menu to
 * change the type or delete the link.
 */

import { useState } from 'react';
import type { DepType, ScheduleResult } from '@/engine/types';
import type { DependencyRow } from '@/lib/store/types';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { TimeScale } from '../hooks/use-time-scale';

/** Props of {@link DependencyLayer}. */
interface DependencyLayerProps {
  dependencies: DependencyRow[];
  result: ScheduleResult;
  rowIndexById: Map<string, number>;
  scale: TimeScale;
  rowHeight: number;
  highlightTaskIds: Set<string> | null;
  onChangeType: (id: string, type: DepType) => void;
  onDelete: (id: string) => void;
}

const TYPE_LABELS: Record<DepType, string> = {
  FS: 'Ende–Anfang (EA)',
  SS: 'Anfang–Anfang (AA)',
  FF: 'Ende–Ende (EE)',
  SF: 'Anfang–Ende (AE)',
};

/** Builds the orthogonal path between two bar anchor points. */
function elbowPath(x1: number, y1: number, x2: number, y2: number, forward: boolean): string {
  const stub = 10;
  if (forward && x2 >= x1 + stub * 2) {
    const midX = x1 + stub;
    return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
  }
  // Backward route: go out, down half a row, back, then to target.
  const half = y2 > y1 ? y1 + (y2 - y1) / 2 : y1 - 14;
  return `M ${x1} ${y1} H ${x1 + stub} V ${half} H ${x2 - stub} V ${y2} H ${x2}`;
}

/**
 * Renders all dependency arrows above the bars.
 * @param props - DependencyLayerProps containing dependencies, schedule geometry and edit callbacks.
 * @returns A JSX element with one absolutely positioned SVG.
 */
export default function DependencyLayer({
  dependencies,
  result,
  rowIndexById,
  scale,
  rowHeight,
  highlightTaskIds,
  onChangeType,
  onDelete,
}: DependencyLayerProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const arrows = dependencies.flatMap((dep) => {
    const predIndex = rowIndexById.get(dep.predecessorId);
    const succIndex = rowIndexById.get(dep.successorId);
    const pred = result.tasks.get(dep.predecessorId);
    const succ = result.tasks.get(dep.successorId);
    if (predIndex === undefined || succIndex === undefined || !pred || !succ) return [];
    const predY = predIndex * rowHeight + rowHeight / 2;
    const succY = succIndex * rowHeight + rowHeight / 2;
    const fromX = dep.type === 'SS' || dep.type === 'SF' ? scale.xOfMoment(pred.start) : scale.xOfMoment(pred.end);
    const toX = dep.type === 'FF' || dep.type === 'SF' ? scale.xOfMoment(succ.end) : scale.xOfMoment(succ.start);
    const forward = dep.type === 'FS' || dep.type === 'SS';
    const highlighted =
      highlightTaskIds !== null &&
      highlightTaskIds.has(dep.predecessorId) &&
      highlightTaskIds.has(dep.successorId);
    return [{ dep, path: elbowPath(fromX, predY, toX, succY, forward), highlighted }];
  });

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0 z-[5]"
      width={scale.totalWidth}
      height={Math.max(1, rowIndexById.size * rowHeight)}
    >
      <defs>
        <marker id="dep-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 8 4 L 0 8 z" className="fill-muted-foreground" />
        </marker>
        <marker id="dep-arrow-hl" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 8 4 L 0 8 z" className="fill-primary" />
        </marker>
      </defs>
      {arrows.map(({ dep, path, highlighted }) => {
        const active = highlighted || hovered === dep.id;
        const dimmed = highlightTaskIds !== null && !highlighted;
        return (
          <ContextMenu key={dep.id}>
            <ContextMenuTrigger asChild>
              <g
                className="pointer-events-auto cursor-pointer"
                onMouseEnter={() => setHovered(dep.id)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Invisible wide hit area */}
                <path d={path} fill="none" stroke="transparent" strokeWidth={10} />
                <path
                  d={path}
                  fill="none"
                  strokeWidth={active ? 2 : 1.25}
                  markerEnd={active ? 'url(#dep-arrow-hl)' : 'url(#dep-arrow)'}
                  className={
                    active
                      ? 'stroke-primary'
                      : dimmed
                        ? 'stroke-muted-foreground/20'
                        : 'stroke-muted-foreground/70'
                  }
                />
              </g>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuLabel className="text-xs">{TYPE_LABELS[dep.type]}</ContextMenuLabel>
              <ContextMenuSeparator />
              {(Object.keys(TYPE_LABELS) as DepType[]).map((type) => (
                <ContextMenuItem
                  key={type}
                  disabled={type === dep.type}
                  onSelect={() => onChangeType(dep.id, type)}
                >
                  {TYPE_LABELS[type]}
                </ContextMenuItem>
              ))}
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive" onSelect={() => onDelete(dep.id)}>
                Abhängigkeit entfernen
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </svg>
  );
}
