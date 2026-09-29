import { RecipeContent } from "@/app/(app)/przepisy/[id]/recipe-content";
import { isUuid } from "@/lib/types";

export default async function RecipeInDrawer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return null;

  return <RecipeContent id={id} inDrawer />;
}
