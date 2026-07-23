'use client';

/**
 * Inline-editable cell: renders as plain text until clicked, then swaps to an
 * input. Enter commits, Escape reverts, blur commits. Used across the Gantt
 * task table.
 */

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Props of {@link EditableCell}. */
interface EditableCellProps {
  value: string;
  display?: React.ReactNode;
  onCommit: (raw: string) => void;
  type?: 'text' | 'date';
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Commit and immediately re-open edit on Tab (spreadsheet feel). */
  align?: 'left' | 'right';
  /** Compact variant for stacked cells (smaller height + font). */
  dense?: boolean;
}

/**
 * Renders a click-to-edit cell.
 * @param props - EditableCellProps containing value, commit callback and display options.
 * @param props.value - Raw editable value shown in the input.
 * @param props.display - Optional formatted display node (falls back to value).
 * @param props.onCommit - Called with the raw input text when the edit is committed.
 * @param props.type - Input type ('text' | 'date').
 * @param props.className - Extra classes for the display button.
 * @param props.disabled - Disables editing (summary rollup cells).
 * @param props.placeholder - Placeholder for empty values.
 * @param props.align - Text alignment.
 * @returns A JSX element that toggles between text and input.
 */
export default function EditableCell({
  value,
  display,
  onCommit,
  type = 'text',
  className,
  disabled,
  placeholder,
  align = 'left',
  dense = false,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, value]);

  if (editing && !disabled) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== value) onCommit(draft);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            setEditing(false);
            if (draft !== value) onCommit(draft);
          }
          if (e.key === 'Escape') {
            setEditing(false);
          }
        }}
        className={cn(
          // select-text overrides the row's select-none so text stays selectable while editing.
          'w-full min-w-0 select-text rounded border border-ring bg-background outline-none',
          dense ? 'h-4 px-0.5 text-[10px]' : 'h-6 px-1 text-xs',
          align === 'right' && 'text-right',
        )}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={cn(
        'w-full truncate rounded text-left',
        dense ? 'h-4 px-0.5 text-[10px] leading-4' : 'h-6 px-1 text-xs',
        !disabled && 'cursor-text hover:bg-accent/60',
        disabled && 'cursor-default text-muted-foreground',
        align === 'right' && 'text-right tabular-nums',
        className,
      )}
      title={typeof display === 'string' ? display : value}
    >
      {display ?? value ?? (placeholder && <span className="text-muted-foreground">{placeholder}</span>)}
    </button>
  );
}
