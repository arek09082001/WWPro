'use client';

/**
 * Employee detail page: editable master data (name, e-mail, color, calendar,
 * active flag), the absence list with entry dialog, and an info card showing
 * the effective weekly working hours.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { formatIsoDate } from '@/lib/format';
import {
  useAbsences,
  useCalendars,
  useDeleteAbsence,
  useEmployees,
  useUpdateEmployee,
  useWorkspace,
} from '@/lib/queries/use-entities';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { ABSENCE_TYPES } from '../lib/absences';
import AbsenceDialog from '../components/absence-dialog';
import ColorSwatches from '../components/color-swatches';
import WorkWeekCard from '../components/work-week-card';

/** Sentinel select value representing "no own calendar, use the workspace default". */
const DEFAULT_CALENDAR = '__default';

/** Props of {@link EmployeeDetailPage}. */
interface EmployeeDetailPageProps {
  employeeId: string;
}

/**
 * Renders the employee detail page for the given employee id.
 * @param props - EmployeeDetailPageProps containing the routed id.
 * @param props.employeeId - Id of the employee to display.
 * @returns A JSX element with header, absences and work-week card.
 */
export default function EmployeeDetailPage({ employeeId }: EmployeeDetailPageProps) {
  const { data: employees, isLoading } = useEmployees();
  const { data: calendarData } = useCalendars();
  const { data: absences } = useAbsences();
  const { data: workspace } = useWorkspace();
  const updateEmployee = useUpdateEmployee();
  const deleteAbsence = useDeleteAbsence();
  const [absenceOpen, setAbsenceOpen] = useState(false);

  const employee = employees?.find((row) => row.id === employeeId);

  const employeeAbsences = useMemo(
    () =>
      (absences ?? [])
        .filter((absence) => absence.employeeId === employeeId)
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [absences, employeeId],
  );

  const effectiveCalendar = useMemo(() => {
    const calendars = calendarData?.calendars ?? [];
    const own = employee?.calendarId
      ? calendars.find((calendar) => calendar.id === employee.calendarId)
      : undefined;
    if (own) return { week: own.week, label: own.name };
    const fallback = calendars.find((calendar) => calendar.id === workspace?.defaultCalendarId);
    return fallback
      ? { week: fallback.week, label: `Standard (${fallback.name})` }
      : undefined;
  }, [calendarData, employee, workspace]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">Mitarbeiter nicht gefunden.</p>
        <Button variant="outline" asChild>
          <Link href="/employees">
            <ArrowLeft /> Zur Mitarbeiterliste
          </Link>
        </Button>
      </div>
    );
  }

  function commitName(value: string) {
    const name = value.trim();
    if (name && name !== employee!.name) {
      updateEmployee.mutate({ id: employeeId, patch: { name } });
    }
  }

  function commitEmail(value: string) {
    const email = value.trim() || null;
    if (email !== employee!.email) {
      updateEmployee.mutate({ id: employeeId, patch: { email } });
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="space-y-4 border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Zurück zur Mitarbeiterliste" asChild>
            <Link href="/employees">
              <ArrowLeft />
            </Link>
          </Button>
          <Avatar className="size-9">
            <AvatarFallback
              className="text-xs font-semibold text-white"
              style={{ backgroundColor: employee.color }}
            >
              {initialsOf(employee.name)}
            </AvatarFallback>
          </Avatar>
          <Input
            key={`name-${employee.id}`}
            defaultValue={employee.name}
            aria-label="Name"
            className="h-9 max-w-xs border-transparent px-2 text-lg font-semibold shadow-none hover:border-input focus-visible:border-input"
            onBlur={(e) => commitName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          {!employee.active && <Badge variant="secondary">Inaktiv</Badge>}
          <div className="ml-auto flex items-center gap-2">
            <Label htmlFor="employee-active" className="text-sm text-muted-foreground">
              Aktiv
            </Label>
            <Switch
              id="employee-active"
              checked={employee.active}
              onCheckedChange={(active) => updateEmployee.mutate({ id: employeeId, patch: { active } })}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="employee-email">E-Mail</Label>
            <Input
              id="employee-email"
              key={`email-${employee.id}`}
              type="email"
              placeholder="name@firma.de"
              defaultValue={employee.email ?? ''}
              className="w-64"
              onBlur={(e) => commitEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Farbe</Label>
            <div className="flex h-9 items-center">
              <ColorSwatches
                value={employee.color}
                onChange={(color) => updateEmployee.mutate({ id: employeeId, patch: { color } })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Kalender</Label>
            <Select
              value={employee.calendarId ?? DEFAULT_CALENDAR}
              onValueChange={(value) =>
                updateEmployee.mutate({
                  id: employeeId,
                  patch: { calendarId: value === DEFAULT_CALENDAR ? null : value },
                })
              }
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_CALENDAR}>Standard (Workspace)</SelectItem>
                {calendarData?.calendars.map((calendar) => (
                  <SelectItem key={calendar.id} value={calendar.id}>
                    {calendar.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Abwesenheiten</CardTitle>
            <CardDescription>Urlaub, Krankheit und sonstige Fehlzeiten</CardDescription>
            <CardAction>
              <Button size="sm" onClick={() => setAbsenceOpen(true)}>
                <Plus /> Abwesenheit eintragen
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {employeeAbsences.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Keine Abwesenheiten eingetragen.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zeitraum</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Notiz</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeAbsences.map((absence) => (
                    <TableRow key={absence.id}>
                      <TableCell className="tabular-nums">
                        {formatIsoDate(absence.startDate)} – {formatIsoDate(absence.endDate)}
                      </TableCell>
                      <TableCell>
                        <Badge className={ABSENCE_TYPES[absence.type].badgeClass}>
                          {ABSENCE_TYPES[absence.type].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-64 truncate text-muted-foreground">
                        {absence.note ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Abwesenheit löschen"
                          onClick={() => deleteAbsence.mutate(absence.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {effectiveCalendar ? (
          <WorkWeekCard week={effectiveCalendar.week} sourceLabel={effectiveCalendar.label} />
        ) : (
          <Skeleton className="h-64 rounded-xl" />
        )}
      </div>

      <AbsenceDialog open={absenceOpen} onOpenChange={setAbsenceOpen} employeeId={employeeId} />
    </div>
  );
}
