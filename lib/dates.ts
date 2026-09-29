// Calendar days are plain "YYYY-MM-DD" strings. They are converted to Date only
// at UTC midnight, so arithmetic never shifts a day across time zones.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const date = toDate(value);
  return !Number.isNaN(date.getTime()) && toISO(date) === value;
}

/** Today for the people using the app, regardless of where the server runs. */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(iso: string, days: number): string {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toISO(date);
}

/** Monday of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  const weekday = toDate(iso).getUTCDay();
  return addDays(iso, weekday === 0 ? -6 : 1 - weekday);
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

function format(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("pl-PL", { ...options, timeZone: "UTC" }).format(toDate(iso));
}

export function formatWeekday(iso: string): string {
  return format(iso, { weekday: "long" });
}

export function formatDayMonth(iso: string): string {
  return format(iso, { day: "numeric", month: "long" });
}

export function formatShort(iso: string): string {
  return format(iso, { day: "numeric", month: "short" });
}

export function formatRange(from: string, to: string): string {
  if (from === to) return formatDayMonth(from);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const start = sameMonth ? format(from, { day: "numeric" }) : formatDayMonth(from);
  return `${start} – ${formatDayMonth(to)}`;
}

export function formatDateTime(timestamp: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(new Date(timestamp));
}
