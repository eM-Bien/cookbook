import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { addDays, isISODate, today } from "@/lib/dates";
import type { ShoppingItem, ShoppingList } from "@/lib/types";
import { ShoppingListView } from "./shopping-list";

export const metadata: Metadata = { title: "Lista zakupów" };

const ITEM_COLUMNS = "id, list_id, name, quantity, unit, alt_quantity, alt_unit, category, sources, checked, is_manual";

export default async function ShoppingPage({ searchParams }: PageProps<"/zakupy">) {
  const { supabase } = await requireUser();
  const params = await searchParams;

  const listResult = await supabase
    .from("shopping_lists")
    .select("id, date_from, date_to")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (listResult.error) throw new Error(listResult.error.message);

  const list = listResult.data as ShoppingList | null;
  let items: ShoppingItem[] = [];
  if (list) {
    const itemsResult = await supabase.from("shopping_items").select(ITEM_COLUMNS).eq("list_id", list.id);
    if (itemsResult.error) throw new Error(itemsResult.error.message);
    items = (itemsResult.data ?? []) as ShoppingItem[];
  }

  const now = today();
  const from = isISODate(params.od) ? params.od : now;
  const to = isISODate(params.do) && params.do >= from ? params.do : addDays(from, 6);

  return (
    <ShoppingListView
      list={list}
      initialItems={items}
      suggestedFrom={from}
      suggestedTo={to}
      rangeRequested={isISODate(params.od)}
    />
  );
}
