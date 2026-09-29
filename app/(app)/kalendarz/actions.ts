"use server";

import { revalidatePath } from "next/cache";
import { describeError, requireUser } from "@/lib/auth";
import { isISODate } from "@/lib/dates";
import { isMealType, isUuid, type ActionResult, type MealType } from "@/lib/types";

function validServings(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100;
}

export async function addMeal(input: {
  date: string;
  mealType: MealType;
  recipeId: string;
  servings: number;
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

  revalidatePath("/kalendarz");
  return { ok: true, data: null };
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
