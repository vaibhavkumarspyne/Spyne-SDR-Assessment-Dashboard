"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action}>
      <label className="field">
        Email
        <input type="email" name="email" required autoComplete="email" placeholder="name@spyne.ai" />
      </label>
      <label className="field">
        Password
        <input type="password" name="password" required minLength={8} autoComplete="current-password" />
        <small>At least 8 characters.</small>
      </label>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
