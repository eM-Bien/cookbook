"use server";

import { revalidatePath } from "next/cache";
import { describeError, requireUser } from "@/lib/auth";
import { addDays, isISODate } from "@/lib/dates";
import { isMealType, isUuid, type ActionResult, type MealType } from "@/lib/types";

function validServings(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100;
}

export async function addMeal(input: {
  date: string;
  mealType: MealType;
  recipeId: string;
  servings: number;
  /** Cook once, eat twice: the same meal goes on the next day as well. */
  twoDays?: boolean;
}): Promise<ActionResult> {
  const { supabase } = await requireUser();

  if (!isISODate(input.date)) return { ok: false, error: "Wybierz poprawny dzień." };
  if (!isMealType(input.mealType)) return { ok: false, error: "Wybierz posiłek." };
  if (!isUuid(input.recipeId)) return { ok: false, error: "Wybierz przepis." };
  if (!validServings(input.servings)) {
    return { ok: false, error: "Liczba porcji musi być od 1 do 100." };
  }

  const { error } = await supabase.from("meal_plan").insert({
    plan_date: input.date,
    meal_type: input.mealType,
    recipe_id: input.recipeId,
    servings: input.servings,
  });
  if (error) return { ok: false, error: describeError(error) };

  if (input.twoDays) {
    const next = await putOnNextDay(supabase, input.date, input.mealType, input.recipeId, input.servings);
    if (next) return next;
  }

  revalidatePath("/kalendarz");
  return { ok: true, data: null };
}

/**
 * Puts the recipe on the day after as the same meal: swapped in if that meal
 * is already planned there, added otherwise. Returns the failure, if any.
 */
async function putOnNextDay(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  date: string,
  mealType: string,
  recipeId: string,
  servings: number,
): Promise<ActionResult | null> {
  const tomorrow = addDays(date, 1);
  const existing = await supabase
    .from("meal_plan")
    .select("id")
    .eq("plan_date", tomorrow)
    .eq("meal_type", mealType)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (existing.error) return { ok: false, error: describeError(existing.error) };

  const written = existing.data
    ? await supabase.from("meal_plan").update({ recipe_id: recipeId }).eq("id", existing.data.id)
    : await supabase
        .from("meal_plan")
        .insert({ plan_date: tomorrow, meal_type: mealType, recipe_id: recipeId, servings });
  return written.error ? { ok: false, error: describeError(written.error) } : null;
}

export async function setMealServings(id: string, servings: number): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!isUuid(id) || !validServings(servings)) {
    return { ok: false, error: "Liczba porcji musi być od 1 do 100." };
  }

  const { error } = await supabase.from("meal_plan").update({ servings }).eq("id", id);
  if (error) return { ok: false, error: describeError(error) };

  revalidatePath("/kalendarz");
  return { ok: true, data: null };
}

export async function removeMeal(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Nie znaleziono tej pozycji." };

  const { error } = await supabase.from("meal_plan").delete().eq("id", id);
  if (error) return { ok: false, error: describeError(error) };

  revalidatePath("/kalendarz");
  return { ok: true, data: null };
}

/** Swaps the recipe of a planned meal; the day, the meal and the servings stay. */
export async function replaceMeal(
  id: string,
  recipeId: string,
  /** Also put the new recipe on the next day, replacing that day's same meal if there is one. */
  twoDays = false,
): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Nie znaleziono tej pozycji." };
  if (!isUuid(recipeId)) return { ok: false, error: "Wybierz przepis." };

  const current = await supabase
    .from("meal_plan")
    .select("plan_date, meal_type, servings")
    .eq("id", id)
    .maybeSingle();
  if (current.error) return { ok: false, error: describeError(current.error) };
  if (!current.data) return { ok: false, error: "Nie znaleziono tej pozycji." };

  const { error } = await supabase.from("meal_plan").update({ recipe_id: recipeId }).eq("id", id);
  if (error) return { ok: false, error: describeError(error) };

  if (twoDays) {
    const next = await putOnNextDay(
      supabase,
      current.data.plan_date as string,
      current.data.meal_type as string,
      recipeId,
      current.data.servings as number,
    );
    if (next) return next;
  }

  revalidatePath("/kalendarz");
  return { ok: true, data: null };
}
