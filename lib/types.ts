export type MealType = "sniadanie" | "obiad" | "kolacja" | "przekaska";

export const MEAL_TYPES: { value: MealType; label: string; plural: string }[] = [
  { value: "sniadanie", label: "Śniadanie", plural: "Śniadania" },
  { value: "obiad", label: "Obiad", plural: "Obiady" },
  { value: "kolacja", label: "Kolacja", plural: "Kolacje" },
  { value: "przekaska", label: "Przekąska", plural: "Przekąski" },
];

export function isMealType(value: unknown): value is MealType {
  return MEAL_TYPES.some((m) => m.value === value);
}

export const CATEGORIES = [
  "warzywa i owoce",
  "nabiał i jajka",
  "mięso i ryby",
  "pieczywo",
  "produkty suche",
  "przyprawy",
  "mrożonki",
  "napoje",
  "inne",
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: unknown): value is Category {
  return CATEGORIES.includes(value as Category);
}

export type Ingredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  /** Household measure next to the weight: 4 łyżki for 40 g. */
  alt_quantity?: number | null;
  alt_unit?: string | null;
  /** Part of the recipe the ingredient belongs to, e.g. "Marynata". */
  group_name?: string | null;
};

export type Recipe = {
  id: string;
  title: string;
  description: string | null;
  servings: number;
  prep_minutes: number | null;
  /** Per serving. */
  calories: number | null;
  source_url: string | null;
  image_url: string | null;
  tags: string[];
  steps: string[];
  /** Meals the recipe suits; empty means any. */
  meal_types: MealType[];
  notes: string | null;
  created_at: string;
};

export type RecipeSummary = Pick<
  Recipe,
  | "id"
  | "title"
  | "servings"
  | "prep_minutes"
  | "calories"
  | "image_url"
  | "tags"
  | "meal_types"
  | "description"
>;

/** What the recipe form edits and the import returns. */
export type RecipeDraft = {
  title: string;
  description: string;
  servings: number;
  prep_minutes: number | null;
  calories: number | null;
  source_url: string;
  image_url: string;
  tags: string[];
  steps: string[];
  meal_types: MealType[];
  notes: string;
  ingredients: Ingredient[];
};

export type MealPlanEntry = {
  id: string;
  plan_date: string;
  meal_type: MealType;
  servings: number;
  recipe: { id: string; title: string; servings: number; calories: number | null };
};

export type ShoppingItem = {
  id: string;
  list_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  alt_quantity: number | null;
  alt_unit: string | null;
  category: string;
  sources: string[];
  checked: boolean;
  is_manual: boolean;
};

export type ShoppingList = {
  id: string;
  date_from: string;
  date_to: string;
};

export type RecipeComment = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author_name: string;
};

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
