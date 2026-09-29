import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

export function createClient() {
  const env = getSupabaseEnv();
  if (!env) throw new Error("Brak konfiguracji Supabase w .env.local");
  // createBrowserClient returns the same instance on every call in the browser.
  return createBrowserClient(env.url, env.key);
}
