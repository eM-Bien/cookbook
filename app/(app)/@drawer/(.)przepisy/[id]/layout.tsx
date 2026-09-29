import { Drawer } from "@/components/drawer";
import { isUuid } from "@/lib/types";

// The drawer lives in the layout so it opens at once and stays in place while
// the recipe loads inside it.
export default async function RecipeDrawerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Only a recipe id opens the drawer; anything else with this shape is ignored.
  if (!isUuid(id)) return null;

  return <Drawer label="Przepis">{children}</Drawer>;
}
