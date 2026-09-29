"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { RecipeThumb } from "@/components/recipe-thumb";
import { Stepper } from "@/components/stepper";
import { formatDayMonth, formatWeekday } from "@/lib/dates";
import { MEAL_TONE, servingsLabel } from "@/lib/look";
import { MEAL_TYPES, type MealPlanEntry, type MealType } from "@/lib/types";
import { addMeal, removeMeal, setMealServings } from "./actions";

export type RecipeOption = {
  id: string;
  title: string;
  servings: number;
  image_url: string | null;
  calories: number | null;
  meal_types: MealType[];
  tags: string[];
};

type Change =
  | { type: "servings"; id: string; servings: number }
  | { type: "remove"; id: string };

const MEAL_ORDER = MEAL_TYPES.map((meal) => meal.value);
const MEAL_LABEL = Object.fromEntries(MEAL_TYPES.map((meal) => [meal.value, meal.label]));

export function WeekPlanner({
  days,
  today,
  entries,
  recipes,
}: {
  days: string[];
  today: string;
  entries: MealPlanEntry[];
  recipes: RecipeOption[];
}) {
  const [shown, applyChange] = useOptimistic(entries, (current, change: Change) =>
    change.type === "remove"
      ? current.filter((entry) => entry.id !== change.id)
      : current.map((entry) =>
          entry.id === change.id ? { ...entry, servings: change.servings } : entry,
        ),
  );
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const dialog = useRef<HTMLDialogElement>(null);
  const [day, setDay] = useState(days[0]);
  const [search, setSearch] = useState("");
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [mealType, setMealType] = useState<MealType>("obiad");
  const [servings, setServings] = useState(2);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [adding, startAdding] = useTransition();

  function change(update: Change) {
    setError(null);
    startTransition(async () => {
      applyChange(update);
      const result =
        update.type === "remove"
          ? await removeMeal(update.id)
          : await setMealServings(update.id, update.servings);
      if (!result.ok) setError(result.error);
    });
  }

  function openDialog(forDay: string) {
    setDay(forDay);
    setSearch("");
    setRecipeId(null);
    setDialogError(null);
    dialog.current?.showModal();
  }

  function chooseRecipe(recipe: RecipeOption) {
    setRecipeId(recipe.id);
    setServings(recipe.servings);
  }

  function submit() {
    if (!recipeId) {
      setDialogError("Wybierz przepis z listy.");
      return;
    }
    setDialogError(null);
    startAdding(async () => {
      const result = await addMeal({ date: day, mealType, recipeId, servings });
      if (result.ok) dialog.current?.close();
      else setDialogError(result.error);
    });
  }

  // Without a search the list offers what suits the chosen meal; searching looks everywhere.
  const needle = search.trim().toLowerCase();
  const matching = needle
    ? recipes.filter((recipe) => recipe.title.toLowerCase().includes(needle))
    : recipes.filter(
        (recipe) => recipe.meal_types.length === 0 || recipe.meal_types.includes(mealType),
      );

  return (
    <>
      {error && (
        <p className="message message-error" role="alert">
          {error}
        </p>
      )}

      <div className="week">
        {days.map((date) => {
          const meals = shown
            .filter((entry) => entry.plan_date === date)
            .sort((a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type));
          const knownCalories = meals.filter((entry) => entry.recipe.calories !== null);
          const calories = knownCalories.reduce((sum, entry) => sum + entry.recipe.calories!, 0);
          const className = ["day", date === today && "day-today", date < today && "day-past"]
            .filter(Boolean)
            .join(" ");

          return (
            <section key={date} className={className} aria-label={formatWeekday(date)}>
              <div className="day-head">
                <span className="day-name">{formatWeekday(date)}</span>
                <span className="muted small">{formatDayMonth(date)}</span>
                {knownCalories.length > 0 && (
                  <span className="muted small" title="Suma kalorii na osobę, po jednej porcji każdego posiłku">
                    {knownCalories.length < meals.length ? "ponad " : ""}
                    {calories} kcal
                  </span>
                )}
              </div>

              {meals.map((entry) => (
                <div key={entry.id} className="meal" data-tone={MEAL_TONE[entry.meal_type]}>
                  <div className="meal-head">
                    <span className="meal-type">{MEAL_LABEL[entry.meal_type]}</span>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Usuń ${entry.recipe.title} z ${formatWeekday(date)}`}
                      onClick={() => change({ type: "remove", id: entry.id })}
                    >
                      <Icon name="close" size={15} />
                    </button>
                  </div>
                  <Link href={`/przepisy/${entry.recipe.id}`} className="meal-title">
                    {entry.recipe.title}
                  </Link>
                  <div className="meal-controls">
                    <Stepper
                      small
                      value={entry.servings}
                      onChange={(value) => change({ type: "servings", id: entry.id, servings: value })}
                      label={`Porcje: ${entry.recipe.title}`}
                    />
                    <span>{servingsLabel(entry.servings)}</span>
                  </div>
                </div>
              ))}

              <button type="button" className="btn btn-sm day-add" onClick={() => openDialog(date)}>
                <Icon name="plus" size={16} /> Dodaj
              </button>
            </section>
          );
        })}
      </div>

      <dialog ref={dialog} aria-labelledby="add-meal-title">
        <form
          className="dialog-body"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="dialog-head">
            <div>
              <h2 id="add-meal-title">Co gotujemy?</h2>
              <p className="muted small" style={{ textTransform: "capitalize" }}>
                {formatWeekday(day)}, {formatDayMonth(day)}
              </p>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Zamknij"
              onClick={() => dialog.current?.close()}
            >
              <Icon name="close" />
            </button>
          </div>

          {recipes.length === 0 ? (
            <div className="stack stack-sm">
              <p className="muted">Najpierw dodaj jakiś przepis — wtedy pojawi się tutaj.</p>
              <Link href="/nowy-przepis" className="btn btn-primary">
                Dodaj przepis
              </Link>
            </div>
          ) : (
            <>
              <fieldset style={{ border: 0 }}>
                <legend className="sr-only">Posiłek</legend>
                <div className="segmented">
                  {MEAL_TYPES.map((meal) => (
                    <label key={meal.value}>
                      <input
                        type="radio"
                        name="meal"
                        checked={mealType === meal.value}
                        onChange={() => setMealType(meal.value)}
                      />
                      <span className="chip">{meal.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="search">
                <Icon name="search" />
                <input
                  className="input"
                  style={{ background: "var(--surface-muted)" }}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Szukaj przepisu…"
                  aria-label="Szukaj przepisu"
                />
              </div>

              <div className="option-list" role="radiogroup" aria-label="Przepis">
                {matching.map((recipe) => (
                  <label key={recipe.id}>
                    <input
                      type="radio"
                      name="recipe"
                      checked={recipeId === recipe.id}
                      onChange={() => chooseRecipe(recipe)}
                    />
                    <RecipeThumb
                      title={recipe.title}
                      imageUrl={recipe.image_url}
                      tags={recipe.tags}
                      small
                    />
                    <span className="option-text">
                      <span>{recipe.title}</span>
                      {recipe.calories !== null && (
                        <span className="muted small">{recipe.calories} kcal</span>
                      )}
                    </span>
                  </label>
                ))}
                {matching.length === 0 && (
                  <p className="muted small">
                    {needle
                      ? "Brak pasujących przepisów."
                      : "Żaden przepis nie jest oznaczony na ten posiłek. Wyszukaj po nazwie."}
                  </p>
                )}
              </div>

              <div className="row row-between">
                <span className="label">Porcje</span>
                <Stepper value={servings} onChange={setServings} label="Liczba porcji" />
              </div>

              {dialogError && (
                <p className="message message-error" role="alert">
                  {dialogError}
                </p>
              )}

              <button className="btn btn-primary btn-block" disabled={adding}>
                {adding ? "Dodawanie…" : "Dodaj do kalendarza"}
              </button>
            </>
          )}
        </form>
      </dialog>
    </>
  );
}
