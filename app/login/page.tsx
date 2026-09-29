import type { Metadata } from "next";
import { connection } from "next/server";
import { SetupNotice } from "@/components/setup-notice";
import { getSecretKey } from "@/lib/supabase/admin";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Logowanie" };

export default async function LoginPage() {
  // Read the configuration when the page is opened, not when the app was built.
  await connection();
  if (!getSupabaseEnv() || !getSecretKey()) return <SetupNotice reason="env" />;

  return (
    <main className="centered">
      <div className="card stack">
        <div className="stack stack-sm">
          <h1>Książka kucharska</h1>
          <p className="muted">Podaj swój e-mail, żeby zobaczyć przepisy i plan posiłków.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
