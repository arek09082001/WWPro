'use client';

/**
 * Planlieferungsliste of a project: every plan with number, category, status
 * (inline editable), responsible employees, agreed delivery date (Soll),
 * computed end (Ist) and delay — plus delivery milestones, status filter
 * chips and a German-Excel-friendly CSV export.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Diamond, Download } from 'lucide-react';
import { compileCalendar } from '@/engine/calendar';
import { computeSchedule } from '@/engine/schedule';
import { buildScheduleInput } from '@/lib/mappers';
import { formatIsoDate, formatMomentDate } from '@/lib/format';
import {
  PLAN_CATEGORIES,
  PLAN_STATUSES,
  PLAN_STATUS_ORDER,
  type PlanStatus,
} from '@/lib/plan-meta';
import { useProjectMutations, useProjectSnapshot } from '@/lib/queries/use-project';
import { lateWorkingDays } from '@/features/gantt/hooks/use-schedule';
import EmployeeAvatars from '@/features/projects/components/employee-avatars';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * Renders the plan delivery list for a project.
 * @param props - Contains the project id from the route.
 * @param props.projectId - Id of the project.
 * @returns A JSX element with the full plan list view.
 */
export default function PlansPage({ projectId }: { projectId: string }) {
  const { data: snapshot, isLoading } = useProjectSnapshot(projectId);
  const mutations = useProjectMutations(projectId);
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<PlanStatus | null>(null);
  const [showAll, setShowAll] = useState(false);

  const model = useMemo(() => {
    if (!snapshot) return null;
    const input = buildScheduleInput(snapshot);
    const result = computeSchedule(input);
    const calendar = compileCalendar(input.projectCalendar);
    const summaryIds = new Set(snapshot.tasks.map((t) => t.parentId).filter(Boolean) as string[]);
    const employeesById = new Map(snapshot.employees.map((e) => [e.id, e]));
    const rows = snapshot.tasks
      .filter((t) => !summaryIds.has(t.id) && !t.isMilestone)
      .filter((t) => showAll || t.category !== 'sonstiges' || t.planNumber)
      .map((task) => {
        const scheduled = result.tasks.get(task.id);
        const assignees = snapshot.assignments
          .filter((a) => a.taskId === task.id)
          .map((a) => employeesById.get(a.employeeId))
          .filter((e): e is NonNullable<typeof e> => Boolean(e));
        return {
          task,
          scheduled,
          assignees,
          lateDays: lateWorkingDays(task, scheduled?.end, calendar),
        };
      })
      .sort((a, b) =>
        (a.task.planNumber ?? '￿').localeCompare(b.task.planNumber ?? '￿', 'de', { numeric: true }) ||
        a.task.sortKey.localeCompare(b.task.sortKey),
      );
    const milestones = snapshot.tasks
      .filter((t) => t.isMilestone)
      .map((task) => ({
        task,
        scheduled: result.tasks.get(task.id),
        lateDays: lateWorkingDays(task, result.tasks.get(task.id)?.end, calendar),
      }));
    return { rows, milestones };
  }, [snapshot, showAll]);

  if (isLoading || !snapshot || !model) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[50vh] w-full" />
      </div>
    );
  }

  const filtered = statusFilter ? model.rows.filter((r) => r.task.status === statusFilter) : model.rows;
  const lateCount = model.rows.filter((r) => r.lateDays > 0).length;

  function exportCsv() {
    if (!model || !snapshot) return;
    const header = 'Plannr;Plan;Art;Status;Verantwortlich;Soll;Berechnet;VerzugTage';
    const lines = model.rows.map(({ task, scheduled, assignees, lateDays }) =>
      [
        task.planNumber ?? '',
        task.name,
        PLAN_CATEGORIES[task.category].label,
        PLAN_STATUSES[task.status].label,
        assignees.map((a) => a.name).join(', '),
        task.dueDate ? formatIsoDate(task.dueDate) : '',
        scheduled ? formatMomentDate(scheduled.end) : '',
        lateDays > 0 ? String(lateDays).replace('.', ',') : '0',
      ]
        .map((v) => `"${v.replaceAll('"', '""')}"`)
        .join(';'),
    );
    const blob = new Blob(['﻿' + [header, ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planliste-${snapshot.project.code ?? snapshot.project.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Planliste exportiert');
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Zurück zum Gantt">
          <Link href={`/projects/${projectId}/gantt`}><ArrowLeft /></Link>
        </Button>
        <span className="size-2.5 rounded-full" style={{ backgroundColor: snapshot.project.color }} />
        <h1 className="truncate font-semibold">{snapshot.project.name}</h1>
        <span className="text-sm text-muted-foreground">· Planlieferungsliste</span>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Alle Aufgaben
            <Switch checked={showAll} onCheckedChange={setShowAll} />
          </label>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download /> CSV exportieren
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        {PLAN_STATUS_ORDER.map((status) => {
          const count = model.rows.filter((r) => r.task.status === status).length;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(statusFilter === status ? null : status)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                statusFilter === status ? 'border-transparent ring-2 ring-ring' : 'hover:bg-accent',
                PLAN_STATUSES[status].badgeClass,
              )}
            >
              {PLAN_STATUSES[status].label}
              <strong className="tabular-nums">{count}</strong>
            </button>
          );
        })}
        <span
          className={cn(
            'ml-auto rounded-full px-2.5 py-1 text-xs font-medium',
            lateCount > 0 ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'text-muted-foreground',
          )}
        >
          {lateCount > 0 ? `${lateCount} verspätet` : 'Alle Liefertermine im Plan'}
        </span>
      </div>

      {model.milestones.length > 0 && (
        <div className="flex flex-wrap gap-3 border-b px-4 py-3">
          {model.milestones.map(({ task, scheduled, lateDays }) => (
            <button
              key={task.id}
              type="button"
              onClick={() => router.push(`/projects/${projectId}/gantt?task=${task.id}`)}
              className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-xs hover:bg-accent"
            >
              <Diamond className={cn('size-3 fill-current', lateDays > 0 ? 'text-red-500' : 'text-foreground')} />
              <span className="font-medium">{task.name}</span>
              <span className="text-muted-foreground">
                {task.dueDate && `Soll ${formatIsoDate(task.dueDate)} · `}
                {scheduled && `Berechnet ${formatMomentDate(scheduled.end)}`}
              </span>
              {lateDays > 0 && (
                <Badge variant="destructive" className="px-1.5 text-[10px]">+{lateDays.toLocaleString('de-DE')} T</Badge>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Plannr.</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="w-40">Art</TableHead>
              <TableHead className="w-44">Status</TableHead>
              <TableHead className="w-28">Team</TableHead>
              <TableHead className="w-32">Soll</TableHead>
              <TableHead className="w-28">Berechnet</TableHead>
              <TableHead className="w-28 text-right">Verzug</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(({ task, scheduled, assignees, lateDays }) => {
              const category = PLAN_CATEGORIES[task.category];
              const CategoryIcon = category.icon;
              return (
                <TableRow
                  key={task.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/projects/${projectId}/gantt?task=${task.id}`)}
                >
                  <TableCell className="font-mono text-xs">{task.planNumber ?? '–'}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <CategoryIcon className="size-3.5 shrink-0" style={{ color: category.color }} />
                      {task.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className="rounded px-1.5 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: `${category.color}1f`, color: category.color }}
                    >
                      {category.label}
                    </span>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={task.status}
                      onValueChange={(value) => {
                        void mutations.upsertTasks([{ ...task, status: value as PlanStatus }]);
                        toast.success(`${task.planNumber ?? task.name}: ${PLAN_STATUSES[value as PlanStatus].label}`);
                      }}
                    >
                      <SelectTrigger size="sm" className="h-7 w-40 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLAN_STATUS_ORDER.map((status) => (
                          <SelectItem key={status} value={status}>
                            <span className="flex items-center gap-2">
                              <span className="size-2 rounded-full" style={{ backgroundColor: PLAN_STATUSES[status].color }} />
                              {PLAN_STATUSES[status].label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <EmployeeAvatars employees={assignees} />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="date"
                      value={task.dueDate ?? ''}
                      onChange={(e) =>
                        void mutations.upsertTasks([{ ...task, dueDate: e.target.value || null }])
                      }
                      className="h-7 rounded border bg-transparent px-1 text-xs tabular-nums"
                    />
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {scheduled ? formatMomentDate(scheduled.end) : '–'}
                  </TableCell>
                  <TableCell className="text-right">
                    {task.dueDate ? (
                      lateDays > 0 ? (
                        <Badge variant="destructive" className="px-1.5 text-[10px]">
                          +{lateDays.toLocaleString('de-DE')} T
                        </Badge>
                      ) : (
                        <span className="text-xs font-medium text-emerald-600">pünktlich</span>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">–</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  Keine Pläne — weise Aufgaben im Gantt eine Planart zu oder{' '}
                  <Link href={`/projects/${projectId}/gantt`} className="underline">
                    öffne das Gantt
                  </Link>
                  .
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
