'use client';

/**
 * URL-addressable task detail slide-over (?task=<id>): general fields,
 * dependencies with inline add via task search, assignments with units and
 * the schedule explanation. Every change reschedules live.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { applyTaskEdit, type TaskEdit } from '@/engine/recalc';
import { prepareGraph } from '@/engine/schedule';
import type { DepType, TaskInput } from '@/engine/types';
import { buildScheduleInput } from '@/lib/mappers';
import { computeSchedule } from '@/engine/schedule';
import { formatDuration, formatMoment, formatWorkHours, parseDurationInput } from '@/lib/format';
import {
  PLAN_CATEGORIES,
  PLAN_CATEGORY_ORDER,
  PLAN_STATUSES,
  PLAN_STATUS_ORDER,
  type PlanCategory,
  type PlanStatus,
} from '@/lib/plan-meta';
import { useProjectMutations } from '@/lib/queries/use-project';
import type { ProjectSnapshot, TaskRow } from '@/lib/store/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import WhyExplanation from '@/features/gantt/components/why-popover';

const DEP_LABELS: Record<DepType, string> = {
  FS: 'Ende–Anfang (EA)',
  SS: 'Anfang–Anfang (AA)',
  FF: 'Ende–Ende (EE)',
  SF: 'Anfang–Ende (AE)',
};

const TYPE_INFO: Record<TaskRow['taskType'], { label: string; hint: string }> = {
  fixed_units: {
    label: 'Feste Zuweisung',
    hint: 'Mehr Arbeit verlängert die Dauer; mehr Personen verkürzen sie.',
  },
  fixed_work: {
    label: 'Feste Arbeit',
    hint: 'Der Aufwand bleibt konstant — Dauer und Auslastung gleichen sich aus.',
  },
  fixed_duration: {
    label: 'Feste Dauer',
    hint: 'Die Dauer bleibt konstant — Arbeit und Auslastung gleichen sich aus.',
  },
};

/** Converts a task row to the engine input shape for recalc edits. */
function toTaskInput(row: TaskRow): TaskInput {
  return {
    id: row.id, parentId: row.parentId, orderKey: row.sortKey, name: row.name,
    taskType: row.taskType, isMilestone: row.isMilestone, schedulingMode: row.schedulingMode,
    constraintType: row.constraintType, constraintDate: row.constraintDate,
    durationMinutes: row.durationMinutes, workMinutes: row.workMinutes,
    percentComplete: row.percentComplete,
  };
}

/** Props of {@link TaskDetailSheet}. */
interface TaskDetailSheetProps {
  snapshot: ProjectSnapshot;
  taskId: string | null;
  onClose: () => void;
}

/**
 * Renders the task detail slide-over for the task referenced by ?task=.
 * @param props - TaskDetailSheetProps with snapshot, selected task id and close callback.
 * @param props.snapshot - Current project snapshot.
 * @param props.taskId - Id of the task to show (null hides the sheet).
 * @param props.onClose - Removes the ?task= parameter.
 * @returns A JSX element with the sheet (hidden when no task is selected).
 */
