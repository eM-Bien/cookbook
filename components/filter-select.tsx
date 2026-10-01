"use client";

import { useRouter } from "next/navigation";

/** A dropdown that navigates: each option carries the address it leads to. */
export function FilterSelect({
  label,
  options,
  value,
}: {
  label: string;
  options: { value: string; label: string; href: string }[];
  value: string;
}) {
  const router = useRouter();
  return (
    <select
      className="input select-filter"
      aria-label={label}
      value={value}
      onChange={(event) => {
        const chosen = options.find((option) => option.value === event.target.value);
        if (chosen) router.push(chosen.href);
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
