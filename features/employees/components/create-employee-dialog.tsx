'use client';

/**
 * Dialog for creating a new employee (name, e-mail, color, calendar).
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useCalendars, useCreateEmployee } from '@/lib/queries/use-entities';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ColorSwatches, { EMPLOYEE_COLORS } from './color-swatches';

/** Sentinel select value representing "no own calendar, use the workspace default". */
const DEFAULT_CALENDAR = '__default';

const schema = z.object({
  name: z.string().min(2, 'Der Name ist zu kurz.'),
  email: z.email('Ungültige E-Mail-Adresse.').or(z.literal('')),
  color: z.string(),
  calendarId: z.string(),
});

type FormValues = z.infer<typeof schema>;

/** Props of {@link CreateEmployeeDialog}. */
interface CreateEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Renders the create-employee dialog with name, e-mail, color swatches and
 * calendar selection (workspace default or a specific calendar).
 * @param props - CreateEmployeeDialogProps with open state and close callback.
 * @param props.open - Whether the dialog is visible.
 * @param props.onOpenChange - Callback toggling dialog visibility.
 * @returns A JSX element with the dialog form.
 */
export default function CreateEmployeeDialog({ open, onOpenChange }: CreateEmployeeDialogProps) {
  const createEmployee = useCreateEmployee();
  const { data: calendarData } = useCalendars();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', color: EMPLOYEE_COLORS[0], calendarId: DEFAULT_CALENDAR },
  });

  async function onSubmit(values: FormValues) {
    await createEmployee.mutateAsync({
      name: values.name,
      email: values.email || null,
      color: values.color,
      calendarId: values.calendarId === DEFAULT_CALENDAR ? null : values.calendarId,
    });
    onOpenChange(false);
    form.reset();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neuer Mitarbeiter</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="employee-name">Name *</Label>
            <Input id="employee-name" autoFocus {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="employee-email">E-Mail</Label>
            <Input id="employee-email" type="email" placeholder="name@firma.de" {...form.register('email')} />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Farbe</Label>
            <ColorSwatches
              value={form.watch('color')}
              onChange={(color) => form.setValue('color', color)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Kalender</Label>
            <Select
              value={form.watch('calendarId')}
              onValueChange={(value) => form.setValue('calendarId', value)}
            >
              <SelectTrigger className="w-full">
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
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={createEmployee.isPending}>
              Mitarbeiter anlegen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
