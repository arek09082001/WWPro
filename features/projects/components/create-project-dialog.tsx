'use client';

/**
 * Dialog for creating a new project (name, code, start date, color).
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useCreateProject } from '@/lib/queries/use-entities';
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

const COLORS = ['#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'];

const schema = z.object({
  name: z.string().min(2, 'Der Name ist zu kurz.'),
  code: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datum.'),
  color: z.string(),
});

type FormValues = z.infer<typeof schema>;

/** Props of {@link CreateProjectDialog}. */
interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStart: string;
}

/**
 * Renders the create-project dialog and navigates to the new Gantt on success.
 * @param props - CreateProjectDialogProps with open state, close callback and default start date.
 * @param props.open - Whether the dialog is visible.
 * @param props.onOpenChange - Callback toggling dialog visibility.
 * @param props.defaultStart - Prefilled ISO start date.
 * @returns A JSX element with the dialog form.
 */
export default function CreateProjectDialog({ open, onOpenChange, defaultStart }: CreateProjectDialogProps) {
  const createProject = useCreateProject();
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', code: '', startDate: defaultStart, color: COLORS[0] },
  });

  async function onSubmit(values: FormValues) {
    const project = (await createProject.mutateAsync({
      name: values.name,
      code: values.code || null,
      startDate: values.startDate,
      color: values.color,
    })) as { id: string };
    onOpenChange(false);
    form.reset();
    router.push(`/projects/${project.id}/gantt`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neues Projekt</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Name *</Label>
            <Input id="project-name" autoFocus {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="project-code">Kürzel</Label>
              <Input id="project-code" placeholder="z. B. WEB" {...form.register('code')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-start">Startdatum *</Label>
              <Input id="project-start" type="date" {...form.register('startDate')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Farbe</Label>
            <div className="flex gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Farbe ${color}`}
                  className="size-6 rounded-full ring-offset-2 transition-transform hover:scale-110 data-[active=true]:ring-2 data-[active=true]:ring-ring"
                  data-active={form.watch('color') === color}
                  style={{ backgroundColor: color }}
                  onClick={() => form.setValue('color', color)}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={createProject.isPending}>
              Projekt anlegen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
