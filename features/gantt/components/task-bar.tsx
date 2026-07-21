'use client';

/**
 * A single Gantt bar: task bars with progress fill, summary brackets,
 * milestone diamonds, resize/link handles (hover-revealed), overallocation
 * badge and a rich hover card including the "Warum dieses Datum?" explanation.
 */

import { AlertTriangle } from 'lucide-react';
import type { ScheduledTask } from '@/engine/types';
import { formatDuration, formatMomentDate, formatUnits, formatWorkHours } from '@/lib/format';
import type { EmployeeRow, TaskRow } from '@/lib/store/types';
import { cn } from '@/lib/utils';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import WhyExplanation from './why-popover';

/** Props of {@link TaskBar}. */
interface TaskBarProps {
  task: TaskRow;
  scheduled: ScheduledTask;
  x: number;
  width: number;
  color: string;
  critical: boolean;
  criticalVisible: boolean;
  dimmed: boolean;
  chainHighlighted: boolean;
  overallocated: boolean;
  assignees: { employee: EmployeeRow; units: number }[];
  slackWidth: number;
  taskNames: Map<string, string>;
  onPointerDownBody: (e: React.PointerEvent) => void;
  onPointerDownResize: (e: React.PointerEvent) => void;
  onPointerDownLink: (e: React.PointerEvent) => void;
  onHoverChain: (taskId: string | null) => void;
  onJumpToTask: (taskId: string) => void;
  onOpen: () => void;
}

/**
 * Renders one bar (task, summary or milestone) inside its timeline row.
 * @param props - TaskBarProps containing geometry, schedule data and interaction callbacks.
 * @returns A JSX element with the positioned bar and its hover card.
 */
export default function TaskBar(props: TaskBarProps) {
  const {
    task, scheduled, x, width, color, critical, criticalVisible, dimmed, chainHighlighted,
    overallocated, assignees, slackWidth, taskNames,
    onPointerDownBody, onPointerDownResize, onPointerDownLink, onHoverChain, onJumpToTask, onOpen,
  } = props;

  const barColor = criticalVisible && critical ? '#dc2626' : color;

  const barBody = task.isMilestone ? (
    <div
      className={cn('absolute top-1/2 -translate-y-1/2 cursor-pointer', dimmed && 'opacity-25')}
      style={{ left: x - 7 }}
      onPointerDown={onPointerDownBody}
      onMouseEnter={() => onHoverChain(task.id)}
      onMouseLeave={() => onHoverChain(null)}
      onDoubleClick={onOpen}
    >
      <div
        className="size-3.5 rotate-45 rounded-[2px] shadow-sm"
        style={{ backgroundColor: barColor }}
      />
    </div>
  ) : scheduled.isSummary ? (
    <div
      className={cn('absolute top-[9px] h-[7px] cursor-pointer', dimmed && 'opacity-25')}
      style={{ left: x, width: Math.max(width, 4) }}
      onMouseEnter={() => onHoverChain(task.id)}
      onMouseLeave={() => onHoverChain(null)}
      onDoubleClick={onOpen}
    >
      <div
        className="h-full rounded-sm"
        style={{ backgroundColor: criticalVisible && critical ? '#dc2626' : 'var(--foreground)' }}
      />
      <div className="absolute -bottom-[4px] left-0 h-[8px] w-[3px]"
        style={{ backgroundColor: criticalVisible && critical ? '#dc2626' : 'var(--foreground)' }} />
      <div className="absolute -bottom-[4px] right-0 h-[8px] w-[3px]"
        style={{ backgroundColor: criticalVisible && critical ? '#dc2626' : 'var(--foreground)' }} />
    </div>
  ) : (
    <div
      className={cn(
        'group/bar absolute top-1/2 h-[18px] -translate-y-1/2 cursor-grab rounded-md shadow-sm transition-opacity',
        dimmed && 'opacity-25',
        chainHighlighted && 'ring-2 ring-primary/60 ring-offset-1',
      )}
      style={{ left: x, width: Math.max(width, 6), backgroundColor: barColor }}
      onPointerDown={onPointerDownBody}
      onMouseEnter={() => onHoverChain(task.id)}
      onMouseLeave={() => onHoverChain(null)}
      onDoubleClick={onOpen}
    >
      {/* Progress fill */}
      {task.percentComplete > 0 && (
        <div
          className="h-full rounded-l-md bg-black/25"
          style={{ width: `${task.percentComplete}%` }}
        />
      )}
      {overallocated && (
        <span className="absolute -top-1.5 -right-1.5 flex size-3.5 items-center justify-center rounded-full bg-destructive text-white shadow">
          <AlertTriangle className="size-2.5" />
        </span>
      )}
      {/* Resize handle (right edge) */}
      <div
        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md opacity-0 transition-opacity group-hover/bar:opacity-100"
        style={{ backgroundColor: 'rgba(255,255,255,0.35)' }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDownResize(e);
        }}
      />
      {/* Link handle (circle right of the bar) */}
      <button
        type="button"
        aria-label="Abhängigkeit ziehen"
        className="absolute top-1/2 -right-3.5 size-2.5 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-primary bg-background opacity-0 transition-opacity group-hover/bar:opacity-100"
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDownLink(e);
        }}
      />
    </div>
  );

  return (
    <>
      {/* Slack whisker (visible in critical-path mode for non-critical tasks) */}
      {criticalVisible && !critical && !scheduled.isSummary && slackWidth > 2 && (
        <div
          className="absolute top-1/2 h-0 -translate-y-1/2 border-t-2 border-dotted border-muted-foreground/50"
          style={{ left: x + width, width: slackWidth }}
          title={`Puffer: ${formatDuration(scheduled.totalSlackMinutes)}`}
        />
      )}
      <HoverCard openDelay={450} closeDelay={100}>
        <HoverCardTrigger asChild>{barBody}</HoverCardTrigger>
        <HoverCardContent side="top" align="start" className="w-80 space-y-2">
          <div>
            <p className="font-semibold leading-tight">{task.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatMomentDate(scheduled.start)} – {formatMomentDate(scheduled.end)}
              {' · '}
              {task.isMilestone ? 'Meilenstein' : formatDuration(scheduled.durationMinutes)}
              {!task.isMilestone && ` · ${formatWorkHours(scheduled.workMinutes)} Arbeit`}
              {task.percentComplete > 0 && ` · ${task.percentComplete} %`}
            </p>
          </div>
          {assignees.length > 0 && (
            <p className="text-xs">
              {assignees
                .map(({ employee, units }) => `${employee.name} (${formatUnits(units)})`)
                .join(', ')}
            </p>
          )}
          {criticalVisible && !scheduled.isSummary && (
            <p className="text-xs">
              {critical ? (
                <span className="font-medium text-destructive">Auf dem kritischen Pfad</span>
              ) : (
                <>Puffer: {formatDuration(scheduled.totalSlackMinutes)}</>
              )}
            </p>
          )}
          {overallocated && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="size-3" /> Zugewiesene Person ist in diesem Zeitraum überlastet
            </p>
          )}
          {!scheduled.isSummary && (
            <div className="border-t pt-2">
              <WhyExplanation
                explanation={scheduled.explanation}
                taskNames={taskNames}
                onJumpToTask={onJumpToTask}
              />
            </div>
          )}
        </HoverCardContent>
      </HoverCard>
    </>
  );
}
