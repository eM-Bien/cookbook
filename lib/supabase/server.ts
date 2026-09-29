import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";
import { serverOptions } from "./server-options";

export async function createClient() {
  const env = getSupabaseEnv();
  if (!env) throw new Error("Brak konfiguracji Supabase w .env.local");

  const cookieStore = await cookies();

  return createServerClient(env.url, env.key, {
    ...serverOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes the
          // session on every request, so nothing is lost.
        }
      },
    },
  });
}
