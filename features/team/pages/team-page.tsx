'use client';

/**
 * Team workload page ("Team-Auslastung"): cross-project utilization heatmap
 * of all active employees. Runs the scheduling engine per project, merges the
 * workload and renders it as a navigable day/week grid with a team summary
 * row, expandable per-project sub-rows and a detail popover per cell.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Users } from 'lucide-react';
import { addDays } from '@/engine/date-utils';
import { formatIsoDate, formatIsoDateShort, formatWorkHours, todayIso } from '@/lib/format';
import { useTeamSnapshot } from '@/lib/queries/use-entities';
import type { EmployeeRow, ProjectRow } from '@/lib/store/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import WorkloadGrid, {
  type GridColumn,
  type GridModel,
  type Granularity,
  type HeaderGroup,
} from '../components/workload-grid';
import WorkloadCellPopover, { type CellSelection } from '../components/workload-cell-popover';
import {
  MONTH_LABELS,
  buildTeamWorkload,
  cellInfo,
  isoWeekNumber,
  mondayOf,
} from '../lib/workload';

/** Visible weeks per granularity. */
const WEEKS_SHOWN: Record<Granularity, number> = { day: 8, week: 26 };

/** Navigation step in days per granularity: [single arrow, double arrow]. */
const NAV_STEPS: Record<Granularity, [number, number]> = { day: [7, 28], week: [28, 84] };

/**
 * Renders the team workload heatmap with header controls, grid and popover.
 * @returns A JSX element containing the complete team workload page.
 */
