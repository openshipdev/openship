"use client";
import { useState } from "react";
import { authClient } from "../lib/auth-client";
export default function AccountControl() {
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(provider) {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL:
          window.location.pathname +
          window.location.search +
          window.location.hash,
      });
      if (result.error) setError(result.error.message || "Login failed.");
    } catch {
      setError("Login is unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) setError(result.error.message || "Logout failed.");
      else setOpen(false);
    } catch {
      setError("Logout is unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-control">
      {session ? (
        <button disabled={busy} onClick={logout}>
          Log out
        </button>
      ) : (
        <button aria-expanded={open} onClick={() => setOpen(!open)}>
          Log in
        </button>
      )}
      {session && error && (
        <p className="account-menu" role="alert">
          {error}
        </p>
      )}
      {open && !session && (
        <div className="account-menu">
          <p>Continue with</p>
          <button disabled={busy} onClick={() => login("github")}>
            GitHub
          </button>
          <button disabled={busy} onClick={() => login("google")}>
            Google
          </button>
          <button onClick={() => setOpen(false)}>Close</button>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
