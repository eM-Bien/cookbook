import Link from "next/link";
import { connection } from "next/server";
import { signOut } from "@/app/login/actions";
import { Brand } from "@/components/brand";
import { NavLinks } from "@/components/nav-links";
import { SetupNotice } from "@/components/setup-notice";
import { requireUser } from "@/lib/auth";
import { initials } from "@/lib/look";
import { getSupabaseEnv } from "@/lib/supabase/env";

export default async function AppLayout({
  children,
  drawer,
}: {
  children: React.ReactNode;
  /** A recipe opened over the current page; see app/(app)/@drawer. */
  drawer: React.ReactNode;
}) {
  await connection();
  if (!getSupabaseEnv()) return <SetupNotice reason="env" />;

  const { supabase, userId, email } = await requireUser();
  const [membership, profile, newest] = await Promise.all([
    supabase.rpc("is_member"),
    supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    // Asks for the columns added most recently, to notice a database that was
    // set up with an older schema.sql.
    supabase.from("recipes").select("thermomix_steps").limit(1),
  ]);

  if (membership.error) return <SetupNotice reason="schema" />;
  if (newest.error) return <SetupNotice reason="update" />;

  if (membership.data !== true) {
    return (
      <main className="centered">
        <div className="card stack">
          <h1>Brak dostępu</h1>
          <p className="muted">
            Konto <strong>{email}</strong> nie jest na liście osób, które mogą korzystać z tej
            naszego Cookbooka. Dopisz ten adres do tabeli <code>allowed_emails</code> w Supabase.
          </p>
          <form action={signOut}>
            <button className="btn">Wyloguj się</button>
          </form>
        </div>
      </main>
    );
  }

  const name = profile.data?.display_name ?? email;

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <Link href="/kalendarz" className="brand">
            <Brand />
          </Link>
          <NavLinks />
          <Link href="/profil" className="avatar nav-user" title={name} aria-label={`Profil: ${name}`}>
            {initials(name)}
          </Link>
        </div>
      </header>
      <main className="container">{children}</main>
      {drawer}
    </>
  );
}
