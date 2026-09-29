"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { addMeal } from "@/app/(app)/kalendarz/actions";
import { Icon } from "@/components/icons";
import { Stepper } from "@/components/stepper";
import { formatDayMonth, formatWeekday } from "@/lib/dates";
import { scaleQuantity } from "@/lib/ingredients";
import { categoryLook, formatMinutes, servingsLabel } from "@/lib/look";
import { MEAL_TYPES, type Ingredient, type MealType, type Recipe } from "@/lib/types";
import { formatAmounts } from "@/lib/units";

export function RecipeView({
  recipe,
  ingredients,
  today,
}: {
  recipe: Recipe;
  ingredients: Ingredient[];
  today: string;
}) {
  const [servings, setServings] = useState(recipe.servings);
  const [date, setDate] = useState(today);
  const [mealType, setMealType] = useState<MealType>(recipe.meal_types[0] ?? "obiad");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);

  // Ingredients keep their order; a new group starts wherever the name changes.
  const groups: { name: string | null; items: Ingredient[] }[] = [];
  for (const ingredient of ingredients) {
    const name = ingredient.group_name ?? null;
    const last = groups.at(-1);
    if (last && last.name === name) last.items.push(ingredient);
    else groups.push({ name, items: [ingredient] });
  }

  function addToCalendar() {
    setError(null);
    startTransition(async () => {
      const result = await addMeal({ date, mealType, recipeId: recipe.id, servings });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAdded(date);
      dialog.current?.close();
    });
  }

  return (
    <>
      <div className="stats">
        {recipe.prep_minutes !== null && (
          <div className="stat">
            <Icon name="clock" />
            <span className="stat-label">Czas przygotowania</span>
            <span className="stat-value">{formatMinutes(recipe.prep_minutes)}</span>
          </div>
        )}
        {recipe.calories !== null && (
          <div className="stat">
            <Icon name="flame" />
            <span className="stat-label">Kalorie na porcję</span>
            <span className="stat-value">
              {recipe.calories} <small>kcal</small>
            </span>
          </div>
        )}
        <div className="stat">
          <Icon name="servings" />
          <span className="stat-label">Porcje</span>
          <span className="stat-value">
            {servings} <small>{servingsLabel(servings)}</small>
          </span>
          <Stepper value={servings} onChange={setServings} label="Liczba porcji" small />
        </div>
      </div>

      <section>
        <div className="section-title">
          <h2>Składniki ({ingredients.length})</h2>
          {servings !== recipe.servings && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setServings(recipe.servings)}
            >
              Przywróć oryginalne ({recipe.servings})
            </button>
          )}
        </div>
        <div className="stack">
          {groups.map((group) => (
            <div key={group.name ?? ""} className="stack stack-sm">
              {group.name && <h3 className="group-title">{group.name}</h3>}
              <ul className="ingredient-list">
                {group.items.map((ingredient, index) => {
                  const look = categoryLook(ingredient.category);
                  const amount = formatAmounts(
                    scaleQuantity(ingredient.quantity, recipe.servings, servings),
                    ingredient.unit,
                    scaleQuantity(ingredient.alt_quantity ?? null, recipe.servings, servings),
                    ingredient.alt_unit,
                  );
                  return (
                    <li key={index} className="ingredient-item">
                      <span className="thumb thumb-sm" data-tone={look.tone} aria-hidden="true">
                        {look.emoji}
                      </span>
                      <span className="ingredient-item-text">
                        <span className="ingredient-item-name">{ingredient.name}</span>
                        {amount && <span className="ingredient-amount">{amount}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="stack stack-sm">
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => {
            setError(null);
            dialog.current?.showModal();
          }}
        >
          <Icon name="calendar" size={18} /> Dodaj do kalendarza
        </button>
        {added && (
          <p className="message message-success" role="status">
            Dodano na {formatWeekday(added)}, {formatDayMonth(added)}.{" "}
            <Link href={`/kalendarz?widok=dzien&data=${added}`} style={{ textDecoration: "underline" }}>
              Zobacz kalendarz
            </Link>
          </p>
        )}
      </div>

      <dialog ref={dialog} aria-labelledby="plan-title">
        <form
          className="dialog-body"
          onSubmit={(event) => {
            event.preventDefault();
            addToCalendar();
          }}
        >
          <div className="dialog-head">
            <div>
              <h2 id="plan-title">Dodaj do kalendarza</h2>
              <p className="muted small">{recipe.title}</p>
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

          <label className="field">
            <span>Dzień</span>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </label>

          <fieldset className="field" style={{ border: 0 }}>
            <legend className="label" style={{ marginBottom: 6 }}>
              Posiłek
            </legend>
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

          <div className="row row-between">
            <span className="label">Porcje</span>
            <Stepper value={servings} onChange={setServings} label="Liczba porcji" />
          </div>

          {error && (
            <p className="message message-error" role="alert">
              {error}
            </p>
          )}

          <button className="btn btn-primary btn-block" disabled={pending}>
            {pending ? "Dodawanie…" : "Dodaj"}
          </button>
        </form>
      </dialog>
    </>
  );
}
