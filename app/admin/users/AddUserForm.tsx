"use client";

import { useActionState } from "react";
import { addUser } from "@/app/actions";

export default function AddUserForm() {
  const [state, action, pending] = useActionState(addUser, undefined);
  return (
    <form action={action}>
      <div className="grid-form">
        <label className="field">Email<input type="email" name="email" required placeholder="name@spyne.ai" /></label>
        <label className="field">Name<input type="text" name="name" placeholder="Optional" /></label>
        <label className="field">
          Role
          <select name="role" defaultValue="trainee">
            <option value="trainee">Trainee</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </div>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.ok && <p className="ok" role="status">{state.ok}</p>}
      <button className="btn" disabled={pending}>{pending ? "Adding…" : "Add person"}</button>
    </form>
  );
}
