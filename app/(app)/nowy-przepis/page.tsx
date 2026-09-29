import type { Metadata } from "next";
import { RecipeForm } from "@/components/recipe-form";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Nowy przepis" };

export default async function NewRecipePage() {
  await requireUser();

  return (
    <div className="container-narrow stack" style={{ margin: "0 auto" }}>
      <h1>Nowy przepis</h1>
      <RecipeForm />
    </div>
  );
}