export default function TaskDetailSheet({ snapshot, taskId, onClose }: TaskDetailSheetProps) {
  const mutations = useProjectMutations(snapshot.project.id);
  const task = snapshot.tasks.find((t) => t.id === taskId) ?? null;
  const result = useMemo(
    () => (taskId ? computeSchedule(buildScheduleInput(snapshot)) : null),
    [snapshot, taskId],
  );
  const scheduled = task && result ? result.tasks.get(task.id) : undefined;
  const assignments = snapshot.assignments.filter((a) => a.taskId === taskId);
  const taskNames = useMemo(
    () => new Map(snapshot.tasks.map((t) => [t.id, t.name])),
    [snapshot.tasks],
  );
  const [addDepOpen, setAddDepOpen] = useState<'pred' | 'succ' | null>(null);

  if (!task) return null;

  const predecessors = snapshot.dependencies.filter((d) => d.successorId === task.id);
  const successors = snapshot.dependencies.filter((d) => d.predecessorId === task.id);
  const avgDay = 480;

  const commit = (patch: Partial<TaskRow>) => void mutations.upsertTasks([{ ...task, ...patch }]);
  const commitEdit = (edit: TaskEdit) => {
    const edited = applyTaskEdit(toTaskInput(task), assignments, edit);
    commit({
      durationMinutes: edited.task.durationMinutes,
      workMinutes: edited.task.workMinutes,
    });
    const unitsChanged = edited.assignments.some((a, i) => a.units !== assignments[i]?.units);
    if (unitsChanged) {
      void mutations.setAssignments(
        task.id,
        edited.assignments.map((a) => ({ employeeId: a.employeeId, units: a.units })),
      );
    }
  };

  const addDependency = (otherTaskId: string, direction: 'pred' | 'succ') => {
    const candidate =
      direction === 'pred'
        ? { predecessorId: otherTaskId, successorId: task.id }
        : { predecessorId: task.id, successorId: otherTaskId };
    const input = buildScheduleInput(snapshot);
    const withCandidate = {
      ...input,
      dependencies: [...input.dependencies, { id: '__x__', type: 'FS' as DepType, lagMinutes: 0, ...candidate }],
    };
    if (prepareGraph(withCandidate).errors.some((e) => e.code === 'CYCLE')) {
      toast.error('Diese Verknüpfung würde einen Zyklus erzeugen');
      return;
    }
    void mutations.createDependency(candidate);
    setAddDepOpen(null);
  };

  const depList = (deps: typeof predecessors, direction: 'pred' | 'succ') => (
    <div className="space-y-2">
      {deps.map((dep) => {
        const otherId = direction === 'pred' ? dep.predecessorId : dep.successorId;
        return (
          <div key={dep.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
            <span className="min-w-0 flex-1 truncate">{taskNames.get(otherId) ?? otherId}</span>
            <Select
              value={dep.type}
              onValueChange={(type) => void mutations.updateDependency(dep.id, { type: type as DepType })}
            >
              <SelectTrigger size="sm" className="w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DEP_LABELS) as DepType[]).map((type) => (
                  <SelectItem key={type} value={type}>{DEP_LABELS[type]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="h-8 w-16 text-right text-xs"
              defaultValue={(dep.lagMinutes / avgDay).toLocaleString('de-DE')}
              title="Puffer/Vorlauf in Arbeitstagen"
              onBlur={(e) => {
                const days = Number(e.target.value.replace(',', '.'));
                if (!Number.isNaN(days)) {
                  void mutations.updateDependency(dep.id, { lagMinutes: Math.round(days * avgDay) });
                }
              }}
            />
            <span className="text-xs text-muted-foreground">T</span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Abhängigkeit löschen"
              onClick={() => void mutations.deleteDependency(dep.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        );
      })}
      <Popover open={addDepOpen === direction} onOpenChange={(open) => setAddDepOpen(open ? direction : null)}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus /> {direction === 'pred' ? 'Vorgänger' : 'Nachfolger'} hinzufügen
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Aufgabe suchen …" />
            <CommandList>
              <CommandEmpty>Keine Aufgabe gefunden.</CommandEmpty>
              <CommandGroup>
                {snapshot.tasks
                  .filter((t) => t.id !== task.id)
                  .map((t) => (
                    <CommandItem key={t.id} value={t.name} onSelect={() => addDependency(t.id, direction)}>
                      {t.name}
                    </CommandItem>
                  ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <Sheet open={taskId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2">
            {task.isMilestone && <span className="text-primary">◆</span>}
            <Input
              defaultValue={task.name}
              className="h-8 border-transparent px-1 text-base font-semibold shadow-none hover:border-input"
              onBlur={(e) => e.target.value !== task.name && commit({ name: e.target.value })}
            />
          </SheetTitle>
          {scheduled && (
            <p className="px-1 text-xs text-muted-foreground">
              {formatMoment(scheduled.start)} – {formatMoment(scheduled.end)} ·{' '}
              {formatDuration(scheduled.durationMinutes)} · {formatWorkHours(scheduled.workMinutes)}
            </p>
          )}
        </SheetHeader>
        <Tabs defaultValue="general" className="px-4 pb-6">
          <TabsList className="w-full">
            <TabsTrigger value="general">Allgemein</TabsTrigger>
            <TabsTrigger value="deps">
              Abhängigkeiten
              {predecessors.length + successors.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1">{predecessors.length + successors.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="people">
              Team
              {assignments.length > 0 && <Badge variant="secondary" className="ml-1 px-1">{assignments.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 pt-3">
            {!task.isMilestone && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Planart</Label>
                  <Select
                    value={task.category}
                    onValueChange={(value) => {
                      const category = value as PlanCategory;
                      const code = PLAN_CATEGORIES[category].code;
                      commit({
                        category,
                        planNumber:
                          task.planNumber ?? (code ? `${code}-` : null),
                      });
                    }}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLAN_CATEGORY_ORDER.map((category) => (
                        <SelectItem key={category} value={category}>
                          <span className="flex items-center gap-2">
                            <span className="size-2 rounded-sm" style={{ backgroundColor: PLAN_CATEGORIES[category].color }} />
                            {PLAN_CATEGORIES[category].label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Plannummer</Label>
                  <Input
                    key={`pn-${task.id}`}
                    defaultValue={task.planNumber ?? ''}
                    placeholder="z. B. S-101"
                    className="font-mono"
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value !== (task.planNumber ?? '')) commit({ planNumber: value || null });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={task.status} onValueChange={(value) => commit({ status: value as PlanStatus })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
                </div>
                <div className="space-y-1.5">
                  <Label>Liefertermin (Soll)</Label>
                  <Input
                    type="date"
                    value={task.dueDate ?? ''}
                    onChange={(e) => commit({ dueDate: e.target.value || null })}
                  />
                </div>
              </div>
            )}
            {task.isMilestone && (
              <div className="space-y-1.5">
                <Label>Liefertermin (Soll)</Label>
                <Input
                  type="date"
                  value={task.dueDate ?? ''}
                  onChange={(e) => commit({ dueDate: e.target.value || null })}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dauer</Label>
                <Input
                  key={`dur-${task.durationMinutes}`}
                  defaultValue={formatDuration(task.durationMinutes)}
                  disabled={task.isMilestone}
                  onBlur={(e) => {
                    const minutes = parseDurationInput(e.target.value);
                    if (minutes !== undefined) commitEdit({ kind: 'setDuration', durationMinutes: minutes });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Arbeit (Aufwand)</Label>
                <Input
                  key={`work-${task.workMinutes}`}
                  defaultValue={formatWorkHours(task.workMinutes)}
                  disabled={task.isMilestone}
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    const minutes = parseDurationInput(/[thm]/i.test(raw) ? raw : `${raw}h`);
                    if (minutes !== undefined) commitEdit({ kind: 'setWork', workMinutes: minutes });
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Berechnungsart</Label>
              <Select
                value={task.taskType}
                onValueChange={(value) => commit({ taskType: value as TaskRow['taskType'] })}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_INFO) as TaskRow['taskType'][]).map((type) => (
                    <SelectItem key={type} value={type}>{TYPE_INFO[type].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{TYPE_INFO[task.taskType].hint}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Einschränkung</Label>
                <Select
                  value={task.constraintType}
                  onValueChange={(value) =>
                    commit({
                      constraintType: value as TaskRow['constraintType'],
                      constraintDate:
                        value === 'asap' ? null : (task.constraintDate ?? snapshot.project.startDate),
                    })
                  }
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asap">So früh wie möglich</SelectItem>
                    <SelectItem value="start_no_earlier_than">Nicht früher als</SelectItem>
                    <SelectItem value="must_start_on">Muss beginnen am</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {task.constraintType !== 'asap' && (
                <div className="space-y-1.5">
                  <Label>Datum</Label>
                  <Input
                    type="date"
                    value={task.constraintDate ?? ''}
                    onChange={(e) => commit({ constraintDate: e.target.value || null })}
                  />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Fortschritt: {task.percentComplete} %</Label>
              <div className="flex items-center gap-1.5">
                {[0, 25, 50, 75, 100].map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={task.percentComplete === p ? 'default' : 'outline'}
                    onClick={() => commit({ percentComplete: p })}
                  >
                    {p}%
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notizen</Label>
              <Textarea
                key={task.id}
                defaultValue={task.notes ?? ''}
                rows={3}
                onBlur={(e) => e.target.value !== (task.notes ?? '') && commit({ notes: e.target.value || null })}
              />
            </div>
            {scheduled && !scheduled.isSummary && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <WhyExplanation explanation={scheduled.explanation} taskNames={taskNames} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="deps" className="space-y-5 pt-3">
            <div>
              <p className="mb-2 text-sm font-medium">Vorgänger</p>
              {depList(predecessors, 'pred')}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Nachfolger</p>
              {depList(successors, 'succ')}
            </div>
          </TabsContent>

          <TabsContent value="people" className="space-y-2 pt-3">
            {snapshot.employees.filter((e) => e.active).map((employee) => {
              const assignment = assignments.find((a) => a.employeeId === employee.id);
              return (
                <div key={employee.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                  <Checkbox
                    id={`assign-${employee.id}`}
                    checked={Boolean(assignment)}
                    onCheckedChange={(checked) => {
                      const next = checked
                        ? [...assignments.map((a) => ({ employeeId: a.employeeId, units: a.units })), { employeeId: employee.id, units: 1 }]
                        : assignments
                            .filter((a) => a.employeeId !== employee.id)
                            .map((a) => ({ employeeId: a.employeeId, units: a.units }));
                      void mutations.setAssignments(task.id, next);
                    }}
                  />
                  <label htmlFor={`assign-${employee.id}`} className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: employee.color }} />
                    <span className="truncate">{employee.name}</span>
                  </label>
                  {assignment && (
                    <>
                      <Input
                        className="h-8 w-16 text-right text-xs"
                        defaultValue={Math.round(assignment.units * 100)}
                        onBlur={(e) => {
                          const percent = Number(e.target.value);
                          if (!Number.isNaN(percent) && percent > 0 && percent <= 200) {
                            void mutations.setAssignments(
                              task.id,
                              assignments.map((a) =>
                                a.employeeId === employee.id
                                  ? { employeeId: a.employeeId, units: percent / 100 }
                                  : { employeeId: a.employeeId, units: a.units },
                              ),
                            );
                          }
                        }}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </>
                  )}
                </div>
              );
            })}
            {snapshot.employees.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Noch keine Mitarbeiter angelegt — unter „Mitarbeiter“ anlegen.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
