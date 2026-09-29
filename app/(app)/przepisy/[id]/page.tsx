import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/types";
import { RecipeContent } from "./recipe-content";

export const metadata: Metadata = { title: "Przepis" };

// Opened directly or after a refresh. Clicking a recipe inside the app shows
// the same content in a drawer instead: see app/(app)/@drawer.
export default async function RecipePage({ params }: PageProps<"/przepisy/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  return (
    <article className="container-narrow" style={{ margin: "0 auto" }}>
      <RecipeContent id={id} />
    </article>
  );
}
