"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { closeOnBackdrop } from "@/components/close-on-backdrop";
import { Icon } from "@/components/icons";
import { RecipeThumb } from "@/components/recipe-thumb";
import { Stepper } from "@/components/stepper";
import {
  addDays,
  dayOfMonth,
  formatDayMonth,
  formatWeekday,
  formatWeekdayShort,
} from "@/lib/dates";
import { MEAL_TONE, servingsLabel } from "@/lib/look";
import { MEAL_TYPES, type MealPlanEntry, type MealType } from "@/lib/types";
import { addMeal, removeMeal, replaceMeal, setMealServings } from "./actions";
import type { CalendarView } from "./views";

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
  | { type: "remove"; id: string }
  | { type: "replace"; id: string; recipe: RecipeOption; twoDays?: boolean };

/** What the compact list is choosing for: a meal to swap, or an empty slot to fill. */
type Picking = { date: string; meal: MealType; entry: MealPlanEntry | null };

function applyTo(entries: MealPlanEntry[], change: Change): MealPlanEntry[] {
  if (change.type === "remove") return entries.filter((entry) => entry.id !== change.id);
  return entries.map((entry) => {
    if (entry.id !== change.id) return entry;
    if (change.type === "servings") return { ...entry, servings: change.servings };
    const { id, title, servings, calories, image_url, tags } = change.recipe;
    return { ...entry, recipe: { id, title, servings, calories, image_url, tags } };
  });
}

const MEAL_ORDER = MEAL_TYPES.map((meal) => meal.value);
const MEAL_LABEL = Object.fromEntries(MEAL_TYPES.map((meal) => [meal.value, meal.label]));
const MEAL_OBJECT = Object.fromEntries(MEAL_TYPES.map((meal) => [meal.value, meal.object]));

/** "1549 kcal", or "ponad 1085 kcal" when some meals have no calories given. */
function caloriesOf(meals: MealPlanEntry[]): string | null {
  const known = meals.filter((entry) => entry.recipe.calories !== null);
  if (known.length === 0) return null;
  const total = known.reduce((sum, entry) => sum + entry.recipe.calories!, 0);
  return `${known.length < meals.length ? "ponad " : ""}${total} kcal`;
}

const CALORIES_HINT = "Suma kalorii na osobę, po jednej porcji każdego posiłku";

