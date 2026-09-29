"use client";

import { useActionState } from "react";
import { updateName, type ProfileState } from "./actions";

const initialState: ProfileState = { error: null, saved: false };

function Result({ state, saved }: { state: ProfileState; saved: string }) {
  if (state.error) {
    return (
      <p className="message message-error" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.saved) {
    return (
      <p className="message message-success" role="status">
        {saved}
      </p>
    );
  }
  return null;
}

export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(updateName, initialState);

  return (
    <form action={action} className="card stack">
      <h2>Twoja nazwa</h2>
      <label className="field">
        <span>Tak podpisujemy Twoje komentarze</span>
        <input className="input" name="display_name" defaultValue={name} maxLength={60} required />
      </label>
      <Result state={state} saved="Zapisano." />
      <div>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Zapisywanie…" : "Zapisz"}
        </button>
      </div>
    </form>
  );
}
