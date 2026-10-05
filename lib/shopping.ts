import { scaleQuantity } from "./ingredients";
import { CATEGORIES, type Ingredient } from "./types";
import { toBase } from "./units";

export type PlannedMeal = {
  recipeTitle: string;
  recipeServings: number;
  servings: number;
  ingredients: Ingredient[];
};

export type ShoppingDraftItem = {
  name: string;
  quantity: number | null;
  unit: string | null;
  /** Total in household measures, kept only while every recipe uses the same one. */
  alt_quantity: number | null;
  alt_unit: string | null;
  category: string;
  sources: string[];
  checked: boolean;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

const FRUIT: Record<string, string> = {
  cytryny: "cytryna",
  limonki: "limonka",
  pomarańczy: "pomarańcza",
};

/**
 * What a recipe line means in the shop. Juice and zest are not bought as such:
 * a recipe that squeezes or grates citrus needs the whole fruit. One fruit
 * covers ~40 g of juice or ~6 g of zest; within one recipe both share the
 * same fruit, so the larger count wins (see buildShoppingItems).
 */
function shopAs(
  ingredient: Ingredient,
  scaled: number | null,
): Ingredient & { whole?: true } {
  const name = normalizeName(ingredient.name);
  const citrus = name.match(
    /^(sok|skórka|skórka otarta) z (cytryny|limonki|pomarańczy)$/,
  );
  if (!citrus) return { ...ingredient, quantity: scaled };
  const grams = toBase(scaled, ingredient.unit).quantity;
  const perFruit = citrus[1] === "sok" ? 40 : 6;
  return {
    ...ingredient,
    name: FRUIT[citrus[2]],
    quantity: grams === null ? 1 : Math.max(1, Math.ceil(grams / perFruit)),
    unit: "szt.",
    alt_quantity: null,
    alt_unit: null,
    category: "warzywa i owoce",
    whole: true,
  };
}

/** Items with the same key are the same product in addable units. */
export function itemKey(
  name: string,
  quantity: number | null,
  unit: string | null,
): string {
  return `${normalizeName(name)}|${toBase(quantity, unit).dimension}`;
}

export function categoryRank(category: string): number {
  const index = (CATEGORIES as readonly string[]).indexOf(category);
  return index === -1 ? CATEGORIES.length : index;
}

export function compareItems(
  a: { name: string; category: string },
  b: { name: string; category: string },
): number {
  return (
    categoryRank(a.category) - categoryRank(b.category) ||
    a.name.localeCompare(b.name, "pl")
  );
}

/** Sums ingredients of all planned meals, scaled to the planned servings. */
export function buildShoppingItems(meals: PlannedMeal[]): ShoppingDraftItem[] {
  const byKey = new Map<string, ShoppingDraftItem>();

  for (const meal of meals) {
    // Lines of one recipe, with juice and zest of the same fruit collapsed to one.
    const lines: Ingredient[] = [];
    for (const ingredient of meal.ingredients) {
      // Nobody needs to buy tap water.
      if (normalizeName(ingredient.name) === "woda") continue;
      const line = shopAs(
        ingredient,
        scaleQuantity(ingredient.quantity, meal.recipeServings, meal.servings),
      );
      const twin = line.whole
        ? lines.find((l) => l.name === line.name && l.unit === "szt.")
        : undefined;
      if (twin)
        twin.quantity = Math.max(twin.quantity ?? 0, line.quantity ?? 0);
      else lines.push(line);
    }

    for (const line of lines) {
      const scaled = line.quantity;
      const base = toBase(scaled, line.unit);
      const key = itemKey(line.name, scaled, line.unit);
      const existing = byKey.get(key);

      const alt = scaleQuantity(
        line.alt_quantity ?? null,
        meal.recipeServings,
        meal.servings,
      );
      const altUnit = alt === null ? null : (line.alt_unit ?? null);

      if (!existing) {
        byKey.set(key, {
          name: normalizeName(line.name),
          quantity: base.quantity,
          unit: base.unit,
          alt_quantity: alt,
          alt_unit: altUnit,
          category: line.category,
          sources: [meal.recipeTitle],
          checked: false,
        });
        continue;
      }

      if (existing.quantity !== null && base.quantity !== null) {
        existing.quantity =
          Math.round((existing.quantity + base.quantity) * 1000) / 1000;
      }
      if (
        existing.alt_quantity !== null &&
        alt !== null &&
        existing.alt_unit === altUnit
      ) {
        existing.alt_quantity =
          Math.round((existing.alt_quantity + alt) * 1000) / 1000;
      } else {
        existing.alt_quantity = null;
        existing.alt_unit = null;
      }
      if (existing.category === "inne") existing.category = line.category;
      if (!existing.sources.includes(meal.recipeTitle))
        existing.sources.push(meal.recipeTitle);
    }
  }

  return [...byKey.values()].sort(compareItems);
}

/** Keeps the "already have it" ticks when the list is regenerated. */
export function keepChecked(
  items: ShoppingDraftItem[],
  previous: {
    name: string;
    quantity: number | null;
    unit: string | null;
    checked: boolean;
  }[],
): ShoppingDraftItem[] {
  const checkedKeys = new Set(
    previous
      .filter((p) => p.checked)
      .map((p) => itemKey(p.name, p.quantity, p.unit)),
  );
  return items.map((item) => ({
    ...item,
    checked: checkedKeys.has(itemKey(item.name, item.quantity, item.unit)),
  }));
}
