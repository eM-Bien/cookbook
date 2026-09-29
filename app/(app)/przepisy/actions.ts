"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { describeError, requireUser } from "@/lib/auth";
import { FetchPageError, fetchPage } from "@/lib/fetch-page";
import { PhotoError, discardPhoto, storePhoto } from "@/lib/photos";
import { extractRecipe } from "@/lib/recipe-import";
import { validateRecipe } from "@/lib/recipe-validation";
import { isUuid, type ActionResult, type RecipeDraft } from "@/lib/types";

const NOT_FOUND: ActionResult<never> = { ok: false, error: "Nie znaleziono przepisu." };
const NO_ACCESS: ActionResult<never> = {
  ok: false,
  error: "To konto nie ma uprawnień do tej operacji.",
};

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

async function requireMember() {
  const session = await requireUser();
  const membership = await session.supabase.rpc("is_member");
  return membership.data === true ? session : null;
}

/** Stores a photo chosen in the recipe form; the form saves its address with the recipe. */
export async function uploadPhoto(formData: FormData): Promise<ActionResult<{ url: string }>> {
  if (!(await requireMember())) return NO_ACCESS;

  try {
    return { ok: true, data: { url: await storePhoto(formData.get("photo")) } };
  } catch (error) {
    if (error instanceof PhotoError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Adds or replaces the photo of an existing recipe, straight from its page. */
export async function setRecipePhoto(
  recipeId: string,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const session = await requireMember();
  if (!session) return NO_ACCESS;
  if (!isUuid(recipeId)) return NOT_FOUND;

  const current = await session.supabase
    .from("recipes")
    .select("image_url")
    .eq("id", recipeId)
    .maybeSingle();
  if (current.error) return { ok: false, error: describeError(current.error) };
  if (!current.data) return NOT_FOUND;

  let url: string;
  try {
    url = await storePhoto(formData.get("photo"));
  } catch (error) {
    if (error instanceof PhotoError) return { ok: false, error: error.message };
    throw error;
  }

  const saved = await session.supabase
    .from("recipes")
    .update({ image_url: url, updated_at: new Date().toISOString() })
    .eq("id", recipeId);
  if (saved.error) {
    await discardPhoto(url);
    return { ok: false, error: describeError(saved.error) };
  }
  await discardPhoto(current.data.image_url as string | null);

  revalidatePath("/przepisy");
  revalidatePath("/kalendarz");
  revalidatePath(`/przepisy/${recipeId}`);
  return { ok: true, data: { url } };
}
