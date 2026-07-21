'use client';

/**
 * Employee list: table with avatar, e-mail, assigned calendar, count of
 * active absences and an activity toggle. Rows open the employee detail
 * page; a context menu offers deactivation and cascade-aware deletion.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { todayIso } from '@/lib/format';
import type { EmployeeRow } from '@/lib/store/types';
import {
  useAbsences,
  useCalendars,
  useDeleteEmployee,
  useEmployees,
  useUpdateEmployee,
} from '@/lib/queries/use-entities';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { initialsOf } from '@/features/projects/components/employee-avatars';
import { isActiveAbsence } from '../lib/absences';
import CreateEmployeeDialog from '../components/create-employee-dialog';

/**
 * Renders the employee list page with creation dialog and per-row actions.
 * @returns A JSX element containing the employee table.
 */
export default function EmployeesPage() {
  const router = useRouter();
  const { data: employees, isLoading } = useEmployees();
  const { data: calendarData } = useCalendars();
  const { data: absences } = useAbsences();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();
  const [createOpen, setCreateOpen] = useState(false);
  const today = todayIso();

  function calendarName(employee: EmployeeRow): string {
    if (!employee.calendarId) return 'Standard';
    return (
      calendarData?.calendars.find((calendar) => calendar.id === employee.calendarId)?.name ??
      'Standard'
    );
  }

  function activeAbsenceCount(employee: EmployeeRow): number {
    return (absences ?? []).filter(
      (absence) => absence.employeeId === employee.id && isActiveAbsence(absence, today),
    ).length;
  }

  function confirmDelete(employee: EmployeeRow) {
    if (
      window.confirm(
        `Mitarbeiter „${employee.name}“ wirklich löschen? Zugehörige Abwesenheiten und Zuweisungen werden ebenfalls gelöscht.`,
      )
    ) {
      deleteEmployee.mutate(employee.id);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Mitarbeiter</h1>
          <p className="text-sm text-muted-foreground">
            Team, Kalenderzuordnung und Abwesenheiten verwalten
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> Neuer Mitarbeiter
        </Button>
      </header>

      <div className="p-6">
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        )}

        {!isLoading && (employees?.length ?? 0) === 0 && (
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-muted-foreground">
              Noch keine Mitarbeiter vorhanden. Lege dein Team an, um Aufgaben zuweisen zu können.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Ersten Mitarbeiter anlegen
            </Button>
          </Card>
        )}

        {!isLoading && (employees?.length ?? 0) > 0 && (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mitarbeiter</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Kalender</TableHead>
                  <TableHead className="text-right">Aktive Abwesenheiten</TableHead>
                  <TableHead className="w-20 text-right">Aktiv</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees?.map((employee) => (
                  <ContextMenu key={employee.id}>
                    <ContextMenuTrigger asChild>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => router.push(`/employees/${employee.id}`)}
                      >
                        <TableCell>
                          <span className="flex items-center gap-2.5">
                            <Avatar className="size-7">
                              <AvatarFallback
                                className="text-[10px] font-semibold text-white"
                                style={{ backgroundColor: employee.color }}
                              >
                                {initialsOf(employee.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className={employee.active ? 'font-medium' : 'font-medium text-muted-foreground'}>
                              {employee.name}
                            </span>
                            {!employee.active && <Badge variant="secondary">Inaktiv</Badge>}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {employee.email ?? '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {calendarName(employee)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {activeAbsenceCount(employee)}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Switch
                            checked={employee.active}
                            aria-label={`${employee.name} aktiv`}
                            onCheckedChange={(active) =>
                              updateEmployee.mutate({ id: employee.id, patch: { active } })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        onSelect={() =>
                          updateEmployee.mutate({
                            id: employee.id,
                            patch: { active: !employee.active },
                          })
                        }
                      >
                        {employee.active ? 'Deaktivieren' : 'Aktivieren'}
                      </ContextMenuItem>
                      <ContextMenuItem variant="destructive" onSelect={() => confirmDelete(employee)}>
                        Löschen
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <CreateEmployeeDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
