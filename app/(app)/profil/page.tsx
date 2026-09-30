import type { Metadata } from "next";
import { signOut } from "@/app/login/actions";
import { requireUser } from "@/lib/auth";
import { today } from "@/lib/dates";
import type { WeightEntry } from "@/lib/weights";
import { WeightSection } from "./weight";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const { supabase, userId, email } = await requireUser();
  const [profile, weights] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    supabase.from("weights").select("day, kg").eq("user_id", userId).order("day"),
  ]);

  // The weights table came later than the rest; a database set up before it
  // gets a hint instead of a broken page.
  const weightsMissing =
    weights.error !== null && ["42P01", "PGRST205"].includes(weights.error.code ?? "");
  if (weights.error && !weightsMissing) throw new Error(weights.error.message);
  const entries: WeightEntry[] = (weights.data ?? []).map((row) => ({
    day: row.day as string,
    kg: Number(row.kg),
  }));

  return (
    <div className="container-narrow stack" style={{ margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <h1>No hejcia, {profile.data?.display_name ?? email}</h1>
          <p>{email}</p>
        </div>
        <form action={signOut}>
          <button className="btn">Wyloguj się</button>
        </form>
      </div>
      {weightsMissing ? (
        <section className="card stack">
          <h2>Waga</h2>
          <p className="muted">
            Dziennik wagi wymaga aktualizacji bazy: w Supabase otwórz <strong>SQL Editor</strong>,
            wklej całą zawartość <code>supabase/schema.sql</code> i kliknij <strong>Run</strong>.
            Reszta aplikacji działa bez tego.
          </p>
        </section>
      ) : (
        <WeightSection entries={entries} today={today()} />
      )}
    </div>
  );
}
