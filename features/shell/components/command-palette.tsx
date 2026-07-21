'use client';

/**
 * Global ⌘K command palette: navigation, project/task/employee jumping and
 * quick actions. Opens with Cmd/Ctrl+K from anywhere in the app.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CalendarCog, FolderKanban, Gauge, Users } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useEmployees, useProjects } from '@/lib/queries/use-entities';

/**
 * Renders the command palette dialog and its global keyboard shortcut.
 * @returns A JSX element containing the ⌘K dialog (invisible until opened).
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data: projects } = useProjects();
  const { data: employees } = useEmployees();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Befehle" description="Schnellzugriff">
      <CommandInput placeholder="Suchen oder Befehl eingeben …" />
      <CommandList>
        <CommandEmpty>Keine Treffer.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => go('/projects')}>
            <FolderKanban /> Projekte
          </CommandItem>
          <CommandItem onSelect={() => go('/team')}>
            <Gauge /> Team-Auslastung
          </CommandItem>
          <CommandItem onSelect={() => go('/employees')}>
            <Users /> Mitarbeiter
          </CommandItem>
          <CommandItem onSelect={() => go('/settings/calendars')}>
            <CalendarCog /> Kalender & Arbeitszeiten
          </CommandItem>
        </CommandGroup>
        {projects && projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projekte">
              {projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={`projekt ${project.name} ${project.code ?? ''}`}
                  onSelect={() => go(`/projects/${project.id}/gantt`)}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  {project.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {employees && employees.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Mitarbeiter">
              {employees.map((employee) => (
                <CommandItem
                  key={employee.id}
                  value={`mitarbeiter ${employee.name}`}
                  onSelect={() => go(`/employees/${employee.id}`)}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: employee.color }}
                  />
                  {employee.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
