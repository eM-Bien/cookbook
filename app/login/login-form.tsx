"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

const initialState: LoginState = { error: null, email: "", name: "", askName: false };

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initialState);

  return (
    <form action={action} className="stack">
      <label className="field">
        <span>E-mail</span>
        <input
          className="input"
          type="email"
          name="email"
          autoComplete="email"
          defaultValue={state.email}
          readOnly={state.askName}
          required
        />
      </label>
      {state.askName && (
        <label className="field">
          <span>Jak mamy Cię podpisywać?</span>
          <input
            className="input"
            name="name"
            autoComplete="nickname"
            defaultValue={state.name}
            maxLength={60}
            placeholder="np. Ola"
            autoFocus
            required
          />
        </label>
      )}
      {state.error && (
        <p className="message message-error" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Logowanie…" : state.askName ? "Zapisz i wejdź" : "Wejdź"}
      </button>
    </form>
  );
}
