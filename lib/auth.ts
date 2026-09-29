import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSupabaseEnv } from "./supabase/env";
import { createClient } from "./supabase/server";

/**
 * Every page and Server Action starts here. The database rules decide what
 * the signed-in person may read or change; this only establishes who they are.
 */
export async function requireUser() {
  // Everything behind the login depends on who is asking, so never prerender it.
  await connection();

  // Without configuration the login page explains how to set things up.
  if (!getSupabaseEnv()) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  return {
    supabase,
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
  };
}

/** Turns a database error into something a person can act on. */
export function describeError(error: { message: string; code?: string } | null): string {
  if (!error) return "Coś poszło nie tak. Spróbuj ponownie.";
  if (error.code === "42501" || /row-level security|permission denied/i.test(error.message)) {
    return "To konto nie ma uprawnień do tej operacji.";
  }
  if (error.code === "23503") return "Ten element już nie istnieje. Odśwież stronę.";
  if (error.code === "42P01" || error.code === "PGRST202" || error.code === "PGRST205") {
    return "Baza danych nie jest jeszcze przygotowana — uruchom supabase/schema.sql.";
  }
  return "Nie udało się zapisać zmian. Spróbuj ponownie.";
}
