"use server";

import { revalidatePath } from "next/cache";
import { describeError, requireUser } from "@/lib/auth";
import { daysBetween, isISODate } from "@/lib/dates";
import { buildShoppingItems, keepChecked, type PlannedMeal } from "@/lib/shopping";
import type { ActionResult, Ingredient } from "@/lib/types";

type PlanRow = {
  servings: number;
  recipe: { title: string; servings: number; recipe_ingredients: Ingredient[] } | null;
};

/**
 * Builds the shopping list from the meals planned between two days.
 * "new" starts over; "refresh" keeps ticks and hand-added items.
 */
export async function generateShoppingList(
  from: string,
  to: string,
  mode: "new" | "refresh",
): Promise<ActionResult<{ meals: number }>> {
  const { supabase } = await requireUser();

  if (!isISODate(from) || !isISODate(to)) {
    return { ok: false, error: "Wybierz poprawne daty." };
  }
  if (to < from) return { ok: false, error: "Data końcowa nie może być przed początkową." };
  if (daysBetween(from, to) > 31) {
    return { ok: false, error: "Lista może obejmować najwyżej 31 dni." };
  }

  const plan = await supabase
    .from("meal_plan")
    .select(
      "servings, recipe:recipes(title, servings, recipe_ingredients(name, quantity, unit, category, alt_quantity, alt_unit))",
    )
    .gte("plan_date", from)
    .lte("plan_date", to);
  if (plan.error) return { ok: false, error: describeError(plan.error) };

  const meals: PlannedMeal[] = ((plan.data ?? []) as unknown as PlanRow[])
    .filter((row) => row.recipe !== null)
    .map((row) => ({
      recipeTitle: row.recipe!.title,
      recipeServings: row.recipe!.servings,
      servings: row.servings,
      ingredients: row.recipe!.recipe_ingredients,
    }));

  let items = buildShoppingItems(meals);

  if (mode === "refresh") {
    const previous = await supabase
      .from("shopping_items")
      .select("name, quantity, unit, checked")
      .eq("is_manual", false);
    if (previous.error) return { ok: false, error: describeError(previous.error) };
    items = keepChecked(items, previous.data ?? []);
  }

  const { error } = await supabase.rpc("set_shopping_list", {
    p_from: from,
    p_to: to,
    p_items: items,
    p_reset: mode === "new",
  });
  if (error) return { ok: false, error: describeError(error) };

  revalidatePath("/zakupy");
  return { ok: true, data: { meals: meals.length } };
}
