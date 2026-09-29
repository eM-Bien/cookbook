"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { importRecipe, saveRecipe } from "@/app/(app)/przepisy/actions";
import { guessCategory, parseIngredientLines } from "@/lib/ingredients";
import {
  CATEGORIES,
  MEAL_TYPES,
  type Ingredient,
  type MealType,
  type RecipeDraft,
} from "@/lib/types";
import { UNITS } from "@/lib/units";
import { Icon } from "./icons";
import { PhotoField } from "./photo-picker";
import { Stepper } from "./stepper";

type IngredientRow = {
  key: number;
  name: string;
  quantity: string;
  unit: string;
  category: string;
  /** Once chosen by hand, the category no longer follows the name. */
  categoryChosen: boolean;
  altQuantity: string;
  altUnit: string;
  group: string;
  /** Whether the household measure and group fields are shown. */
  expanded: boolean;
};

type StepRow = { key: number; text: string };

const EMPTY: RecipeDraft = {
  title: "",
  description: "",
  servings: 2,
  prep_minutes: null,
  calories: null,
  source_url: "",
  image_url: "",
  tags: [],
  steps: [],
  meal_types: [],
  notes: "",
  ingredients: [],
};

function toText(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : value.toString().replace(".", ",");
}

// Keys only tell React which row is which; they never reach the server.
let keyCounter = 0;
const newKey = () => keyCounter++;

