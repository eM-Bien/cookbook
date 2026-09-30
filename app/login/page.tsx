import type { Metadata } from "next";
import { connection } from "next/server";
import { Brand } from "@/components/brand";
import { SetupNotice } from "@/components/setup-notice";
import { getSecretKey } from "@/lib/supabase/admin";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Logowanie" };

// Cut-out dishes in public/login: they roll along the top edge, one at a time.
const DISHES = ["/login/dish-1.webp", "/login/dish-2.webp", "/login/dish-3.webp"];

export default async function LoginPage() {
  // Read the configuration when the page is opened, not when the app was built.
  await connection();
  if (!getSupabaseEnv() || !getSecretKey()) return <SetupNotice reason="env" />;

  return (
    <main className="login">
      <div className="login-stage" aria-hidden="true">
        {DISHES.map((src, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt="" className="login-dish" style={{ "--n": index } as React.CSSProperties} />
        ))}
      </div>
      <div className="login-body stack">
        <div className="stack stack-sm login-intro">
          <h1>
            <Brand />
          </h1>
          <p className="muted">Podaj maila i zobacz, co dziś gotujemy</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
