import type { Metadata } from "next";
import Link from "next/link";
import { HeartButton } from "@/components/heart-button";
import { Icon } from "@/components/icons";
import { RecipeThumb } from "@/components/recipe-thumb";
import { requireUser } from "@/lib/auth";
import { formatMinutes, servingsLabel } from "@/lib/look";
import { MEAL_TYPES, isMealType, type RecipeSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Przepisy" };

function searchable(text: string): string {
  return text
    .toLowerCase()
    .replaceAll("ł", "l")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function RecipesPage({ searchParams }: PageProps<"/przepisy">) {
  const { supabase, userId } = await requireUser();
  const params = await searchParams;
  const query = first(params.q).trim().slice(0, 100);
  const tag = first(params.tag).trim();
  const requestedMeal = first(params.posilek);
  const meal = isMealType(requestedMeal) ? requestedMeal : null;
  const onlyFavorites = first(params.ulubione) === "1";

  const [recipesResult, favoritesResult] = await Promise.all([
    supabase
      .from("recipes")
      .select(
        "id, title, description, servings, prep_minutes, calories, image_url, tags, meal_types",
      )
      .order("title"),
    supabase.from("favorites").select("recipe_id").eq("user_id", userId),
  ]);
  if (recipesResult.error) throw new Error(recipesResult.error.message);

  const recipes = (recipesResult.data ?? []) as RecipeSummary[];
  const favorites = new Set((favoritesResult.data ?? []).map((f) => f.recipe_id as string));

  // Tags are offered for the chosen meal only, so the row stays short and relevant.
  const inMeal = meal ? recipes.filter((recipe) => recipe.meal_types.includes(meal)) : recipes;
  const usedMeals = MEAL_TYPES.filter((type) =>
    recipes.some((recipe) => recipe.meal_types.includes(type.value)),
  );

  const tagCounts = new Map<string, number>();
  for (const recipe of inMeal) {
    for (const t of recipe.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const tags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pl"))
    .slice(0, 16)
    .map(([name]) => name);

  const needle = searchable(query);
  const shown = inMeal.filter(
    (recipe) =>
      (!onlyFavorites || favorites.has(recipe.id)) &&
      (!tag || recipe.tags.includes(tag)) &&
      (!needle ||
        searchable(`${recipe.title} ${recipe.description ?? ""} ${recipe.tags.join(" ")}`).includes(
          needle,
        )),
  );

  // Meal, favourites and tag narrow each other down; each link changes one of them.
  const filterHref = (change: { posilek?: string | null; tag?: string | null; ulubione?: boolean }) => {
    const next = new URLSearchParams();
    const nextMeal = change.posilek === undefined ? meal : change.posilek;
    const nextTag = change.posilek !== undefined ? null : change.tag === undefined ? tag : change.tag;
    const nextFavorites = change.ulubione ?? onlyFavorites;
    if (nextMeal) next.set("posilek", nextMeal);
    if (nextTag) next.set("tag", nextTag);
    if (nextFavorites) next.set("ulubione", "1");
    if (query) next.set("q", query);
    const text = next.toString();
    return text ? `/przepisy?${text}` : "/przepisy";
  };

  return (
    <div className="stack">
      <div className="page-header">
        <h1>Przepisy</h1>
        <Link href="/nowy-przepis" className="btn btn-primary">
          <Icon name="plus" size={18} /> Dodaj przepis
        </Link>
      </div>

      <form action="/przepisy" className="search" role="search">
        <Icon name="search" />
        <input
          className="input"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Szukaj przepisu…"
          aria-label="Szukaj przepisu"
        />
        {meal && <input type="hidden" name="posilek" value={meal} />}
        {tag && <input type="hidden" name="tag" value={tag} />}
        {onlyFavorites && <input type="hidden" name="ulubione" value="1" />}
      </form>

      <nav className="chips" aria-label="Posiłek">
        <Link
          href={filterHref({ posilek: null })}
          className="chip"
          aria-current={!meal ? "true" : undefined}
        >
          Wszystkie
        </Link>
        {usedMeals.map((type) => (
          <Link
            key={type.value}
            href={filterHref({ posilek: type.value })}
            className="chip"
            aria-current={meal === type.value ? "true" : undefined}
          >
            {type.plural}
          </Link>
        ))}
        <Link
          href={filterHref({ ulubione: !onlyFavorites })}
          className="chip"
          aria-current={onlyFavorites ? "true" : undefined}
        >
          <Icon name="heart" size={15} /> Ulubione
        </Link>
      </nav>

      {tags.length > 0 && (
        <nav className="chips chips-sm" aria-label="Rodzaj dania">
          {tags.map((name) => (
            <Link
              key={name}
              href={filterHref({ tag: tag === name ? null : name })}
              className="chip"
              aria-current={tag === name ? "true" : undefined}
            >
              {name}
            </Link>
          ))}
        </nav>
      )}

      {recipes.length === 0 ? (
        <div className="empty">
          <p>Nie ma tu jeszcze żadnego przepisu.</p>
          <Link href="/nowy-przepis" className="btn btn-primary">
            Dodaj pierwszy przepis
          </Link>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">
          <p>Nic nie pasuje do tych filtrów.</p>
          <Link href="/przepisy" className="btn">
            Pokaż wszystkie
          </Link>
        </div>
      ) : (
        <ul className="recipe-list" style={{ listStyle: "none" }}>
          {shown.map((recipe) => (
            <li key={recipe.id} className="recipe-row">
              <RecipeThumb title={recipe.title} imageUrl={recipe.image_url} tags={recipe.tags} />
              <div className="recipe-row-text">
                <Link href={`/przepisy/${recipe.id}`} className="recipe-row-title">
                  {recipe.title}
                </Link>
                <div className="meta">
                  {recipe.prep_minutes !== null && (
                    <span>
                      <Icon name="clock" size={15} /> {formatMinutes(recipe.prep_minutes)}
                    </span>
                  )}
                  {recipe.calories !== null && <span>{recipe.calories} kcal</span>}
                  <span>
                    {recipe.servings} {servingsLabel(recipe.servings)}
                  </span>
                </div>
              </div>
              <HeartButton recipeId={recipe.id} favorite={favorites.has(recipe.id)} />
              <span className="recipe-row-chevron" aria-hidden="true">
                <Icon name="chevron-right" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
