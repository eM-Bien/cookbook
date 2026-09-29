"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { deleteRecipe } from "../actions";

export function DeleteRecipeButton({ recipeId, title }: { recipeId: string; title: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    const question = `Usunąć przepis „${title}”? Zniknie też z kalendarza, razem z komentarzami.`;
    if (!window.confirm(question)) return;
    startTransition(async () => {
      const result = await deleteRecipe(recipeId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <>
      <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={remove}>
        <Icon name="trash" size={16} /> {pending ? "Usuwanie…" : "Usuń"}
      </button>
      {error && (
        <p className="message message-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
