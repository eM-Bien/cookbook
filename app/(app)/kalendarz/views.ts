export type CalendarView = "dzien" | "tydzien" | "miesiac";

export const VIEWS: { value: CalendarView; label: string }[] = [
  { value: "dzien", label: "Dzień" },
  { value: "tydzien", label: "Tydzień" },
  { value: "miesiac", label: "Miesiąc" },
];

/** Remembers the view chosen last, so the calendar opens the same way next time. */
export const VIEW_COOKIE = "kalendarz-widok";

export function isView(value: unknown): value is CalendarView {
  return VIEWS.some((view) => view.value === value);
}
