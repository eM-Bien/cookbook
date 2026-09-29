"use server";

import { redirect } from "next/navigation";
import { createAdminClient, getSecretKey } from "@/lib/supabase/admin";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  error: string | null;
  email: string;
  name: string;
  /** First visit with this address: ask how to sign their comments. */
  askName: boolean;
};

type Lookup = { allowed: boolean; has_account: boolean; name: string | null };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FAILED = "Nie udało się zalogować. Spróbuj ponownie za chwilę.";

// There is deliberately no password or confirmation e-mail: knowing an address
// from the allow-list is enough to get in. The server checks the list and then
// opens a session for that person itself.
export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const state = (change: Partial<LoginState>): LoginState => ({
    error: null,
    email,
    name,
    askName: false,
    ...change,
  });

  if (!EMAIL.test(email) || email.length > 254) {
    return state({ error: "Wpisz poprawny adres e-mail." });
  }
  if (!getSupabaseEnv() || !getSecretKey()) {
    return state({ error: "Aplikacja nie jest jeszcze skonfigurowana." });
  }

  const admin = createAdminClient();

  const lookup = await admin.rpc("login_lookup", { p_email: email });
  if (lookup.error) {
    console.error("login_lookup failed:", lookup.error.code, lookup.error.message);
    const missing = lookup.error.code === "PGRST202" || lookup.error.code === "42883";
    const refused = lookup.error.code === "42501" || /api key|jwt|unauthorized/i.test(lookup.error.message);
    return state({
      error: missing
        ? "Baza danych nie jest jeszcze przygotowana — uruchom supabase/schema.sql."
        : refused
          ? "Supabase odrzucił klucz. Sprawdź SUPABASE_SECRET_KEY w pliku .env.local."
          : "Nie udało się połączyć z bazą. Sprawdź adres projektu w pliku .env.local.",
    });
  }
  const found = lookup.data as Lookup;

  if (!found.allowed) {
    return state({ error: "Tego adresu nie ma na liście osób z dostępem." });
  }
  if (!found.has_account && !name) {
    return state({ askName: true });
  }

  if (!found.has_account) {
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { display_name: name },
    });
    // Two quick attempts can both try to create the account; the second is fine.
    if (created.error && created.error.code !== "email_exists") {
      console.error("createUser failed:", created.error.message);
      return state({ error: FAILED, askName: true });
    }
  }

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const token = link.data.properties?.hashed_token;
  if (link.error || !token) {
    console.error("generateLink failed:", link.error?.message);
    return state({ error: FAILED, askName: !found.has_account });
  }

  const supabase = await createClient();
  const session = await supabase.auth.verifyOtp({ token_hash: token, type: "email" });
  if (session.error || !session.data.user) {
    console.error("verifyOtp failed:", session.error?.message);
    return state({ error: FAILED, askName: !found.has_account });
  }

  if (!found.has_account) {
    // The account trigger already stored the name; this covers an older schema.
    await supabase.from("profiles").update({ display_name: name }).eq("id", session.data.user.id);
  }

  redirect("/kalendarz");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
