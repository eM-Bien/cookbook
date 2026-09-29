"use client";

import { Icon } from "./icons";

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 100,
  label,
  small = false,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
  small?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={small ? "stepper stepper-sm" : "stepper"} role="group" aria-label={label}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= min}
        aria-label="Mniej"
      >
        <Icon name="minus" size={small ? 14 : 18} />
      </button>
      <output aria-live="polite">{value}</output>
      <button
        type="button"
        className="icon-btn"
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= max}
        aria-label="Więcej"
      >
        <Icon name="plus" size={small ? 14 : 18} />
      </button>
    </div>
  );
}
