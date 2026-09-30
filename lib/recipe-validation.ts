import { isCategory, isMealType, type Ingredient, type RecipeDraft } from "./types";
import { UNITS } from "./units";

type Validated = { ok: true; draft: RecipeDraft } | { ok: false; error: string };

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function webAddress(value: unknown): string | null {
  const raw = text(value, 2000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

/** Checks what arrives from the browser before it is written to the database. */
export function validateRecipe(input: unknown): Validated {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Nieprawidłowe dane przepisu." };
  }
  const raw = input as Record<string, unknown>;

  const title = text(raw.title, 200);
  if (!title) return { ok: false, error: "Podaj nazwę przepisu." };

  const servings = wholeNumber(raw.servings, 1, 100);
  if (servings === null) return { ok: false, error: "Liczba porcji musi być od 1 do 100." };

  const prepMinutes =
    raw.prep_minutes === null || raw.prep_minutes === undefined
      ? null
      : wholeNumber(raw.prep_minutes, 0, 10000);
  if (prepMinutes === null && raw.prep_minutes !== null && raw.prep_minutes !== undefined) {
    return { ok: false, error: "Czas przygotowania podaj w minutach, np. 45." };
  }

  const calories =
    raw.calories === null || raw.calories === undefined
      ? null
      : wholeNumber(raw.calories, 0, 10000);
  if (calories === null && raw.calories !== null && raw.calories !== undefined) {
    return { ok: false, error: "Kalorie podaj jako liczbę, np. 520." };
  }

  const mealTypes = Array.isArray(raw.meal_types)
    ? [...new Set(raw.meal_types.filter(isMealType))]
    : [];

  const sourceUrl = webAddress(raw.source_url);
  const imageUrl = webAddress(raw.image_url);
  if (sourceUrl === null || imageUrl === null) {
    return { ok: false, error: "Adres strony i zdjęcia musi zaczynać się od https://" };
  }

  const tags = Array.isArray(raw.tags)
    ? [...new Set(raw.tags.map((t) => text(t, 30).toLowerCase()).filter(Boolean))].slice(0, 10)
    : [];

  const steps = Array.isArray(raw.steps)
    ? raw.steps.map((s) => text(s, 3000)).filter(Boolean).slice(0, 60)
    : [];
  const thermomixSteps = Array.isArray(raw.thermomix_steps)
    ? raw.thermomix_steps.map((s) => text(s, 3000)).filter(Boolean).slice(0, 60)
    : [];

  const ingredients: Ingredient[] = [];
  for (const item of Array.isArray(raw.ingredients) ? raw.ingredients.slice(0, 100) : []) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    const name = text(row.name, 200);
    if (!name) continue;

    const quantity = row.quantity ?? null;
    if (quantity !== null && (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0)) {
      return { ok: false, error: `Nieprawidłowa ilość przy składniku „${name}”.` };
    }
    const unit = typeof row.unit === "string" && UNITS.includes(row.unit) ? row.unit : null;

    const altQuantity = row.alt_quantity ?? null;
    if (
      altQuantity !== null &&
      (typeof altQuantity !== "number" || !Number.isFinite(altQuantity) || altQuantity < 0)
    ) {
      return { ok: false, error: `Nieprawidłowa miara domowa przy składniku „${name}”.` };
    }
    const altUnit =
      altQuantity !== null && typeof row.alt_unit === "string" && UNITS.includes(row.alt_unit)
        ? row.alt_unit
        : null;

    ingredients.push({
      name,
      quantity: quantity === null ? null : Math.round(quantity * 1000) / 1000,
      unit,
      category: isCategory(row.category) ? row.category : "inne",
      alt_quantity: altQuantity === null ? null : Math.round(altQuantity * 1000) / 1000,
      alt_unit: altUnit,
      group_name: text(row.group_name, 60) || null,
    });
  }
  if (ingredients.length === 0) return { ok: false, error: "Dodaj przynajmniej jeden składnik." };

  return {
    ok: true,
    draft: {
      title,
      description: text(raw.description, 1000),
      servings,
      prep_minutes: prepMinutes,
      calories,
      source_url: sourceUrl,
      image_url: imageUrl,
      tags,
      steps,
      thermomix_steps: thermomixSteps,
      meal_types: mealTypes,
      notes: text(raw.notes, 3000),
      ingredients,
    },
  };
}
