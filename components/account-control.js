"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { authClient } from "../lib/auth-client";
export default function AccountControl() {
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [failedImage, setFailedImage] = useState(null);
  const controlRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();
  const user = session?.user;
  const initial = (user?.name?.trim() || user?.email || "U")
    .slice(0, 1)
    .toUpperCase();

  useEffect(() => {
    if (!open) return;
    function dismiss(event) {
      if (!controlRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);
  async function login(provider) {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.social({
        provider,
        ...(provider === "vercel"
          ? { errorCallbackURL: "/profile?error=vercel" }
          : {}),
        callbackURL:
          provider === "vercel"
            ? "/api/integrations/vercel/install"
            : window.location.pathname +
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
    <div className="account-control" ref={controlRef}>
      {session ? (
        <button
          ref={triggerRef}
          type="button"
          className="account-avatar"
          aria-label="Account menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen(!open)}
        >
          {user?.image && failedImage !== user.image ? (
            <img
              src={user.image}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setFailedImage(user.image)}
            />
          ) : (
            <span aria-hidden="true">{initial}</span>
          )}
        </button>
      ) : (
        <button
          ref={triggerRef}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen(!open)}
        >
          Log in
        </button>
      )}
      {open && session && (
        <div id={menuId} className="account-menu account-profile-menu">
          <Link href="/profile" onClick={() => setOpen(false)}>
            Profile
          </Link>
          <button disabled={busy} onClick={logout}>
            {busy ? "Logging out…" : "Log out"}
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
      {open && !session && (
        <div id={menuId} className="account-menu">
          <p>Continue with</p>
          <button disabled={busy} onClick={() => login("github")}>
            GitHub
          </button>
          <button disabled={busy} onClick={() => login("google")}>
            Google
          </button>
          <button disabled={busy} onClick={() => login("vercel")}>
            Vercel
          </button>
          <button onClick={() => setOpen(false)}>Close</button>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
