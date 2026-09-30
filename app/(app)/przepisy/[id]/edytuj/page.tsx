import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecipeForm } from "@/components/recipe-form";
import { SetupNotice } from "@/components/setup-notice";
import { requireUser } from "@/lib/auth";
import { isUuid, type Ingredient, type Recipe } from "@/lib/types";

export const metadata: Metadata = { title: "Edycja przepisu" };

export default async function EditRecipePage({ params }: PageProps<"/przepisy/[id]/edytuj">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const { supabase } = await requireUser();
  const [recipeResult, ingredientsResult] = await Promise.all([
    supabase
      .from("recipes")
      .select(
        "id, title, description, servings, prep_minutes, calories, source_url, image_url, tags, steps, thermomix_steps, meal_types, notes, created_at",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("recipe_ingredients")
      .select("name, quantity, unit, category, alt_quantity, alt_unit, group_name")
      .eq("recipe_id", id)
      .order("position"),
  ]);

  if (recipeResult.error?.code === "42703") return <SetupNotice reason="update" />;
  if (recipeResult.error) throw new Error(recipeResult.error.message);
  const recipe = recipeResult.data as Recipe | null;
  if (!recipe) notFound();

  return (
    <div className="container-narrow stack" style={{ margin: "0 auto" }}>
      <h1>Edycja przepisu</h1>
      <RecipeForm
        recipeId={recipe.id}
        initial={{
          title: recipe.title,
          description: recipe.description ?? "",
          servings: recipe.servings,
          prep_minutes: recipe.prep_minutes,
          calories: recipe.calories,
          meal_types: recipe.meal_types,
          notes: recipe.notes ?? "",
          source_url: recipe.source_url ?? "",
          image_url: recipe.image_url ?? "",
          tags: recipe.tags,
          steps: recipe.steps,
          thermomix_steps: recipe.thermomix_steps,
          ingredients: (ingredientsResult.data ?? []) as Ingredient[],
        }}
      />
    </div>
  );
}
