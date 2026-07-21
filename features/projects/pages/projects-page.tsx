'use client';

/**
 * Project dashboard: one card per project with progress ring, computed end
 * date, team avatars, overallocation warnings and a hover card showing the
 * next milestones. Card click opens the Gantt.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Plus } from 'lucide-react';
import { computeSchedule } from '@/engine/schedule';
import { buildScheduleInput } from '@/lib/mappers';
import { formatIsoDate, formatMomentDate, todayIso } from '@/lib/format';
import type { ProjectRow, ProjectSnapshot } from '@/lib/store/types';
import { useDeleteProject, useTeamSnapshot } from '@/lib/queries/use-entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import CreateProjectDialog from '../components/create-project-dialog';
import EmployeeAvatars from '../components/employee-avatars';

const STATUS_LABELS: Record<ProjectRow['status'], string> = {
  active: 'Aktiv',
  on_hold: 'Pausiert',
  done: 'Abgeschlossen',
  archived: 'Archiviert',
};

/** Small SVG progress ring. */
function ProgressRing({ percent }: { percent: number }) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
      <circle cx="22" cy="22" r={radius} fill="none" strokeWidth="4" className="stroke-muted" />
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        className="stroke-primary transition-all"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - percent / 100)}
        transform="rotate(-90 22 22)"
      />
      <text x="22" y="26" textAnchor="middle" className="fill-foreground text-[10px] font-semibold">
        {Math.round(percent)}%
      </text>
    </svg>
  );
}

/**
 * Renders the project dashboard with computed schedule information per project.
 * @returns A JSX element containing the project card grid.
 */
export default function ProjectsPage() {
  const { data: team, isLoading } = useTeamSnapshot();
  const [createOpen, setCreateOpen] = useState(false);
  const deleteProject = useDeleteProject();

  const projectInfos = useMemo(() => {
    if (!team) return [];
    return team.projects.map((project) => {
      const tasks = team.tasks.filter((t) => t.projectId === project.id);
      const taskIds = new Set(tasks.map((t) => t.id));
      const snapshot: ProjectSnapshot = {
        workspace: team.workspace,
        project,
        tasks,
        dependencies: team.dependencies.filter((d) => d.projectId === project.id),
        assignments: team.assignments.filter((a) => taskIds.has(a.taskId)),
        employees: team.employees,
        absences: team.absences,
        calendars: team.calendars,
        exceptions: team.exceptions,
      };
      const result = computeSchedule(buildScheduleInput(snapshot));
      let work = 0;
      let done = 0;
      const milestones: { name: string; date: string }[] = [];
      for (const task of tasks) {
        const scheduled = result.tasks.get(task.id);
        if (!scheduled || scheduled.isSummary) continue;
        work += scheduled.workMinutes;
        done += (scheduled.workMinutes * task.percentComplete) / 100;
        if (task.isMilestone && task.percentComplete < 100) {
          milestones.push({ name: task.name, date: formatMomentDate(scheduled.start) });
        }
      }
      const employeeIds = new Set(snapshot.assignments.map((a) => a.employeeId));
      const overallocatedDays = new Set(
        result.overallocations.map((o) => `${o.employeeId}|${o.date}`),
      ).size;
      return {
        project,
        taskCount: tasks.length,
        percent: work > 0 ? (done / work) * 100 : 0,
        end: result.projectEnd,
        milestones: milestones.slice(0, 3),
        employees: team.employees.filter((e) => employeeIds.has(e.id)),
        overallocatedDays,
      };
    });
  }, [team]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Projekte</h1>
          <p className="text-sm text-muted-foreground">
            Alle Projekte mit berechnetem Endtermin und Auslastung
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> Neues Projekt
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        {isLoading &&
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        {projectInfos.map(({ project, taskCount, percent, end, milestones, employees, overallocatedDays }) => (
          <ContextMenu key={project.id}>
            <ContextMenuTrigger asChild>
              <Link href={`/projects/${project.id}/gantt`} className="group">
                <Card className="h-full gap-3 p-5 transition-shadow group-hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <ProgressRing percent={percent} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: project.color }}
                          />
                          <h2 className="font-semibold leading-tight">{project.name}</h2>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {project.code ? `${project.code} · ` : ''}
                          {taskCount} Aufgaben · {STATUS_LABELS[project.status]}
                        </p>
                      </div>
                    </div>
                    {overallocatedDays > 0 && (
                      <HoverCard openDelay={200}>
                        <HoverCardTrigger asChild>
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="size-3" /> {overallocatedDays}
                          </Badge>
                        </HoverCardTrigger>
                        <HoverCardContent side="bottom" className="w-64 text-sm">
                          {overallocatedDays} Personentage mit Überlastung — Details in der
                          Team-Auslastung.
                        </HoverCardContent>
                      </HoverCard>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <CalendarDays className="size-4" />
                      {formatIsoDate(project.startDate)} – {formatMomentDate(end)}
                    </span>
                    <EmployeeAvatars employees={employees} />
                  </div>

                  {milestones.length > 0 && (
                    <div className="border-t pt-2 text-xs text-muted-foreground">
                      {milestones.map((m) => (
                        <div key={m.name} className="flex justify-between gap-2">
                          <span className="truncate">◆ {m.name}</span>
                          <span className="shrink-0 tabular-nums">{m.date}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </Link>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                variant="destructive"
                onSelect={() => {
                  if (window.confirm(`Projekt „${project.name}“ wirklich löschen?`)) {
                    deleteProject.mutate(project.id);
                  }
                }}
              >
                Projekt löschen
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
        {!isLoading && projectInfos.length === 0 && (
          <Card className="col-span-full flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-muted-foreground">Noch keine Projekte vorhanden.</p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Erstes Projekt anlegen
            </Button>
          </Card>
        )}
      </div>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} defaultStart={todayIso()} />
    </div>
  );
}
