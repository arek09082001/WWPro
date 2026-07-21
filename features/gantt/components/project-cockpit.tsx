'use client';

/**
 * Compact project cockpit strip between toolbar and timeline: computed end
 * date, late-plan warnings with drilldown, plan status distribution and the
 * next upcoming deliveries — each segment expands details in a popover.
 */

import { useMemo } from 'react';
import { AlertTriangle, CalendarCheck, ChevronRight, Flag } from 'lucide-react';
import type { ScheduleResult } from '@/engine/types';
import type { CompiledCalendar } from '@/engine/calendar';
import { daysBetween } from '@/engine/date-utils';
import { formatIsoDate, formatMomentDate, todayIso } from '@/lib/format';
import { PLAN_STATUSES, PLAN_STATUS_ORDER, type PlanStatus } from '@/lib/plan-meta';
import type { ProjectSnapshot } from '@/lib/store/types';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { lateWorkingDays } from '../hooks/use-schedule';

/** Props of {@link ProjectCockpit}. */
interface ProjectCockpitProps {
  snapshot: ProjectSnapshot;
  result: ScheduleResult;
  projectCalendar: CompiledCalendar;
  onJumpToTask: (taskId: string) => void;
}

/**
 * Renders the cockpit strip with end date, delays, status distribution and next deliveries.
 * @param props - ProjectCockpitProps with snapshot, schedule result, calendar and jump callback.
 * @returns A JSX element with the one-line project overview.
 */
export default function ProjectCockpit({ snapshot, result, projectCalendar, onJumpToTask }: ProjectCockpitProps) {
  const summaryIds = useMemo(
    () => new Set(snapshot.tasks.map((t) => t.parentId).filter(Boolean) as string[]),
    [snapshot.tasks],
  );

  const info = useMemo(() => {
    const late: { id: string; label: string; days: number }[] = [];
    const statusCounts = new Map<PlanStatus, number>();
    let planCount = 0;
    const upcoming: { id: string; label: string; due: string; inDays: number }[] = [];
    const today = todayIso();
    for (const task of snapshot.tasks) {
      if (summaryIds.has(task.id)) continue;
      const scheduled = result.tasks.get(task.id);
      const days = lateWorkingDays(task, scheduled?.end, projectCalendar);
      const label = task.planNumber ? `${task.planNumber} ${task.name}` : task.name;
      if (days > 0) late.push({ id: task.id, label, days });
      if (!task.isMilestone && (task.category !== 'sonstiges' || task.planNumber)) {
        planCount += 1;
        statusCounts.set(task.status, (statusCounts.get(task.status) ?? 0) + 1);
      }
      if (task.dueDate && task.dueDate >= today && task.status !== 'freigegeben') {
        upcoming.push({ id: task.id, label, due: task.dueDate, inDays: daysBetween(today, task.dueDate) });
      }
    }
    late.sort((a, b) => b.days - a.days);
    upcoming.sort((a, b) => a.due.localeCompare(b.due));
    return { late, statusCounts, planCount, upcoming: upcoming.slice(0, 4) };
  }, [snapshot.tasks, summaryIds, result, projectCalendar]);

  const released = info.statusCounts.get('freigegeben') ?? 0;

  return (
    <div className="flex h-9 items-center gap-4 overflow-x-auto border-b bg-muted/30 px-4 text-xs whitespace-nowrap">
      <span className="flex items-center gap-1.5">
        <CalendarCheck className="size-3.5 text-muted-foreground" />
        Projektende <strong className="tabular-nums">{formatMomentDate(result.projectEnd)}</strong>
      </span>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2 py-0.5 transition-colors',
              info.late.length > 0
                ? 'bg-red-100 font-medium text-red-700 hover:bg-red-200 dark:bg-red-950 dark:text-red-300'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <AlertTriangle className="size-3.5" />
            {info.late.length > 0 ? `${info.late.length} verspätet` : 'Alle Termine im Plan'}
            {info.late.length > 0 && <ChevronRight className="size-3" />}
          </button>
        </PopoverTrigger>
        {info.late.length > 0 && (
          <PopoverContent align="start" className="w-80 p-2">
            <p className="px-2 pt-1 pb-2 text-xs font-medium">Liefertermin-Überschreitungen</p>
            {info.late.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onJumpToTask(item.id)}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
              >
                <span className="truncate">{item.label}</span>
                <span className="shrink-0 rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">
                  +{item.days.toLocaleString('de-DE')} T
                </span>
              </button>
            ))}
          </PopoverContent>
        )}
      </Popover>

      {info.planCount > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="flex items-center gap-2 rounded-full px-2 py-0.5 hover:bg-accent">
              <span className="text-muted-foreground">
                Pläne <strong className="text-foreground">{released}/{info.planCount}</strong> freigegeben
              </span>
              <span className="flex h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                {PLAN_STATUS_ORDER.map((status) => {
                  const count = info.statusCounts.get(status) ?? 0;
                  if (count === 0) return null;
                  return (
                    <span
                      key={status}
                      style={{
                        width: `${(count / info.planCount) * 100}%`,
                        backgroundColor: PLAN_STATUSES[status].color,
                      }}
                    />
                  );
                })}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-2">
            {PLAN_STATUS_ORDER.map((status) => (
              <div key={status} className="flex items-center justify-between px-2 py-1 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: PLAN_STATUSES[status].color }} />
                  {PLAN_STATUSES[status].label}
                </span>
                <span className="font-medium tabular-nums">{info.statusCounts.get(status) ?? 0}</span>
              </div>
            ))}
          </PopoverContent>
        </Popover>
      )}

      {info.upcoming.length > 0 && (
        <span className="flex items-center gap-2 text-muted-foreground">
          <Flag className="size-3.5" />
          Nächste Lieferung:
          {info.upcoming.slice(0, 2).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onJumpToTask(item.id)}
              className="rounded bg-background px-1.5 py-0.5 hover:bg-accent"
              title={`Liefertermin ${formatIsoDate(item.due)}`}
            >
              <span className="font-medium text-foreground">{item.label.split(' ')[0]}</span>{' '}
              {item.inDays === 0 ? 'heute' : `in ${item.inDays} T`}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
