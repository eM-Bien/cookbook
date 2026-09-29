"use client";

import { useOptimistic, useTransition } from "react";
import { setFavorite } from "@/app/(app)/przepisy/actions";
import { Icon } from "./icons";

export function HeartButton({
  recipeId,
  favorite,
  floating = false,
}: {
  recipeId: string;
  favorite: boolean;
  /** White round button for use on top of a photo. */
  floating?: boolean;
}) {
  const [shown, setShown] = useOptimistic(favorite);
  const [, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={floating ? "round-btn heart" : "icon-btn heart"}
      aria-pressed={shown}
      aria-label={shown ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
      title={shown ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
      onClick={() =>
        startTransition(async () => {
          setShown(!shown);
          await setFavorite(recipeId, !shown);
        })
      }
    >
      <Icon name="heart" size={floating ? 22 : 20} />
    </button>
  );
}