export function Planner({
  view,
  days,
  month,
  today,
  entries,
  recipes,
}: {
  view: CalendarView;
  /** Days to show, in order. A month comes as whole weeks. */
  days: string[];
  /** "2026-10" in the month view, to tell its days from the neighbours'. */
  month: string;
  today: string;
  entries: MealPlanEntry[];
  recipes: RecipeOption[];
}) {
  const [shown, applyChange] = useOptimistic(entries, applyTo);
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

  const picker = useRef<HTMLDialogElement>(null);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerError, setPickerError] = useState<string | null>(null);
  // A lunch is often cooked for two days; the choice then lands on both.
  const [twoDays, setTwoDays] = useState(false);

  function change(update: Change) {
    setError(null);
    startTransition(async () => {
      applyChange(update);
      const result =
        update.type === "remove"
          ? await removeMeal(update.id)
          : update.type === "replace"
            ? await replaceMeal(update.id, update.recipe.id, update.twoDays)
            : await setMealServings(update.id, update.servings);
      if (!result.ok) setError(result.error);
    });
  }

  function openDialog(forDay: string) {
    setDay(forDay);
    setTwoDays(false);
    setSearch("");
    setRecipeId(null);
    setDialogError(null);
    dialog.current?.showModal();
  }

  function openPicker(target: Picking) {
    setPicking(target);
    setPickerSearch("");
    setPickerError(null);
    setTwoDays(false);
    picker.current?.showModal();
  }

  function pick(recipe: RecipeOption) {
    if (!picking) return;
    const spansTwoDays = picking.meal === "obiad" && twoDays;
    if (picking.entry) {
      change({ type: "replace", id: picking.entry.id, recipe, twoDays: spansTwoDays });
      picker.current?.close();
      return;
    }
    setPickerError(null);
    startAdding(async () => {
      const result = await addMeal({
        date: picking.date,
        mealType: picking.meal,
        recipeId: recipe.id,
        servings: recipe.servings,
        twoDays: spansTwoDays,
      });
      if (result.ok) picker.current?.close();
      else setPickerError(result.error);
    });
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
      const result = await addMeal({
        date: day,
        mealType,
        recipeId,
        servings,
        twoDays: mealType === "obiad" && twoDays,
      });
      if (result.ok) dialog.current?.close();
      else setDialogError(result.error);
    });
  }

  const mealsOn = (date: string) =>
    shown
      .filter((entry) => entry.plan_date === date)
      .sort((a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type));

  const dayClass = (date: string, base: string) =>
    [base, date === today && "day-today", date < today && "day-past"].filter(Boolean).join(" ");

  const mealCard = (entry: MealPlanEntry, withPhoto = false) => (
    <div key={entry.id} className="meal" data-tone={MEAL_TONE[entry.meal_type]}>
      <div className="meal-head">
        <span className="meal-type">{MEAL_LABEL[entry.meal_type]}</span>
        <span className="meal-actions">
          {/* The day view has a labelled "Zamień" button below instead. */}
          {!withPhoto && (
            <button
              type="button"
              className="icon-btn"
              aria-label={`Zamień ${entry.recipe.title}`}
              title="Zamień"
              onClick={() =>
                openPicker({ date: entry.plan_date, meal: entry.meal_type, entry })
              }
            >
              <Icon name="refresh" size={15} />
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label={`Usuń ${entry.recipe.title} z ${formatWeekday(entry.plan_date)}`}
            title="Usuń"
            onClick={() => change({ type: "remove", id: entry.id })}
          >
            <Icon name="close" size={15} />
          </button>
        </span>
      </div>
      <div className="meal-main">
        {withPhoto && (
          <RecipeThumb
            title={entry.recipe.title}
            imageUrl={entry.recipe.image_url}
            tags={entry.recipe.tags}
          />
        )}
        <div className="meal-text">
          <Link href={`/przepisy/${entry.recipe.id}`} className="meal-title">
            {entry.recipe.title}
          </Link>
          {withPhoto && entry.recipe.calories !== null && (
            <span className="small meal-calories">{entry.recipe.calories} kcal na porcję</span>
          )}
          <div className="meal-controls">
            <Stepper
              small
              value={entry.servings}
              onChange={(value) => change({ type: "servings", id: entry.id, servings: value })}
              label={`Porcje: ${entry.recipe.title}`}
            />
            <span>{servingsLabel(entry.servings)}</span>
            {withPhoto && (
              <button
                type="button"
                className="btn btn-sm meal-swap"
                aria-label={`Zamień ${entry.recipe.title}`}
                onClick={() =>
                  openPicker({ date: entry.plan_date, meal: entry.meal_type, entry })
                }
              >
                <Icon name="refresh" size={15} /> Zamień
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  /** "Na dwa dni" for a lunch: the same dish again the day after. */
  const twoDaysOption = (date: string, meal: MealType) =>
    meal === "obiad" && (
      <label className="two-days">
        <input
          type="checkbox"
          checked={twoDays}
          onChange={(event) => setTwoDays(event.target.checked)}
        />
        <span>
          Na dwa dni <span className="muted">(też {formatWeekday(addDays(date, 1))})</span>
        </span>
      </label>
    );

  const pickerNeedle = pickerSearch.trim().toLowerCase();
  const pickable = recipes.filter((recipe) =>
    pickerNeedle
      ? recipe.title.toLowerCase().includes(pickerNeedle)
      : picking && (recipe.meal_types.length === 0 || recipe.meal_types.includes(picking.meal)),
  );

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

      {view === "tydzien" && (
        <div className="week">
          {days.map((date) => {
            const meals = mealsOn(date);
            const calories = caloriesOf(meals);
            return (
              <section key={date} className={dayClass(date, "day")} aria-label={formatWeekday(date)}>
                <div className="day-head">
                  <Link href={`/kalendarz?widok=dzien&data=${date}`} className="day-name">
                    {formatWeekday(date)}
                  </Link>
                  <span className="muted small">{formatDayMonth(date)}</span>
                  {calories && (
                    <span className="muted small" title={CALORIES_HINT}>
                      {calories}
                    </span>
                  )}
                </div>
                {meals.map((entry) => mealCard(entry))}
                <button type="button" className="btn btn-sm day-add" onClick={() => openDialog(date)}>
                  <Icon name="plus" size={16} /> Dodaj
                </button>
              </section>
            );
          })}
        </div>
      )}

      {view === "dzien" &&
        days.map((date) => {
          const meals = mealsOn(date);
          const calories = caloriesOf(meals);
          return (
            <section key={date} className={dayClass(date, "day day-single")} aria-label={formatWeekday(date)}>
              {calories && (
                <p className="muted" title={CALORIES_HINT}>
                  Razem {calories}
                </p>
              )}
              {MEAL_TYPES.map((slot) => {
                const inSlot = meals.filter((entry) => entry.meal_type === slot.value);
                // Snacks are optional, so an empty slot for them would only add noise.
                if (inSlot.length === 0 && slot.value === "przekaska" && meals.length > 0) return null;
                return (
                  <div key={slot.value} className="slot">
                    <h2 className="slot-title">{slot.label}</h2>
                    <div className="slot-meals">
                      {inSlot.map((entry) => mealCard(entry, true))}
                      {inSlot.length === 0 && (
                        <button
                          type="button"
                          className="btn btn-sm day-add"
                          onClick={() => openPicker({ date, meal: slot.value, entry: null })}
                        >
                          <Icon name="plus" size={16} /> Dodaj {slot.object}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}

      {view === "miesiac" && (
        <div className="month" role="grid" aria-label="Miesiąc">
          <div className="month-row month-head" role="row">
            {days.slice(0, 7).map((date) => (
              <span key={date} role="columnheader">
                {formatWeekdayShort(date)}
              </span>
            ))}
          </div>
          {Array.from({ length: days.length / 7 }, (_, week) => (
            <div key={week} className="month-row" role="row">
              {days.slice(week * 7, week * 7 + 7).map((date) => {
                const meals = mealsOn(date);
                const calories = caloriesOf(meals);
                const outside = !date.startsWith(month);
                return (
                  <div
                    key={date}
                    role="gridcell"
                    className={dayClass(date, outside ? "month-day is-outside" : "month-day")}
                  >
                    <div className="month-day-head">
                      <Link
                        href={`/kalendarz?widok=dzien&data=${date}`}
                        className="month-number"
                        aria-label={`${formatWeekday(date)}, ${formatDayMonth(date)}${
                          meals.length > 0 ? `, posiłków: ${meals.length}` : ""
                        }`}
                      >
                        {dayOfMonth(date)}
                      </Link>
                      {calories && (
                        <span className="muted month-calories" title={CALORIES_HINT}>
                          {calories}
                        </span>
                      )}
                      <button
                        type="button"
                        className="icon-btn month-add"
                        aria-label={`Dodaj posiłek: ${formatDayMonth(date)}`}
                        onClick={() => openDialog(date)}
                      >
                        <Icon name="plus" size={15} />
                      </button>
                    </div>
                    <ul className="month-meals">
                      {meals.map((entry) => (
                        <li key={entry.id} data-tone={MEAL_TONE[entry.meal_type]}>
                          <Link
                            href={`/przepisy/${entry.recipe.id}`}
                            title={`${MEAL_LABEL[entry.meal_type]}: ${entry.recipe.title}`}
                          >
                            {entry.recipe.title}
                          </Link>
                          <button
                            type="button"
                            className="icon-btn month-swap"
                            aria-label={`Zamień ${entry.recipe.title}`}
                            title="Zamień"
                            onClick={() =>
                              openPicker({ date, meal: entry.meal_type, entry })
                            }
                          >
                            <Icon name="refresh" size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <dialog
        ref={picker}
        className="dialog-mini"
        aria-labelledby="picker-title"
        onClick={closeOnBackdrop}
      >
        <div className="dialog-body">
          <div className="dialog-head">
            <div>
              <h2 id="picker-title">
                {picking?.entry ? "Zamień" : "Dodaj"}{" "}
                {picking && MEAL_OBJECT[picking.meal]}
              </h2>
              {picking?.entry && <p className="muted small">Teraz: {picking.entry.recipe.title}</p>}
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Zamknij"
              onClick={() => picker.current?.close()}
            >
              <Icon name="close" />
            </button>
          </div>

          <div className="search">
            <Icon name="search" />
            <input
              className="input"
              style={{ background: "var(--surface-muted)" }}
              type="search"
              value={pickerSearch}
              onChange={(event) => setPickerSearch(event.target.value)}
              placeholder="Szukaj we wszystkich przepisach…"
              aria-label="Szukaj przepisu"
            />
          </div>

          {picking && twoDaysOption(picking.date, picking.meal)}

          <ul className="pick-list" aria-label="Przepisy do wyboru">
            {pickable.map((recipe) => {
              const current = picking?.entry?.recipe.id === recipe.id;
              return (
                <li key={recipe.id}>
                  <button
                    type="button"
                    className="pick"
                    disabled={current || adding}
                    aria-current={current ? "true" : undefined}
                    onClick={() => pick(recipe)}
                  >
                    <RecipeThumb
                      title={recipe.title}
                      imageUrl={recipe.image_url}
                      tags={recipe.tags}
                      small
                    />
                    <span className="option-text">
                      <span>{recipe.title}</span>
                      <span className="muted small">
                        {current
                          ? "wybrane teraz"
                          : recipe.calories !== null
                            ? `${recipe.calories} kcal`
                            : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {pickable.length === 0 && (
              <li className="muted small">
                {pickerNeedle
                  ? "Brak pasujących przepisów."
                  : "Żaden przepis nie jest oznaczony na ten posiłek. Wyszukaj po nazwie."}
              </li>
            )}
          </ul>

          {pickerError && (
            <p className="message message-error" role="alert">
              {pickerError}
            </p>
          )}
        </div>
      </dialog>

      <dialog ref={dialog} aria-labelledby="add-meal-title" onClick={closeOnBackdrop}>
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

              {twoDaysOption(day, mealType)}

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