function parseQuantity(text: string): number | null | "invalid" {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fraction = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
  const value = fraction
    ? Number(fraction[1]) / Number(fraction[2])
    : Number(trimmed.replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : "invalid";
}

export function RecipeForm({
  recipeId = null,
  initial = EMPTY,
}: {
  recipeId?: string | null;
  initial?: RecipeDraft;
}) {
  const toRow = (ingredient?: Ingredient): IngredientRow => ({
    key: newKey(),
    name: ingredient?.name ?? "",
    quantity: toText(ingredient?.quantity),
    unit: ingredient?.unit ?? "",
    category: ingredient?.category ?? "inne",
    categoryChosen: Boolean(ingredient),
    altQuantity: toText(ingredient?.alt_quantity),
    altUnit: ingredient?.alt_unit ?? "",
    group: ingredient?.group_name ?? "",
    expanded: Boolean(ingredient?.alt_quantity ?? ingredient?.group_name),
  });
  const toRows = (list: Ingredient[]) => (list.length > 0 ? list.map(toRow) : [toRow()]);
  const toSteps = (list: string[]): StepRow[] =>
    (list.length > 0 ? list : [""]).map((text) => ({ key: newKey(), text }));

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [servings, setServings] = useState(initial.servings);
  const [minutes, setMinutes] = useState(initial.prep_minutes?.toString() ?? "");
  const [calories, setCalories] = useState(initial.calories?.toString() ?? "");
  const [mealTypes, setMealTypes] = useState<MealType[]>(initial.meal_types);
  const [notes, setNotes] = useState(initial.notes);
  const [sourceUrl, setSourceUrl] = useState(initial.source_url);
  const [imageUrl, setImageUrl] = useState(initial.image_url);
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [rows, setRows] = useState(() => toRows(initial.ingredients));
  const [steps, setSteps] = useState(() => toSteps(initial.steps));

  const [importUrl, setImportUrl] = useState("");
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pasted, setPasted] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, startImport] = useTransition();
  const [saving, startSave] = useTransition();

  function fill(draft: RecipeDraft) {
    setTitle(draft.title);
    setDescription(draft.description);
    setServings(draft.servings);
    setMinutes(draft.prep_minutes?.toString() ?? "");
    setCalories(draft.calories?.toString() ?? "");
    setMealTypes(draft.meal_types);
    setNotes(draft.notes);
    setSourceUrl(draft.source_url);
    setImageUrl(draft.image_url);
    setTags(draft.tags.join(", "));
    setRows(toRows(draft.ingredients));
    setSteps(toSteps(draft.steps));
  }

  function runImport() {
    setImportMessage(null);
    startImport(async () => {
      const result = await importRecipe(importUrl);
      if (!result.ok) {
        setImportMessage({ ok: false, text: result.error });
        return;
      }
      fill(result.data);
      setImportMessage({
        ok: true,
        text: "Przepis wczytany. Sprawdź składniki i ilości, zanim zapiszesz.",
      });
    });
  }

  function updateRow(key: number, change: Partial<IngredientRow>) {
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...change };
        if (change.name !== undefined && !next.categoryChosen) {
          next.category = guessCategory(change.name);
        }
        return next;
      }),
    );
  }

  function addPasted() {
    const parsed = parseIngredientLines(pasted);
    if (parsed.length === 0) return;
    setRows((current) => [...current.filter((row) => row.name.trim()), ...parsed.map(toRow)]);
    setPasted("");
    setPasteOpen(false);
  }

  function submit() {
    setError(null);

    const ingredients: Ingredient[] = [];
    for (const row of rows) {
      const name = row.name.trim();
      if (!name) continue;
      const quantity = parseQuantity(row.quantity);
      if (quantity === "invalid") {
        setError(`Ilość przy składniku „${name}” musi być liczbą, np. 2 lub 0,5.`);
        return;
      }
      const altQuantity = parseQuantity(row.altQuantity);
      if (altQuantity === "invalid") {
        setError(`Miara domowa przy składniku „${name}” musi być liczbą, np. 2 lub 0,5.`);
        return;
      }
      ingredients.push({
        name,
        quantity,
        unit: row.unit || null,
        category: row.category,
        alt_quantity: altQuantity,
        alt_unit: altQuantity === null ? null : row.altUnit || null,
        group_name: row.group.trim() || null,
      });
    }

    const trimmedMinutes = minutes.trim();
    const prepMinutes = trimmedMinutes ? Number(trimmedMinutes) : null;
    if (prepMinutes !== null && (!Number.isInteger(prepMinutes) || prepMinutes < 0)) {
      setError("Czas przygotowania podaj w pełnych minutach, np. 45.");
      return;
    }

    const trimmedCalories = calories.trim();
    const kcal = trimmedCalories ? Number(trimmedCalories) : null;
    if (kcal !== null && (!Number.isInteger(kcal) || kcal < 0)) {
      setError("Kalorie podaj jako liczbę całkowitą, np. 520.");
      return;
    }

    const draft: RecipeDraft = {
      title,
      description,
      servings,
      prep_minutes: prepMinutes,
      calories: kcal,
      meal_types: mealTypes,
      notes,
      source_url: sourceUrl,
      image_url: imageUrl,
      tags: tags.split(","),
      steps: steps.map((step) => step.text),
      ingredients,
    };

    startSave(async () => {
      const result = await saveRecipe(recipeId, draft);
      // On success the action redirects to the recipe, so only errors come back.
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {recipeId === null && (
        <section className="card stack stack-sm">
          <h2>Wczytaj z internetu</h2>
          <p className="muted small">
            Wklej adres strony z przepisem — nazwa, składniki i kroki uzupełnią się same.
          </p>
          <div className="row">
            <input
              className="input"
              style={{ flex: 1, minWidth: 200 }}
              type="url"
              inputMode="url"
              value={importUrl}
              onChange={(event) => setImportUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (importUrl.trim()) runImport();
                }
              }}
              placeholder="https://…"
              aria-label="Adres strony z przepisem"
            />
            <button
              type="button"
              className="btn"
              onClick={runImport}
              disabled={importing || !importUrl.trim()}
            >
              {importing ? "Wczytywanie…" : "Wczytaj"}
            </button>
          </div>
          {importMessage && (
            <p
              className={importMessage.ok ? "message message-success" : "message message-error"}
              role="status"
            >
              {importMessage.text}
            </p>
          )}
        </section>
      )}

      <section className="card stack">
        <label className="field">
          <span>Nazwa</span>
          <input
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            required
          />
        </label>
        <label className="field">
          <span>Krótki opis (opcjonalnie)</span>
          <textarea
            className="input"
            rows={2}
            maxLength={1000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <fieldset className="field" style={{ border: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}>
            Na jaki posiłek?
          </legend>
          <div className="segmented">
            {MEAL_TYPES.map((type) => (
              <label key={type.value}>
                <input
                  type="checkbox"
                  checked={mealTypes.includes(type.value)}
                  onChange={(event) =>
                    setMealTypes((current) =>
                      event.target.checked
                        ? [...current, type.value]
                        : current.filter((value) => value !== type.value),
                    )
                  }
                />
                <span className="chip">{type.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-grid">
          <div className="field">
            <span>Porcje</span>
            <div>
              <Stepper value={servings} onChange={setServings} label="Liczba porcji" />
            </div>
          </div>
          <label className="field">
            <span>Czas przygotowania (minuty)</span>
            <input
              className="input"
              inputMode="numeric"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              placeholder="np. 45"
            />
          </label>
          <label className="field">
            <span>Kalorie na porcję</span>
            <input
              className="input"
              inputMode="numeric"
              value={calories}
              onChange={(event) => setCalories(event.target.value)}
              placeholder="np. 520"
            />
          </label>
          <label className="field">
            <span>Rodzaj dania (po przecinku)</span>
            <input
              className="input"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="owsianki, wege, na słodko"
            />
          </label>
        </div>
        <div className="form-grid">
          <PhotoField value={imageUrl} onChange={setImageUrl} />
          <label className="field">
            <span>Źródło przepisu (opcjonalnie)</span>
            <input
              className="input"
              type="url"
              inputMode="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://…"
            />
          </label>
        </div>
      </section>

      <section className="card stack">
        <div className="row row-between">
          <h2>Składniki</h2>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setPasteOpen((open) => !open)}
            aria-expanded={pasteOpen}
          >
            Wklej kilka naraz
          </button>
        </div>

        {pasteOpen && (
          <div className="stack stack-sm">
            <textarea
              className="input"
              rows={5}
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              placeholder={"Każdy składnik w osobnej linii, np.:\n500 g mąki\n2 łyżki masła\n3 jajka"}
              aria-label="Lista składników do wklejenia"
            />
            <div>
              <button type="button" className="btn btn-sm" onClick={addPasted} disabled={!pasted.trim()}>
                Dodaj do listy
              </button>
            </div>
          </div>
        )}

        <div className="stack stack-sm">
          {rows.map((row) => (
            <div key={row.key} className="stack stack-sm">
            <div className="ingredient-row">
              <input
                className="input"
                inputMode="decimal"
                value={row.quantity}
                onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                placeholder="Ilość"
                aria-label="Ilość"
              />
              <select
                className="input"
                value={row.unit}
                onChange={(event) => updateRow(row.key, { unit: event.target.value })}
                aria-label="Jednostka"
              >
                <option value="">(bez jednostki)</option>
                {UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
              <input
                className="input ingredient-name"
                value={row.name}
                onChange={(event) => updateRow(row.key, { name: event.target.value })}
                placeholder="Składnik, np. mąka pszenna"
                aria-label="Nazwa składnika"
                maxLength={200}
              />
              <select
                className="input ingredient-category"
                value={row.category}
                onChange={(event) =>
                  updateRow(row.key, { category: event.target.value, categoryChosen: true })
                }
                aria-label="Dział w sklepie"
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="icon-btn ingredient-more"
                aria-label={`Miara domowa i grupa: ${row.name}`}
                aria-expanded={row.expanded}
                title="Miara domowa i grupa"
                onClick={() => updateRow(row.key, { expanded: !row.expanded })}
              >
                <Icon name={row.expanded ? "minus" : "plus"} size={16} />
              </button>
              <button
                type="button"
                className="icon-btn ingredient-remove"
                aria-label={`Usuń składnik ${row.name}`}
                onClick={() =>
                  setRows((current) =>
                    current.length > 1 ? current.filter((r) => r.key !== row.key) : [toRow()],
                  )
                }
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            {row.expanded && (
              <div className="ingredient-extra">
                <input
                  className="input"
                  inputMode="decimal"
                  value={row.altQuantity}
                  onChange={(event) => updateRow(row.key, { altQuantity: event.target.value })}
                  placeholder="Miara"
                  aria-label="Miara domowa: ilość"
                />
                <select
                  className="input"
                  value={row.altUnit}
                  onChange={(event) => updateRow(row.key, { altUnit: event.target.value })}
                  aria-label="Miara domowa: jednostka"
                >
                  <option value="">(sztuki)</option>
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <input
                  className="input ingredient-group"
                  value={row.group}
                  onChange={(event) => updateRow(row.key, { group: event.target.value })}
                  placeholder="Część przepisu, np. Sos"
                  aria-label="Część przepisu"
                  maxLength={60}
                />
              </div>
            )}
            </div>
          ))}
        </div>
        <div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setRows((current) => [...current, toRow()])}
          >
            <Icon name="plus" size={16} /> Dodaj składnik
          </button>
        </div>
      </section>

      <section className="card stack">
        <h2>Przygotowanie</h2>
        <div className="stack stack-sm">
          {steps.map((step, index) => (
            <div key={step.key} className="step-row">
              <span className="step-number">{index + 1}</span>
              <textarea
                className="input"
                rows={2}
                maxLength={3000}
                value={step.text}
                onChange={(event) =>
                  setSteps((current) =>
                    current.map((s) => (s.key === step.key ? { ...s, text: event.target.value } : s)),
                  )
                }
                placeholder="Opisz ten krok…"
                aria-label={`Krok ${index + 1}`}
              />
              <button
                type="button"
                className="icon-btn"
                style={{ marginTop: 6 }}
                aria-label={`Usuń krok ${index + 1}`}
                onClick={() =>
                  setSteps((current) =>
                    current.length > 1 ? current.filter((s) => s.key !== step.key) : toSteps([]),
                  )
                }
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          ))}
        </div>
        <div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setSteps((current) => [...current, { key: newKey(), text: "" }])}
          >
            <Icon name="plus" size={16} /> Dodaj krok
          </button>
        </div>
      </section>

      <section className="card stack">
        <h2>Wskazówki</h2>
        <textarea
          className="input"
          rows={3}
          maxLength={3000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Zamienniki, podpowiedzi, co warto zmienić następnym razem…"
          aria-label="Wskazówki"
        />
      </section>

      {error && (
        <p className="message message-error" role="alert">
          {error}
        </p>
      )}

      <div className="row">
        <button className="btn btn-primary" disabled={saving}>
          {saving ? "Zapisywanie…" : "Zapisz przepis"}
        </button>
        <Link href={recipeId ? `/przepisy/${recipeId}` : "/przepisy"} className="btn btn-ghost">
          Anuluj
        </Link>
      </div>
    </form>
  );
}
