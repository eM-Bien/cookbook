import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";
import { serverOptions } from "./server-options";

export function getSecretKey(): string | null {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

/**
 * A client with full access to the project, bypassing the database rules.
 * It exists only to sign people in; everything else uses the visitor's own
 * session so the rules apply.
 */
export function createAdminClient() {
  const env = getSupabaseEnv();
  const secret = getSecretKey();
  if (!env || !secret) throw new Error("Brak SUPABASE_SECRET_KEY w .env.local");

  return createClient(env.url, secret, {
    ...serverOptions,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
