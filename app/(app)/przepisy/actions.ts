"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { describeError, requireUser } from "@/lib/auth";
import { FetchPageError, fetchPage } from "@/lib/fetch-page";
import { extractRecipe } from "@/lib/recipe-import";
import { validateRecipe } from "@/lib/recipe-validation";
import { isUuid, type ActionResult, type RecipeDraft } from "@/lib/types";

const NOT_FOUND: ActionResult<never> = { ok: false, error: "Nie znaleziono przepisu." };

export async function saveRecipe(id: string | null, input: RecipeDraft): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (id !== null && !isUuid(id)) return NOT_FOUND;

  const checked = validateRecipe(input);
  if (!checked.ok) return checked;
  const { ingredients, ...recipe } = checked.draft;

  const { data, error } = await supabase.rpc("save_recipe", {
    p_id: id,
    p_recipe: recipe,
    p_ingredients: ingredients,
  });
  if (error || !isUuid(data)) return { ok: false, error: describeError(error) };

  revalidatePath("/przepisy");
  revalidatePath("/kalendarz");
  redirect(`/przepisy/${data}`);
}

export async function deleteRecipe(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!isUuid(id)) return NOT_FOUND;

  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) return { ok: false, error: describeError(error) };

  revalidatePath("/przepisy");
  revalidatePath("/kalendarz");
  redirect("/przepisy");
}

export async function importRecipe(url: string): Promise<ActionResult<RecipeDraft>> {
  await requireUser();

  try {
    const page = await fetchPage(String(url));
    const draft = extractRecipe(page.html, page.url);
    if (!draft) {
      return {
        ok: false,
        error:
          "Na tej stronie nie znalazłem przepisu w formacie, który umiem odczytać. Wpisz go ręcznie — składniki możesz wkleić hurtem.",
      };
    }
    return { ok: true, data: draft };
  } catch (error) {
    if (error instanceof FetchPageError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function setFavorite(recipeId: string, favorite: boolean): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  if (!isUuid(recipeId)) return NOT_FOUND;

  const { error } = favorite
    ? await supabase
        .from("favorites")
        .upsert({ user_id: userId, recipe_id: recipeId }, { ignoreDuplicates: true })
    : await supabase.from("favorites").delete().eq("user_id", userId).eq("recipe_id", recipeId);
  if (error) return { ok: false, error: describeError(error) };

  revalidatePath("/przepisy");
  revalidatePath(`/przepisy/${recipeId}`);
  return { ok: true, data: null };
}

export async function addComment(recipeId: string, body: string): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  if (!isUuid(recipeId)) return NOT_FOUND;

  const text = String(body).trim();
  if (!text) return { ok: false, error: "Napisz coś, zanim wyślesz." };
  if (text.length > 2000) return { ok: false, error: "Komentarz może mieć do 2000 znaków." };

  const { error } = await supabase
    .from("comments")
    .insert({ recipe_id: recipeId, author_id: userId, body: text });
  if (error) return { ok: false, error: describeError(error) };

  revalidatePath(`/przepisy/${recipeId}`);
  return { ok: true, data: null };
}

export async function deleteComment(id: string, recipeId: string): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  if (!isUuid(id) || !isUuid(recipeId)) return NOT_FOUND;

  const { error } = await supabase.from("comments").delete().eq("id", id).eq("author_id", userId);
  if (error) return { ok: false, error: describeError(error) };

  revalidatePath(`/przepisy/${recipeId}`);
  return { ok: true, data: null };
}
