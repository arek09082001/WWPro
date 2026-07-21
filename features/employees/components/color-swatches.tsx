'use client';

/**
 * Shared color palette and swatch-row control for employee forms.
 */

/** Preset avatar colors offered for employees. */
export const EMPLOYEE_COLORS = [
  '#0ea5e9',
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
];

/** Props of {@link ColorSwatches}. */
interface ColorSwatchesProps {
  value: string;
  onChange: (color: string) => void;
}

/**
 * Renders a row of clickable color swatches with the current value ringed.
 * @param props - ColorSwatchesProps containing the selection state.
 * @param props.value - Currently selected hex color.
 * @param props.onChange - Callback invoked with the clicked hex color.
 * @returns A JSX element with one button per preset color.
 */
export default function ColorSwatches({ value, onChange }: ColorSwatchesProps) {
  return (
    <div className="flex gap-2">
      {EMPLOYEE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Farbe ${color}`}
          className="size-6 rounded-full ring-offset-2 transition-transform hover:scale-110 data-[active=true]:ring-2 data-[active=true]:ring-ring"
          data-active={value === color}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}
