import Link from "next/link";
import { notFound } from "next/navigation";
import { HeartButton } from "@/components/heart-button";
import { Icon } from "@/components/icons";
import { LiveRefresh } from "@/components/live-refresh";
import { requireUser } from "@/lib/auth";
import { today } from "@/lib/dates";
import { dishEmoji, toneFor } from "@/lib/look";
import { MEAL_TYPES, type Ingredient, type Recipe, type RecipeComment } from "@/lib/types";
import { Comments } from "./comments";
import { DeleteRecipeButton } from "./delete-recipe-button";
import { RecipeView } from "./recipe-view";

type Named = { display_name: string } | null;

/** The recipe itself, shown both as a full page and inside the drawer. */
export async function RecipeContent({ id, inDrawer = false }: { id: string; inDrawer?: boolean }) {
  const { supabase, userId } = await requireUser();

  const [recipeResult, ingredientsResult, commentsResult, favoritesResult] = await Promise.all([
    supabase
      .from("recipes")
      .select(
        "id, title, description, servings, prep_minutes, calories, source_url, image_url, tags, steps, meal_types, notes, created_at",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("recipe_ingredients")
      .select("name, quantity, unit, category, alt_quantity, alt_unit, group_name")
      .eq("recipe_id", id)
      .order("position"),
    supabase
      .from("comments")
      .select("id, body, created_at, author_id, author:profiles(display_name)")
      .eq("recipe_id", id)
      .order("created_at"),
    supabase.from("favorites").select("user_id, profile:profiles(display_name)").eq("recipe_id", id),
  ]);

  if (recipeResult.error) throw new Error(recipeResult.error.message);
  const recipe = recipeResult.data as Recipe | null;
  if (!recipe) notFound();

  const ingredients = (ingredientsResult.data ?? []) as Ingredient[];

  const comments: RecipeComment[] = (commentsResult.data ?? []).map((row) => ({
    id: row.id as string,
    body: row.body as string,
    created_at: row.created_at as string,
    author_id: row.author_id as string,
    author_name: (row.author as unknown as Named)?.display_name ?? "Ktoś",
  }));

  const favorites = favoritesResult.data ?? [];
  const isFavorite = favorites.some((f) => f.user_id === userId);
  const alsoLikedBy = favorites
    .filter((f) => f.user_id !== userId)
    .map((f) => (f.profile as unknown as Named)?.display_name)
    .filter((name): name is string => Boolean(name));

  // The page behind the drawer already has its own main heading.
  const Title = inDrawer ? "h2" : "h1";

  return (
    <>
      <LiveRefresh table="comments" filter={`recipe_id=eq.${recipe.id}`} />

      <div className="hero" data-tone={toneFor(recipe.title)}>
        {recipe.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={recipe.image_url} alt="" referrerPolicy="no-referrer" />
        ) : (
          <div className="hero-placeholder" aria-hidden="true">
            {dishEmoji(recipe.tags)}
          </div>
        )}
        <div className="hero-actions">
          {inDrawer ? (
            <button type="button" className="round-btn" aria-label="Zamknij" data-drawer-close>
              <Icon name="close" size={22} />
            </button>
          ) : (
            <Link href="/przepisy" className="round-btn" aria-label="Wróć do przepisów">
              <Icon name="chevron-left" size={22} />
            </Link>
          )}
          <HeartButton recipeId={recipe.id} favorite={isFavorite} floating />
        </div>
      </div>

      <div className="sheet">
        <header className="sheet-title">
          <Title className="recipe-title">{recipe.title}</Title>
          {recipe.description && <p className="muted">{recipe.description}</p>}
          {(recipe.tags.length > 0 || recipe.meal_types.length > 0) && (
            <div className="row" style={{ marginTop: 4 }}>
              {MEAL_TYPES.filter((type) => recipe.meal_types.includes(type.value)).map((type) => (
                <Link key={type.value} href={`/przepisy?posilek=${type.value}`} className="tag tag-meal">
                  {type.label}
                </Link>
              ))}
              {recipe.tags.map((tag) => (
                <Link key={tag} href={`/przepisy?tag=${encodeURIComponent(tag)}`} className="tag">
                  {tag}
                </Link>
              ))}
            </div>
          )}
          {alsoLikedBy.length > 0 && (
            <p className="muted small">♥ Lubi też: {alsoLikedBy.join(", ")}</p>
          )}
        </header>

        <RecipeView recipe={recipe} ingredients={ingredients} today={today()} />

        {recipe.steps.length > 0 && (
          <section>
            <h2 className="section-title">Przygotowanie</h2>
            <ol className="step-list">
              {recipe.steps.map((step, index) => (
                <li key={index}>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {recipe.notes && (
          <section>
            <h2 className="section-title">Wskazówki</h2>
            <p className="note">{recipe.notes}</p>
          </section>
        )}

        <Comments recipeId={recipe.id} comments={comments} userId={userId} />

        <footer className="row row-between">
          {recipe.source_url ? (
            <a
              href={recipe.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-sm"
            >
              <Icon name="link" size={16} /> Oryginalny przepis
            </a>
          ) : (
            <span />
          )}
          <div className="row">
            <Link href={`/przepisy/${recipe.id}/edytuj`} className="btn btn-sm">
              <Icon name="pencil" size={16} /> Edytuj
            </Link>
            <DeleteRecipeButton recipeId={recipe.id} title={recipe.title} />
          </div>
        </footer>
      </div>
    </>
  );
}
