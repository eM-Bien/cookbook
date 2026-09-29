"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { formatDateTime } from "@/lib/dates";
import { initials } from "@/lib/look";
import type { RecipeComment } from "@/lib/types";
import { addComment, deleteComment } from "../actions";

export function Comments({
  recipeId,
  comments,
  userId,
}: {
  recipeId: string;
  comments: RecipeComment[];
  userId: string;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await addComment(recipeId, body);
      if (result.ok) setBody("");
      else setError(result.error);
    });
  }

  function remove(id: string) {
    if (!window.confirm("Usunąć ten komentarz?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteComment(id, recipeId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <section>
      <h2 className="section-title">Komentarze ({comments.length})</h2>
      <div className="stack stack-sm">
        {comments.map((comment) => (
          <div key={comment.id} className="comment">
            <span className="avatar" aria-hidden="true">
              {initials(comment.author_name)}
            </span>
            <div className="comment-main">
              <div className="row">
                <strong>{comment.author_name}</strong>
                <span className="muted small">{formatDateTime(comment.created_at)}</span>
              </div>
              <p className="comment-body">{comment.body}</p>
            </div>
            {comment.author_id === userId && (
              <button
                type="button"
                className="icon-btn"
                aria-label="Usuń komentarz"
                disabled={pending}
                onClick={() => remove(comment.id)}
              >
                <Icon name="trash" size={17} />
              </button>
            )}
          </div>
        ))}

        <form
          className="stack stack-sm"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <textarea
            className="input"
            rows={3}
            maxLength={2000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Jak wyszło? Co zmienić następnym razem?"
            aria-label="Nowy komentarz"
          />
          {error && (
            <p className="message message-error" role="alert">
              {error}
            </p>
          )}
          <div>
            <button className="btn btn-primary" disabled={pending || !body.trim()}>
              {pending ? "Wysyłanie…" : "Dodaj komentarz"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
