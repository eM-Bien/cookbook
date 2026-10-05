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

/**
 * What a recipe line means in the shop. Zest is not sold by itself: a recipe
 * that grates citrus peel needs the whole fruit (one per ~6 g of zest).
 */
function shopAs(ingredient: Ingredient, scaled: number | null): Ingredient {
  const name = normalizeName(ingredient.name);
  const zest = name.match(
    /^skórka (?:z |otarta z )?(cytryny|limonki|pomarańczy)$/,
  );
  if (!zest) return { ...ingredient, quantity: scaled };
  const fruit = {
    cytryny: "cytryna",
    limonki: "limonka",
    pomarańczy: "pomarańcza",
  }[zest[1]]!;
  const grams = toBase(scaled, ingredient.unit).quantity;
  return {
    ...ingredient,
    name: fruit,
    quantity: grams === null ? 1 : Math.max(1, Math.ceil(grams / 6)),
    unit: "szt.",
    alt_quantity: null,
    alt_unit: null,
    category: "warzywa i owoce",
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
    for (const ingredient of meal.ingredients) {
      // Nobody needs to buy tap water.
      if (normalizeName(ingredient.name) === "woda") continue;

      const line = shopAs(
        ingredient,
        scaleQuantity(ingredient.quantity, meal.recipeServings, meal.servings),
      );
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
