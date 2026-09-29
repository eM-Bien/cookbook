"use client";

import { useRef, useState, useTransition } from "react";
import { setRecipePhoto, uploadPhoto } from "@/app/(app)/przepisy/actions";
import { resizeImage } from "@/lib/resize-image";
import type { ActionResult } from "@/lib/types";
import { Icon } from "./icons";

const UNREADABLE = "Nie udało się odczytać tego zdjęcia. Spróbuj pliku JPG lub PNG.";

/** Lets the person pick a photo, shrinks it and sends it with `send`. */
function usePhotoUpload(send: (data: FormData) => Promise<ActionResult<{ url: string }>>) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [sending, startSending] = useTransition();

  async function picked(file: File | undefined, done?: (url: string) => void) {
    if (!file) return;
    setError(null);
    setPreparing(true);
    let photo: File;
    try {
      photo = await resizeImage(file);
    } catch {
      setError(UNREADABLE);
      return;
    } finally {
      setPreparing(false);
      // Choosing the same file again should work after a failure.
      if (input.current) input.current.value = "";
    }

    startSending(async () => {
      const data = new FormData();
      data.set("photo", photo);
      const result = await send(data);
      if (result.ok) done?.(result.data.url);
      else setError(result.error);
    });
  }

  const open = () => input.current?.click();
  // The ref travels on its own so that reading the state never touches it.
  return [input, { error, busy: preparing || sending, picked, open }] as const;
}

/** Round camera button on a recipe: adds or replaces its photo at once. */
export function RecipePhotoButton({ recipeId, hasPhoto }: { recipeId: string; hasPhoto: boolean }) {
  const [input, upload] = usePhotoUpload((data) => setRecipePhoto(recipeId, data));
  const label = hasPhoto ? "Zmień zdjęcie" : "Dodaj zdjęcie";

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => upload.picked(event.target.files?.[0])}
      />
      <button
        type="button"
        className="round-btn"
        aria-label={upload.busy ? "Wysyłanie zdjęcia…" : label}
        title={label}
        disabled={upload.busy}
        onClick={upload.open}
      >
        {upload.busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="camera" size={22} />}
      </button>
      {upload.error && (
        <p className="message message-error hero-message" role="alert">
          {upload.error}
        </p>
      )}
    </>
  );
}

/** Photo block of the recipe form: upload a file or paste an address. */
export function PhotoField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [input, upload] = usePhotoUpload(uploadPhoto);
  const [pasting, setPasting] = useState(false);

  return (
    <div className="field">
      <span>Zdjęcie</span>
      <div className="photo-field">
        <span className="photo-preview" aria-hidden="true">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" referrerPolicy="no-referrer" />
          ) : (
            <Icon name="camera" size={26} />
          )}
        </span>
        <div className="row">
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => upload.picked(event.target.files?.[0], onChange)}
          />
          <button type="button" className="btn btn-sm" disabled={upload.busy} onClick={upload.open}>
            <Icon name="camera" size={16} />
            {upload.busy ? "Wysyłanie…" : value ? "Zmień zdjęcie" : "Dodaj zdjęcie"}
          </button>
          {value && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange("")}>
              Usuń
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            aria-expanded={pasting}
            onClick={() => setPasting((open) => !open)}
          >
            Wklej adres
          </button>
        </div>
      </div>
      {pasting && (
        <input
          className="input"
          type="url"
          inputMode="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://…"
          aria-label="Adres zdjęcia"
        />
      )}
      {upload.error && (
        <p className="message message-error" role="alert">
          {upload.error}
        </p>
      )}
    </div>
  );
}
