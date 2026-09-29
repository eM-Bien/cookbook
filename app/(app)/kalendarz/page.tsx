import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { LiveRefresh } from "@/components/live-refresh";
import { requireUser } from "@/lib/auth";
import {
  addDays,
  addMonths,
  endOfMonth,
  formatDayMonth,
  formatMonthYear,
  formatRange,
  formatWeekday,
  isISODate,
  monthGrid,
  startOfMonth,
  startOfWeek,
  today,
  weekDays,
} from "@/lib/dates";
import type { MealPlanEntry } from "@/lib/types";
import { Planner, type RecipeOption } from "./planner";
import { ViewSwitcher } from "./view-switcher";
import { VIEW_COOKIE, isView, type CalendarView } from "./views";

export const metadata: Metadata = { title: "Kalendarz" };

/** What each view shows, and how far one step forward or back takes you. */
function describe(view: CalendarView, date: string, now: string) {
  if (view === "dzien") {
    return {
      days: [date],
      from: date,
      to: date,
      title: `${formatWeekday(date)}, ${formatDayMonth(date)}`,
      previous: addDays(date, -1),
      next: addDays(date, 1),
      isCurrent: date === now,
      names: { previous: "Poprzedni dzień", next: "Następny dzień", shopping: "ten dzień" },
    };
  }
  if (view === "miesiac") {
    return {
      days: monthGrid(date),
      from: startOfMonth(date),
      to: endOfMonth(date),
      title: formatMonthYear(date),
      previous: addMonths(date, -1),
      next: addMonths(date, 1),
      isCurrent: date.slice(0, 7) === now.slice(0, 7),
      names: { previous: "Poprzedni miesiąc", next: "Następny miesiąc", shopping: "ten miesiąc" },
    };
  }
  const monday = startOfWeek(date);
  return {
    days: weekDays(monday),
    from: monday,
    to: addDays(monday, 6),
    title: formatRange(monday, addDays(monday, 6)),
    previous: addDays(date, -7),
    next: addDays(date, 7),
    isCurrent: monday === startOfWeek(now),
    names: { previous: "Poprzedni tydzień", next: "Następny tydzień", shopping: "ten tydzień" },
  };
}

export default async function CalendarPage({ searchParams }: PageProps<"/kalendarz">) {
  const { supabase } = await requireUser();
  const params = await searchParams;
  const remembered = (await cookies()).get(VIEW_COOKIE)?.value;

  const now = today();
  // "tydzien" is the address used before the views existed; old links keep working.
  const view: CalendarView = isView(params.widok)
    ? params.widok
    : isISODate(params.tydzien)
      ? "tydzien"
      : isView(remembered)
        ? remembered
        : "tydzien";
  const date = isISODate(params.data) ? params.data : isISODate(params.tydzien) ? params.tydzien : now;

  const shown = describe(view, date, now);
  const href = (day: string) => `/kalendarz?widok=${view}&data=${day}`;

  const [planResult, recipesResult] = await Promise.all([
    supabase
      .from("meal_plan")
      .select(
        "id, plan_date, meal_type, servings, recipe:recipes(id, title, servings, calories, image_url, tags)",
      )
      .gte("plan_date", shown.days[0])
      .lte("plan_date", shown.days.at(-1)!)
      .order("created_at"),
    supabase
      .from("recipes")
      .select("id, title, servings, image_url, calories, meal_types, tags")
      .order("title"),
  ]);
  if (planResult.error) throw new Error(planResult.error.message);

  const entries = (planResult.data ?? []) as unknown as MealPlanEntry[];
  const recipes = (recipesResult.data ?? []) as RecipeOption[];
  const planned = entries.some((entry) => entry.plan_date >= shown.from && entry.plan_date <= shown.to);

  return (
    <div className="stack">
      <LiveRefresh table="meal_plan" />

      {/* The period is the heading; "Kalendarz" stays for screen readers. */}
      <h1 className="calendar-heading">
        <span className="sr-only">Kalendarz: </span>
        <span className="calendar-title">{shown.title}</span>
      </h1>

      <div className="calendar-bar">
        <ViewSwitcher view={view} date={date} />
        <div className="calendar-steps">
          <Link href={href(shown.previous)} className="round-btn" aria-label={shown.names.previous}>
            <Icon name="chevron-left" />
          </Link>
          {!shown.isCurrent && (
            <Link href={href(now)} className="btn btn-sm">
              Dziś
            </Link>
          )}
          <Link href={href(shown.next)} className="round-btn" aria-label={shown.names.next}>
            <Icon name="chevron-right" />
          </Link>
        </div>
      </div>

      {/* A new key starts the planner afresh when the view or the period changes. */}
      <Planner
        key={`${view}-${shown.from}`}
        view={view}
        days={shown.days}
        month={date.slice(0, 7)}
        today={now}
        entries={entries}
        recipes={recipes}
      />

      {planned && (
        <div>
          <Link href={`/zakupy?od=${shown.from}&do=${shown.to}`} className="btn btn-primary">
            <Icon name="cart" size={18} /> Lista zakupów na {shown.names.shopping}
          </Link>
        </div>
      )}
    </div>
  );
}
