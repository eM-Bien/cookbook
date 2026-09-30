"use server";

import { revalidatePath } from "next/cache";
import { describeError, requireUser } from "@/lib/auth";
import { isISODate, today } from "@/lib/dates";
import type { ActionResult } from "@/lib/types";
import { KG_MAX, KG_MIN, parseKg } from "@/lib/weights";

export type ProfileState = { error: string | null; saved: boolean };

/** Writes (or corrects) the weight for one day. */
export async function saveWeight(_previous: ProfileState, formData: FormData): Promise<ProfileState> {
  const { supabase, userId } = await requireUser();

  const day = String(formData.get("day") ?? "");
  if (!isISODate(day)) return { error: "Podaj datę.", saved: false };
  if (day > today()) return { error: "Ta data jeszcze nie nadeszła.", saved: false };
  const kg = parseKg(String(formData.get("kg") ?? ""));
  if (kg === null) return { error: `Podaj wagę od ${KG_MIN} do ${KG_MAX} kg.`, saved: false };

  const { error } = await supabase
    .from("weights")
    .upsert({ user_id: userId, day, kg }, { onConflict: "user_id,day" });
  if (error) return { error: describeError(error), saved: false };

  revalidatePath("/profil");
  return { error: null, saved: true };
}

export async function deleteWeight(day: string): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  if (!isISODate(day)) return { ok: false, error: "Nie znaleziono tego wpisu." };

  const { error } = await supabase.from("weights").delete().eq("user_id", userId).eq("day", day);
  if (error) return { ok: false, error: describeError(error) };

  revalidatePath("/profil");
  return { ok: true, data: null };
}

export async function updateName(_previous: ProfileState, formData: FormData): Promise<ProfileState> {
  const { supabase, userId } = await requireUser();

  const name = String(formData.get("display_name") ?? "").trim();
  if (!name) return { error: "Wpisz, jak mamy Cię podpisywać.", saved: false };
  if (name.length > 60) return { error: "Nazwa może mieć do 60 znaków.", saved: false };

  const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", userId);
  if (error) return { error: describeError(error), saved: false };

  revalidatePath("/", "layout");
  return { error: null, saved: true };
}
