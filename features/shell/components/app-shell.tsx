'use client';

/**
 * Application shell: slim icon sidebar with the main navigation and the
 * globally mounted command palette. The content area fills the remaining
 * viewport; pages manage their own scrolling.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarCog, FolderKanban, Gauge, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import CommandPalette from './command-palette';

const NAV_ITEMS = [
  { href: '/projects', label: 'Projekte', icon: FolderKanban },
  { href: '/team', label: 'Team-Auslastung', icon: Gauge },
  { href: '/employees', label: 'Mitarbeiter', icon: Users },
  { href: '/settings/calendars', label: 'Kalender', icon: CalendarCog },
];

/**
 * Renders the sidebar navigation plus the routed page content.
 * @param props - Contains the active page as React children.
 * @returns A JSX element with the full-height app frame.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-r bg-muted/30 py-3">
        <Link
          href="/projects"
          className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground"
          aria-label="WWPro Startseite"
        >
          W
        </Link>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className={cn(
                    'flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                    active && 'bg-accent text-foreground',
                  )}
                >
                  <item.icon className="size-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
        <div className="mt-auto text-[10px] text-muted-foreground">⌘K</div>
      </aside>
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      <CommandPalette />
    </div>
  );
}
