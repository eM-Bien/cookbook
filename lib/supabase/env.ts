export type SupabaseEnv = { url: string; key: string };

/** null until .env.local is filled in — the app then shows setup instructions. */
export function getSupabaseEnv(): SupabaseEnv | null {
  // Referenced literally so Next.js can inline the values into the browser bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    // The dashboard also shows the address with "/rest/v1/" at the end; only
    // the part up to the domain is the project address.
    return { url: new URL(url.trim()).origin, key: key.trim() };
  } catch {
    return null;
  }
}
