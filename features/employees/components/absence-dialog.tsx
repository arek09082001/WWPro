'use client';

/**
 * Dialog for recording an employee absence (type, date range, note).
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { todayIso } from '@/lib/format';
import { useCreateAbsence } from '@/lib/queries/use-entities';
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
import { Textarea } from '@/components/ui/textarea';
import { ABSENCE_TYPES } from '../lib/absences';

const schema = z
  .object({
    type: z.enum(['vacation', 'sick', 'other']),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datum.'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datum.'),
    note: z.string().optional(),
  })
  .refine((values) => values.endDate >= values.startDate, {
    message: '„Bis“ muss am oder nach „Von“ liegen.',
    path: ['endDate'],
  });

type FormValues = z.infer<typeof schema>;

/** Props of {@link AbsenceDialog}. */
interface AbsenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
}

/**
 * Renders the "Abwesenheit eintragen" dialog with type, date range and note.
 * @param props - AbsenceDialogProps with open state and the target employee.
 * @param props.open - Whether the dialog is visible.
 * @param props.onOpenChange - Callback toggling dialog visibility.
 * @param props.employeeId - Id of the employee the absence belongs to.
 * @returns A JSX element with the dialog form.
 */
export default function AbsenceDialog({ open, onOpenChange, employeeId }: AbsenceDialogProps) {
  const createAbsence = useCreateAbsence();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'vacation', startDate: todayIso(), endDate: todayIso(), note: '' },
  });

  async function onSubmit(values: FormValues) {
    await createAbsence.mutateAsync({
      employeeId,
      type: values.type,
      startDate: values.startDate,
      endDate: values.endDate,
      note: values.note?.trim() ? values.note.trim() : null,
    });
    onOpenChange(false);
    form.reset();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Abwesenheit eintragen</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Typ</Label>
            <Select
              value={form.watch('type')}
              onValueChange={(value) => form.setValue('type', value as FormValues['type'])}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ABSENCE_TYPES) as FormValues['type'][]).map((type) => (
                  <SelectItem key={type} value={type}>
                    {ABSENCE_TYPES[type].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="absence-start">Von *</Label>
              <Input id="absence-start" type="date" {...form.register('startDate')} />
              {form.formState.errors.startDate && (
                <p className="text-xs text-destructive">{form.formState.errors.startDate.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="absence-end">Bis *</Label>
              <Input id="absence-end" type="date" {...form.register('endDate')} />
              {form.formState.errors.endDate && (
                <p className="text-xs text-destructive">{form.formState.errors.endDate.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="absence-note">Notiz</Label>
            <Textarea
              id="absence-note"
              rows={3}
              placeholder="Optional, z. B. „Resturlaub 2025“"
              {...form.register('note')}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={createAbsence.isPending}>
              Eintragen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
