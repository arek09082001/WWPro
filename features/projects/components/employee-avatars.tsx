'use client';

/**
 * Compact overlapping avatar row with hover cards per employee.
 */

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import type { EmployeeRow } from '@/lib/store/types';

/** Initials of a display name ("Anna Weber" → "AW"). */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Renders up to five overlapping employee avatars with a "+n" indicator.
 * @param props - Contains the employees to display.
 * @param props.employees - Employee rows shown as avatars.
 * @returns A JSX element with the avatar stack.
 */
export default function EmployeeAvatars({ employees }: { employees: EmployeeRow[] }) {
  const visible = employees.slice(0, 5);
  const rest = employees.length - visible.length;
  return (
    <span className="flex -space-x-2">
      {visible.map((employee) => (
        <HoverCard key={employee.id} openDelay={200}>
          <HoverCardTrigger asChild>
            <Avatar className="size-6 border-2 border-background">
              <AvatarFallback
                className="text-[9px] font-semibold text-white"
                style={{ backgroundColor: employee.color }}
              >
                {initialsOf(employee.name)}
              </AvatarFallback>
            </Avatar>
          </HoverCardTrigger>
          <HoverCardContent side="top" className="w-auto px-3 py-1.5 text-sm">
            {employee.name}
          </HoverCardContent>
        </HoverCard>
      ))}
      {rest > 0 && (
        <span className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] font-semibold">
          +{rest}
        </span>
      )}
    </span>
  );
}
