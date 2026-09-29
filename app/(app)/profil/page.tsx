import type { Metadata } from "next";
import { signOut } from "@/app/login/actions";
import { requireUser } from "@/lib/auth";
import { NameForm } from "./profile-forms";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const { supabase, userId, email } = await requireUser();
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  return (
    <div className="container-narrow stack" style={{ margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <h1>Profil</h1>
          <p>{email}</p>
        </div>
        <form action={signOut}>
          <button className="btn">Wyloguj się</button>
        </form>
      </div>
      <NameForm name={data?.display_name ?? ""} />
    </div>
  );
}
