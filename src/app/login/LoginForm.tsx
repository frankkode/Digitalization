"use client";
import { useActionState } from "react";
import { loginAction, type LoginState } from "../actions";

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="card" style={{ maxWidth: 420 }}>
      <input type="hidden" name="next" value={next} />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      {state.error && <div className="err">{state.error}</div>}
      <div className="row" style={{ marginTop: 14 }}>
        <button type="submit" disabled={pending}>{pending ? "Checking..." : "Log in"}</button>
      </div>
    </form>
  );
}
