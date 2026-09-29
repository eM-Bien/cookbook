import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { LiveRefresh } from "@/components/live-refresh";
import { requireUser } from "@/lib/auth";
import { addDays, formatRange, isISODate, startOfWeek, today, weekDays } from "@/lib/dates";
import type { MealPlanEntry } from "@/lib/types";
import { WeekPlanner, type RecipeOption } from "./week-planner";

export const metadata: Metadata = { title: "Kalendarz" };

export default async function CalendarPage({ searchParams }: PageProps<"/kalendarz">) {
  const { supabase } = await requireUser();
  const { tydzien } = await searchParams;

  const now = today();
  const monday = startOfWeek(isISODate(tydzien) ? tydzien : now);
  const days = weekDays(monday);
  const sunday = days[6];

  const [planResult, recipesResult] = await Promise.all([
    supabase
      .from("meal_plan")
      .select("id, plan_date, meal_type, servings, recipe:recipes(id, title, servings, calories)")
      .gte("plan_date", monday)
      .lte("plan_date", sunday)
      .order("created_at"),
    supabase.from("recipes").select("id, title, servings, image_url, calories, meal_types, tags").order("title"),
  ]);
  if (planResult.error) throw new Error(planResult.error.message);

  const entries = (planResult.data ?? []) as unknown as MealPlanEntry[];
  const recipes = (recipesResult.data ?? []) as RecipeOption[];
  const isCurrentWeek = monday === startOfWeek(now);

  return (
    <div className="stack">
      <LiveRefresh table="meal_plan" />

      <div className="page-header">
        <div>
          <h1>Kalendarz</h1>
          <p>{formatRange(monday, sunday)}</p>
        </div>
        <div className="row">
          <Link
            href={`/kalendarz?tydzien=${addDays(monday, -7)}`}
            className="round-btn"
            aria-label="Poprzedni tydzień"
          >
            <Icon name="chevron-left" />
          </Link>
          {!isCurrentWeek && (
            <Link href="/kalendarz" className="btn">
              Ten tydzień
            </Link>
          )}
          <Link
            href={`/kalendarz?tydzien=${addDays(monday, 7)}`}
            className="round-btn"
            aria-label="Następny tydzień"
          >
            <Icon name="chevron-right" />
          </Link>
        </div>
      </div>

      <WeekPlanner days={days} today={now} entries={entries} recipes={recipes} />

      <div>
        <Link href={`/zakupy?od=${monday}&do=${sunday}`} className="btn btn-primary">
          <Icon name="cart" size={18} /> Lista zakupów na ten tydzień
        </Link>
      </div>
    </div>
  );
}
