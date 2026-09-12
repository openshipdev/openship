"use client";
import { useEffect, useState } from "react";
export default function GatewayConnection() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/profile/gateway", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        return data;
      })
      .then((data) => {
        setState(data);
        if (data.status === "connected") action("check");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  async function action(action, teamId) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/profile/gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, teamId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setState(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (state?.status !== "pending" || busy || error) return;
    const timer = setTimeout(() => action("poll"), state.pollAfter || 5000);
    return () => clearTimeout(timer);
  }, [state, busy, error]);
  return (
    <section className="profile-panel" aria-label="AI Gateway connection">
      <h2>AI Gateway</h2>
      <p>
        Connect separately using fx device authorization. Vercel will show the
        client registered for fx. This does not change your OpenShip login or
        project connection.
      </p>
      {error && <p role="alert">{error}</p>}
      <div role="status" aria-live="polite">
        {!state && !error && <p>Loading connection…</p>}
        {state?.status === "disconnected" && <p>Not connected.</p>}
        {state?.status === "expired" && (
          <p>Authorization expired. Connect again.</p>
        )}
        {state?.status === "denied" && <p>Authorization was declined.</p>}
        {state?.status === "pending" && (
          <>
            <p>
              Waiting for approval. Your code: <strong>{state.userCode}</strong>
            </p>
            <a href={state.url} target="_blank" rel="noopener noreferrer">
              Open Vercel authorization ↗
            </a>
            <p>Expires at {new Date(state.expiresAt).toLocaleTimeString()}.</p>
          </>
        )}
        {state?.status === "connected" && (
          <>
            <p>Device authorization connected. Credentials stored securely.</p>
            {state.teamsError && <p role="alert">{state.teamsError}</p>}
            <label>
              AI Gateway team
              <select
                disabled={busy}
                value={state.teamId || ""}
                onChange={(e) => action("team", e.target.value)}
              >
                <option value="" disabled>
                  Select a team
                </option>
                {(state.teams || []).map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <p>
              {!state.teamId
                ? "Select a team to load its supported models."
                : state.modelCount != null
                  ? `Authenticated model catalog: ${state.modelCount} models.`
                  : `Model catalog check ${state.catalogStatus ? `returned HTTP ${state.catalogStatus}` : "unavailable"}.`}
            </p>
          </>
        )}
      </div>
      {state?.status !== "pending" && state?.status !== "connected" && (
        <button disabled={busy} onClick={() => action("start")}>
          {busy ? "Starting…" : "Connect AI Gateway via fx"}
        </button>
      )}
      {state?.status === "connected" && (
        <button disabled={busy} onClick={() => action("check")}>
          Check Gateway access
        </button>
      )}
      {state?.status === "pending" && error && (
        <button disabled={busy} onClick={() => action("poll")}>
          Resume waiting
        </button>
      )}
      {["pending", "connected"].includes(state?.status) && (
        <button disabled={busy} onClick={() => action("disconnect")}>
          {state.status === "pending" ? "Cancel" : "Disconnect from OpenShip"}
        </button>
      )}
    </section>
  );
}