export default function TeamPage() {
  const { data: team, isLoading } = useTeamSnapshot();
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [anchor, setAnchor] = useState(() => mondayOf(todayIso()));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selection, setSelection] = useState<CellSelection | null>(null);

  const workload = useMemo(() => (team ? buildTeamWorkload(team) : undefined), [team]);

  const activeEmployees = useMemo(
    () =>
      (team?.employees ?? [])
        .filter((employee) => employee.active)
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [team],
  );

  const rangeEnd = addDays(anchor, WEEKS_SHOWN[granularity] * 7 - 1);

  const model = useMemo<GridModel | null>(() => {
    if (!workload) return null;
    const today = todayIso();
    const columns: GridColumn[] = [];
    if (granularity === 'day') {
      const totalDays = WEEKS_SHOWN.day * 7;
      for (let i = 0; i < totalDays; i++) {
        const date = addDays(anchor, i);
        columns.push({ key: date, start: date, end: date, isToday: date === today });
      }
    } else {
      for (let i = 0; i < WEEKS_SHOWN.week; i++) {
        const start = addDays(anchor, i * 7);
        const end = addDays(start, 6);
        columns.push({ key: start, start, end, isToday: today >= start && today <= end });
      }
    }

    // Month groups over the column starts; short labels for narrow spans.
    const monthGroups: HeaderGroup[] = [];
    for (const column of columns) {
      const monthKey = column.start.slice(0, 7);
      const last = monthGroups[monthGroups.length - 1];
      if (last && last.key === monthKey) last.span += 1;
      else monthGroups.push({ key: monthKey, label: '', span: 1 });
    }
    const minSpan = granularity === 'day' ? 3 : 2;
    for (const group of monthGroups) {
      if (group.span < minSpan) continue;
      const month = Number(group.key.slice(5, 7)) - 1;
      group.label = `${MONTH_LABELS[month]} ${group.key.slice(0, 4)}`;
    }

    // Calendar-week groups (day mode only; anchor is a Monday → spans of 7).
    const weekGroups: HeaderGroup[] = [];
    if (granularity === 'day') {
      for (let i = 0; i < columns.length; i += 7) {
        const start = columns[i].start;
        weekGroups.push({ key: start, label: `KW ${isoWeekNumber(start)}`, span: 7 });
      }
    }

    const rows = activeEmployees.map((employee) => {
      const cells = columns.map((column) => cellInfo(workload, employee.id, column.start, column.end));
      const projectIds = new Set<string>();
      for (const cell of cells) {
        for (const projectId of cell.byProject.keys()) projectIds.add(projectId);
      }
      const projects: ProjectRow[] = [...projectIds]
        .map((id) => workload.projectsById.get(id))
        .filter((project): project is ProjectRow => Boolean(project))
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
      return {
        employee,
        weeklyLabel: `${formatWorkHours(workload.weeklyMinutes.get(employee.id) ?? 0)}/Woche`,
        cells,
        projects,
      };
    });

    const summary = columns.map((_, i) => {
      let assigned = 0;
      let capacity = 0;
      for (const row of rows) {
        assigned += row.cells[i].assignedMinutes;
        capacity += row.cells[i].capacityMinutes;
      }
      return { utilization: capacity > 0 ? assigned / capacity : 0, hasCapacity: capacity > 0 };
    });

    return { columns, monthGroups, weekGroups, rows, summary };
  }, [workload, anchor, granularity, activeEmployees]);

  function shiftRange(days: number) {
    setSelection(null);
    setAnchor((current) => addDays(current, days));
  }

  function toggleExpand(employeeId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  function handleCellClick(employee: EmployeeRow, cell: CellSelection['cell'], rect: DOMRect) {
    setSelection({
      employee,
      cell,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    });
  }

  const [stepSmall, stepLarge] = NAV_STEPS[granularity];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <div>
          <h1 className="font-heading text-xl font-semibold">Team-Auslastung</h1>
          <p className="text-sm text-muted-foreground">
            Wer arbeitet woran – Auslastung aller Mitarbeiter über alle Projekte
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={granularity}
            onValueChange={(value) => {
              if (value === 'day' || value === 'week') {
                setSelection(null);
                setGranularity(value);
              }
            }}
            aria-label="Zeitraster"
          >
            <ToggleGroupItem value="day" className="px-3 text-xs">
              Tage
            </ToggleGroupItem>
            <ToggleGroupItem value="week" className="px-3 text-xs">
              Wochen
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Weiter zurück"
              onClick={() => shiftRange(-stepLarge)}
            >
              <ChevronsLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Zurück"
              onClick={() => shiftRange(-stepSmall)}
            >
              <ChevronLeft />
            </Button>
            <span className="w-40 text-center text-sm tabular-nums">
              {formatIsoDateShort(anchor)} – {formatIsoDate(rangeEnd)}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Weiter"
              onClick={() => shiftRange(stepSmall)}
            >
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Weiter vor"
              onClick={() => shiftRange(stepLarge)}
            >
              <ChevronsRight />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelection(null);
              setAnchor(mondayOf(todayIso()));
            }}
          >
            Heute
          </Button>
        </div>
      </header>

      {isLoading && (
        <div className="flex-1 space-y-2 overflow-hidden p-6">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-8 flex-1" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && team && activeEmployees.length === 0 && (
        <div className="flex flex-1 items-center justify-center p-6">
          <Card className="flex max-w-md flex-col items-center gap-3 p-10 text-center">
            <Users className="size-8 text-muted-foreground" />
            <h2 className="font-semibold">Noch keine Mitarbeiter</h2>
            <p className="text-sm text-muted-foreground">
              Lege zuerst Mitarbeiter an, um die Team-Auslastung zu sehen.
            </p>
            <Button asChild>
              <Link href="/employees">Zu den Mitarbeitern</Link>
            </Button>
          </Card>
        </div>
      )}

      {!isLoading && workload && model && activeEmployees.length > 0 && (
        <WorkloadGrid
          model={model}
          granularity={granularity}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          onCellClick={handleCellClick}
          onScroll={() => setSelection(null)}
        />
      )}

      {workload && selection && (
        <WorkloadCellPopover
          workload={workload}
          selection={selection}
          onClose={() => setSelection(null)}
        />
      )}
    </div>
  );
}
