'use client';

/**
 * A single Gantt bar: task bars with progress fill, plan-status styling,
 * summary brackets, milestone diamonds, resize/link handles (hover-revealed),
 * a due-date flag with late badge, an optional name label and a rich hover
 * card including the "Warum dieses Datum?" explanation.
 */

import { AlertTriangle, Check, Flag } from 'lucide-react';
import type { ScheduledTask } from '@/engine/types';
import { formatDuration, formatIsoDate, formatMomentDate, formatUnits, formatWorkHours } from '@/lib/format';
import { PLAN_CATEGORIES, PLAN_STATUSES } from '@/lib/plan-meta';
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
  /** x position of the due-date end-of-day boundary (undefined = no due date). */
  dueX?: number;
  /** Working days late vs. due date (0 = on time). */
  lateDays: number;
  /** Show the name label right of the bar (day/week zoom). */
  showLabel: boolean;
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
 * @returns A JSX element with the positioned bar, due marker and hover card.
 */
export default function TaskBar(props: TaskBarProps) {
  const {
    task, scheduled, x, width, color, critical, criticalVisible, dimmed, chainHighlighted,
    overallocated, assignees, slackWidth, taskNames, dueX, lateDays, showLabel,
    onPointerDownBody, onPointerDownResize, onPointerDownLink, onHoverChain, onJumpToTask, onOpen,
  } = props;

  const barColor = criticalVisible && critical ? '#dc2626' : color;
  const status = PLAN_STATUSES[task.status];
  const category = PLAN_CATEGORIES[task.category];
  const released = task.status === 'freigegeben';
  const draft = task.status === 'entwurf';
  const labelX = Math.max(x + width, dueX ?? 0) + 10;

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
        style={{ backgroundColor: lateDays > 0 ? '#dc2626' : barColor }}
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
        draft && 'opacity-70 [background-image:repeating-linear-gradient(135deg,rgba(255,255,255,0.25)_0_6px,transparent_6px_12px)]',
        chainHighlighted && 'ring-2 ring-primary/60 ring-offset-1',
      )}
      style={{ left: x, width: Math.max(width, 6), backgroundColor: barColor }}
      onPointerDown={onPointerDownBody}
      onMouseEnter={() => onHoverChain(task.id)}
      onMouseLeave={() => onHoverChain(null)}
      onDoubleClick={onOpen}
    >
      {task.percentComplete > 0 && (
        <div
          className="h-full rounded-l-md bg-black/25"
          style={{ width: `${task.percentComplete}%` }}
        />
      )}
      {released && width > 34 && (
        <span className="absolute top-1/2 left-1 flex size-3 -translate-y-1/2 items-center justify-center rounded-full bg-white/85">
          <Check className="size-2.5" style={{ color: barColor }} />
        </span>
      )}
      {task.status === 'zur_pruefung' && (
        <span
          className="absolute -top-[3px] right-1 left-1 h-[3px] rounded-full"
          style={{ backgroundColor: status.color }}
          title="Zur Prüfung"
        />
      )}
      {overallocated && (
        <span className="absolute -top-1.5 -right-1.5 flex size-3.5 items-center justify-center rounded-full bg-destructive text-white shadow">
          <AlertTriangle className="size-2.5" />
        </span>
      )}
      <div
        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md opacity-0 transition-opacity group-hover/bar:opacity-100"
        style={{ backgroundColor: 'rgba(255,255,255,0.35)' }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDownResize(e);
        }}
      />
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
      {/* Due-date flag */}
      {dueX !== undefined && task.dueDate && (
        <div
          className="pointer-events-none absolute top-0 bottom-0"
          style={{ left: dueX }}
          title={`Liefertermin ${formatIsoDate(task.dueDate)}`}
        >
          <div className={cn('h-full w-px', lateDays > 0 ? 'bg-red-500/70' : 'bg-slate-400/60')} />
          <Flag
            className={cn('absolute top-[3px] left-0 size-2.5', lateDays > 0 ? 'text-red-500' : 'text-slate-400')}
            fill="currentColor"
          />
        </div>
      )}
      {/* Late badge + name label right of the bar */}
      {(showLabel || lateDays > 0) && (
        <div
          className="pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5"
          style={{ left: labelX }}
        >
          {lateDays > 0 && !scheduled.isSummary && (
            <span className="rounded-full bg-red-600 px-1.5 py-px text-[9px] font-semibold text-white">
              +{lateDays.toLocaleString('de-DE')} T
            </span>
          )}
          {showLabel && (
            <span
              className={cn(
                'max-w-56 truncate text-[10px] text-muted-foreground',
                dimmed && 'opacity-25',
              )}
            >
              {task.name}
            </span>
          )}
        </div>
      )}
      <HoverCard openDelay={450} closeDelay={100}>
        <HoverCardTrigger asChild>{barBody}</HoverCardTrigger>
        <HoverCardContent side="top" align="start" className="w-80 space-y-2">
          <div>
            <p className="font-semibold leading-tight">
              {task.planNumber && (
                <span className="mr-1.5 rounded bg-muted px-1 font-mono text-[10px] font-normal text-muted-foreground">
                  {task.planNumber}
                </span>
              )}
              {task.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatMomentDate(scheduled.start)} – {formatMomentDate(scheduled.end)}
              {' · '}
              {task.isMilestone ? 'Meilenstein' : formatDuration(scheduled.durationMinutes)}
              {!task.isMilestone && ` · ${formatWorkHours(scheduled.workMinutes)} Arbeit`}
              {task.percentComplete > 0 && ` · ${task.percentComplete} %`}
            </p>
          </div>
          {!scheduled.isSummary && (
            <p className="flex items-center gap-1.5 text-xs">
              {task.category !== 'sonstiges' && (
                <span className="rounded px-1.5 py-px font-medium" style={{ backgroundColor: `${category.color}22`, color: category.color }}>
                  {category.label}
                </span>
              )}
              <span className={cn('rounded px-1.5 py-px font-medium', status.badgeClass)}>{status.label}</span>
            </p>
          )}
          {task.dueDate && (
            <p className={cn('text-xs', lateDays > 0 ? 'font-medium text-red-600' : 'text-muted-foreground')}>
              Liefertermin {formatIsoDate(task.dueDate)}
              {lateDays > 0
                ? ` — voraussichtlich ${lateDays.toLocaleString('de-DE')} Arbeitstage zu spät`
                : ' — im Plan'}
            </p>
          )}
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
