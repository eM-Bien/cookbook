"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeOnBackdrop } from "@/components/close-on-backdrop";
import { Icon } from "@/components/icons";
import { formatRange } from "@/lib/dates";
import { parseIngredientLine } from "@/lib/ingredients";
import { categoryLook } from "@/lib/look";
import { compareItems } from "@/lib/shopping";
import { createClient } from "@/lib/supabase/client";
import type { ShoppingItem, ShoppingList } from "@/lib/types";
import { formatAmounts } from "@/lib/units";
import { generateShoppingList } from "./actions";

const ITEM_COLUMNS = "id, list_id, name, quantity, unit, alt_quantity, alt_unit, category, sources, checked, is_manual";
const SAVE_FAILED = "Nie udało się zapisać zmiany. Sprawdź połączenie i spróbuj ponownie.";

export function ShoppingListView({
  list,
  initialItems,
  suggestedFrom,
  suggestedTo,
  rangeRequested,
}: {
  list: ShoppingList | null;
  initialItems: ShoppingItem[];
  suggestedFrom: string;
  suggestedTo: string;
  /** The visitor came from the calendar asking for a specific week. */
  rangeRequested: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  // The server sends a fresh list after it is regenerated; adopt it.
  const [received, setReceived] = useState(initialItems);
  if (received !== initialItems) {
    setReceived(initialItems);
    setItems(initialItems);
  }
  // Asks before a new list throws away ticks and hand-written items.
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const [from, setFrom] = useState(suggestedFrom);
  const [to, setTo] = useState(suggestedTo);
  const [formOpen, setFormOpen] = useState(list === null || rangeRequested);
  const [ownedOpen, setOwnedOpen] = useState(true);
  const [newItem, setNewItem] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const listId = list?.id ?? null;

  const reload = useCallback(async () => {
    if (!listId) return;
    const { data, error: loadError } = await createClient()
      .from("shopping_items")
      .select(ITEM_COLUMNS)
      .eq("list_id", listId);
    if (!loadError && data) setItems(data as ShoppingItem[]);
  }, [listId]);

  // Show what the other person ticks or adds, as it happens.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = (action: () => void) => {
      clearTimeout(timer);
      timer = setTimeout(action, 200);
    };

    const channel = supabase
      .channel(`shopping-${listId ?? "none"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_lists" }, () =>
        later(() => router.refresh()),
      );
    if (listId) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shopping_items", filter: `list_id=eq.${listId}` },
        () => later(reload),
      );
    }
    channel.subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [listId, reload, router]);

  async function toggle(item: ShoppingItem) {
    const checked = !item.checked;
    setError(null);
    setItems((current) => current.map((i) => (i.id === item.id ? { ...i, checked } : i)));
    const { error: saveError } = await createClient()
      .from("shopping_items")
      .update({ checked })
      .eq("id", item.id);
    if (saveError) {
      setItems((current) =>
        current.map((i) => (i.id === item.id ? { ...i, checked: item.checked } : i)),
      );
      setError(SAVE_FAILED);
    }
  }

  async function addItem() {
    const parsed = parseIngredientLine(newItem);
    if (!parsed || !listId) return;
    setError(null);
    const { data, error: saveError } = await createClient()
      .from("shopping_items")
      .insert({ ...parsed, list_id: listId, is_manual: true })
      .select(ITEM_COLUMNS)
      .single();
    if (saveError || !data) {
      setError(SAVE_FAILED);
      return;
    }
    setNewItem("");
    setItems((current) =>
      current.some((i) => i.id === data.id) ? current : [...current, data as ShoppingItem],
    );
  }

  async function removeItem(item: ShoppingItem) {
    setError(null);
    setItems((current) => current.filter((i) => i.id !== item.id));
    const { error: saveError } = await createClient()
      .from("shopping_items")
      .delete()
      .eq("id", item.id);
    if (saveError) {
      setError(SAVE_FAILED);
      void reload();
    }
  }

  function generate(mode: "new" | "refresh", confirmed = false) {
    const range = mode === "refresh" && list ? [list.date_from, list.date_to] : [from, to];
    if (mode === "new" && items.length > 0 && !confirmed) {
      confirmDialog.current?.showModal();
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await generateShoppingList(range[0], range[1], mode);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.meals === 0) {
        setNotice("W tych dniach nie ma nic w kalendarzu, więc lista jest pusta.");
      }
      setFormOpen(false);
      if (rangeRequested) router.replace("/zakupy");
    });
  }

  // What is still to buy is grouped by shop section; what is already at home
  // moves to one list at the end.
  const sorted = [...items].sort(compareItems);
  const toBuy = sorted.filter((item) => !item.checked);
  const owned = sorted.filter((item) => item.checked);
  const groups = new Map<string, ShoppingItem[]>();
  for (const item of toBuy) {
    groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
  }

  // Rows rise in one after another down the page; the delay stops growing
  // after twenty rows so a long list does not keep the reader waiting.
  let order = 0;
  const row = (item: ShoppingItem) => {
    const position = Math.min(order++, 20);
    const amount = formatAmounts(item.quantity, item.unit, item.alt_quantity, item.alt_unit);
    const details = [amount, item.is_manual ? "dopisane" : item.sources.join(", ")]
      .filter(Boolean)
      .join(" · ");
    return (
      <li
        key={item.id}
        className={item.checked ? "shopping-item is-checked enter" : "shopping-item enter"}
        style={{ "--i": position } as React.CSSProperties}
      >
        <label>
          <input type="checkbox" checked={item.checked} onChange={() => void toggle(item)} />
          <span className="shopping-text">
            <span className="shopping-name">{item.name}</span>
            {details && <span className="shopping-sources">{details}</span>}
          </span>
        </label>
        {item.is_manual && (
          <button
            type="button"
            className="icon-btn"
            aria-label={`Usuń ${item.name}`}
            onClick={() => void removeItem(item)}
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Lista zakupów</h1>
          {list && <p>Na dni: {formatRange(list.date_from, list.date_to)}</p>}
        </div>
        {list && (
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => generate("refresh")}
              disabled={pending}
              title="Przelicza listę z kalendarza. Odhaczenia i dopisane pozycje zostają."
            >
              <Icon name="refresh" size={17} /> Odśwież z kalendarza
            </button>
            <button type="button" className="btn" onClick={() => setFormOpen((open) => !open)}>
              Nowa lista
            </button>
          </div>
        )}
      </div>

      {formOpen && (
        <section className="card stack">
          <div>
            <h2>{list ? "Nowa lista" : "Utwórz listę zakupów"}</h2>
            <p className="muted small">
              Składniki ze wszystkich posiłków zaplanowanych w tych dniach zostaną zsumowane.
            </p>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Od</span>
              <input
                className="input"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Do</span>
              <input
                className="input"
                type="date"
                value={to}
                min={from}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>
          <div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => generate("new")}
              disabled={pending}
            >
              {pending ? "Tworzenie…" : "Utwórz listę"}
            </button>
          </div>
        </section>
      )}

      {error && (
        <p className="message message-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="message message-success" role="status">
          {notice}
        </p>
      )}

      {list && (
        <>
          {items.length > 0 && (
            <section className="card stack stack-sm">
              <div className="row row-between">
                <strong>
                  Masz {owned.length} z {items.length}
                </strong>
                {toBuy.length > 0 && <span className="muted small">Do kupienia: {toBuy.length}</span>}
              </div>
              <div
                className="progress"
                role="progressbar"
                aria-label="Postęp zakupów"
                aria-valuemin={0}
                aria-valuemax={items.length}
                aria-valuenow={owned.length}
              >
                <div style={{ width: `${(owned.length / items.length) * 100}%` }} />
              </div>
            </section>
          )}

          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault();
              void addItem();
            }}
          >
            <input
              className="input"
              style={{ flex: 1, minWidth: 200, borderColor: "transparent", borderRadius: 999 }}
              value={newItem}
              onChange={(event) => setNewItem(event.target.value)}
              placeholder="Dopisz coś, np. 2 l mleka"
              aria-label="Nowa pozycja na liście"
              maxLength={200}
            />
            <button className="btn btn-primary" disabled={!newItem.trim()}>
              <Icon name="plus" size={17} /> Dodaj
            </button>
          </form>

          {items.length === 0 && (
            <div className="empty">
              <p>Lista jest pusta. Zaplanuj posiłki w kalendarzu albo dopisz coś ręcznie.</p>
            </div>
          )}

          {items.length > 0 && toBuy.length === 0 && (
            <div className="empty">
              <p>Masz już wszystko 🎉</p>
            </div>
          )}

          {[...groups.entries()].map(([category, groupItems]) => (
            <section key={category} className="shopping-group">
              <h2>
                <span aria-hidden="true">{categoryLook(category).emoji}</span>
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </h2>
              <ul className="shopping-items" style={{ listStyle: "none" }}>
                {groupItems.map(row)}
              </ul>
            </section>
          ))}

          {owned.length > 0 && (
            <section className="shopping-group shopping-owned" aria-label="Posiadasz">
              <h2>
                <button
                  type="button"
                  className="owned-toggle"
                  aria-expanded={ownedOpen}
                  onClick={() => setOwnedOpen((open) => !open)}
                >
                  <span aria-hidden="true">✅</span> Posiadasz ({owned.length})
                  <Icon name={ownedOpen ? "chevron-up" : "chevron-down"} size={18} />
                </button>
              </h2>
              {ownedOpen && (
                <ul className="shopping-items" style={{ listStyle: "none" }}>
                  {owned.map(row)}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <dialog
        ref={confirmDialog}
        className="dialog-mini"
        aria-labelledby="replace-list-title"
        onClick={closeOnBackdrop}
      >
        <div className="dialog-body">
          <div className="dialog-head">
            <h2 id="replace-list-title">Zastąpić listę?</h2>
            <button
              type="button"
              className="icon-btn"
              aria-label="Zamknij"
              onClick={() => confirmDialog.current?.close()}
            >
              <Icon name="close" />
            </button>
          </div>
          <p className="muted">
            Nowa lista zastąpi obecną, razem z odhaczeniami i dopisanymi pozycjami.
          </p>
          <div className="row row-end">
            <button type="button" className="btn" onClick={() => confirmDialog.current?.close()}>
              Zostaw
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                confirmDialog.current?.close();
                generate("new", true);
              }}
            >
              Utwórz nową
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
