'use client';

/**
 * "Warum dieses Datum?" — renders the engine's structured schedule explanation
 * as German sentences. The binding driver is highlighted; dependency drivers
 * can jump to their predecessor task.
 */

import { ArrowRight, Info } from 'lucide-react';
import type { DepType, ScheduleExplanation, StartDriver } from '@/engine/types';
import { formatDuration, formatIsoDate, formatMoment } from '@/lib/format';
import { cn } from '@/lib/utils';

const DEP_LABELS: Record<DepType, string> = {
  FS: 'Ende–Anfang',
  SS: 'Anfang–Anfang',
  FF: 'Ende–Ende',
  SF: 'Anfang–Ende',
};

const SNAP_LABELS: Record<string, string> = {
  weekend: 'übers Wochenende verschoben',
  exception: 'wegen eines freien Tags verschoben',
  absence: 'wegen Abwesenheit verschoben',
  outsideHours: 'auf die nächste Arbeitszeit verschoben',
};

/** Renders one start driver as a German sentence. */
function driverText(driver: StartDriver, taskNames: Map<string, string>): string {
  switch (driver.kind) {
    case 'projectStart':
      return `Projektstart am ${formatIsoDate(driver.date)}`;
    case 'dependency': {
      const name = taskNames.get(driver.predecessorId) ?? 'Vorgänger';
      const lag =
        driver.lagMinutes !== 0
          ? ` ${driver.lagMinutes > 0 ? '+' : '−'} ${formatDuration(Math.abs(driver.lagMinutes))}`
          : '';
      return `Abhängigkeit „${name}“ (${DEP_LABELS[driver.type]}${lag})`;
    }
    case 'constraint':
      return driver.constraintType === 'must_start_on'
        ? `Einschränkung: Muss beginnen am ${formatIsoDate(driver.date)}`
        : `Einschränkung: Nicht früher als ${formatIsoDate(driver.date)}`;
    case 'calendarSnap': {
      const base = SNAP_LABELS[driver.reason] ?? 'verschoben';
      const name = driver.exceptionName ? ` („${driver.exceptionName}“)` : '';
      return `${base}${name}: ${formatMoment(driver.from)} → ${formatMoment(driver.to)}`;
    }
    case 'manual':
      return 'Manuell geplant';
  }
}

/** Props of {@link WhyExplanation}. */
interface WhyExplanationProps {
  explanation: ScheduleExplanation;
  taskNames: Map<string, string>;
  onJumpToTask?: (taskId: string) => void;
}

/**
 * Renders the full explanation block (start drivers, warnings).
 * @param props - WhyExplanationProps containing the explanation, a task-name lookup and an optional jump callback.
 * @param props.explanation - Structured explanation from the engine.
 * @param props.taskNames - Map of task id → display name for dependency drivers.
 * @param props.onJumpToTask - Invoked with the predecessor id when a dependency driver is clicked.
 * @returns A JSX element listing the reasons behind the computed start date.
 */
export default function WhyExplanation({ explanation, taskNames, onJumpToTask }: WhyExplanationProps) {
  const drivers = [...explanation.startDrivers].sort((a, b) => {
    const bindingOf = (d: StartDriver) => ('binding' in d && d.binding ? 0 : 1);
    return bindingOf(a) - bindingOf(b);
  });
  return (
    <div className="space-y-1.5 text-sm">
      <p className="flex items-center gap-1.5 font-medium">
        <Info className="size-3.5" /> Warum dieses Datum?
      </p>
      <ul className="space-y-1">
        {drivers.map((driver, index) => {
          const binding = 'binding' in driver && driver.binding;
          const clickable = driver.kind === 'dependency' && onJumpToTask;
          return (
            <li
              key={index}
              className={cn(
                'flex items-start gap-1.5',
                binding ? 'text-foreground' : 'text-muted-foreground',
                clickable && 'cursor-pointer hover:underline',
              )}
              onClick={
                clickable ? () => onJumpToTask(driver.predecessorId) : undefined
              }
            >
              {binding ? (
                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary" />
              ) : (
                <span className="mt-0.5 size-3.5 shrink-0 text-center leading-none">·</span>
              )}
              <span>
                {driverText(driver, taskNames)}
                {binding && (
                  <span className="ml-1 rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">
                    maßgeblich
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {explanation.warnings.length > 0 && (
        <div className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {explanation.warnings.map((warning, index) => (
            <p key={index}>
              {warning.code === 'CONSTRAINT_CONFLICT'
                ? 'Die Muss-Einschränkung verletzt eine Abhängigkeit.'
                : 'Keine Arbeitszeit im Kalender gefunden.'}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
