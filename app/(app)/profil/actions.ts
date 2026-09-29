"use server";

import { revalidatePath } from "next/cache";
import { describeError, requireUser } from "@/lib/auth";

export type ProfileState = { error: string | null; saved: boolean };

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
