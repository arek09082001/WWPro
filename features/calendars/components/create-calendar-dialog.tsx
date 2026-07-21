'use client';

/**
 * Dialog for creating a new calendar, starting from a copy of the default
 * work week (Mo–Fr, 08–12 and 13–17).
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DEFAULT_WEEK } from '@/engine/calendar';
import { useCreateCalendar } from '@/lib/queries/use-entities';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cloneWeek } from '../lib/intervals';

const schema = z.object({
  name: z.string().min(2, 'Der Name ist zu kurz.'),
});

type FormValues = z.infer<typeof schema>;

/** Props of {@link CreateCalendarDialog}. */
interface CreateCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (calendarId: string) => void;
}

/**
 * Renders the create-calendar dialog; new calendars start with the default
 * work week and can be adjusted in the editor afterwards.
 * @param props - CreateCalendarDialogProps with dialog state and creation callback.
 * @param props.open - Whether the dialog is visible.
 * @param props.onOpenChange - Callback toggling dialog visibility.
 * @param props.onCreated - Optional callback invoked with the new calendar id.
 * @returns A JSX element with the dialog form.
 */
export default function CreateCalendarDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateCalendarDialogProps) {
  const createCalendar = useCreateCalendar();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  });

  async function onSubmit(values: FormValues) {
    const calendar = (await createCalendar.mutateAsync({
      name: values.name,
      kind: 'base',
      week: cloneWeek(DEFAULT_WEEK),
    })) as { id: string };
    onOpenChange(false);
    form.reset();
    onCreated?.(calendar.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neuer Kalender</DialogTitle>
          <DialogDescription>
            Startet mit der Standard-Arbeitswoche (Mo–Fr, 08–12 und 13–17 Uhr) und kann danach
            angepasst werden.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="calendar-name">Name *</Label>
            <Input
              id="calendar-name"
              autoFocus
              placeholder="z. B. Werkstatt 4-Tage-Woche"
              {...form.register('name')}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={createCalendar.isPending}>
              Kalender anlegen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
