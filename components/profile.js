"use client";
import { useEffect, useState } from "react";
import GatewayConnection from "./gateway-connection";
import { authClient } from "../lib/auth-client";

export default function Profile({
  loginError = false,
  integrationError = false,
}) {
  const { data: session, isPending } = authClient.useSession();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [installationId, setInstallationId] = useState("");
  const [until, setUntil] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    setProfile(null);
    if (!session?.user.id) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/profile?${new URLSearchParams({ installationId, until })}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!controller.signal.aborted) setProfile(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(error.message || "Unable to load your profile.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [session?.user.id, revision, installationId, until]);
  async function login() {
    setBusy(true);
    setError("");
    try {
      // Explicitly switch accounts; automatic account linking remains disabled.
      if (session) {
        const out = await authClient.signOut();
        if (out.error) throw new Error(out.error.message);
      }
      const result = await authClient.signIn.social({
        provider: "vercel",
        callbackURL: "/api/integrations/vercel/install",
        errorCallbackURL: "/profile?error=vercel",
      });
      if (result.error) throw new Error(result.error.message);
    } catch (error) {
      setError(error.message || "Vercel login is unavailable.");
    } finally {
      setBusy(false);
    }
  }
  const projects = (profile?.projects || []).filter((project) =>
    `${project.id} ${project.name}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="profile-content">
      {isPending ? (
        <p role="status">Loading your account…</p>
      ) : session ? (
        <section className="profile-panel">
          <h2>{session.user.name}</h2>
          <p>{session.user.email}</p>
        </section>
      ) : (
        <p>Log in with Vercel to see your Vercel projects.</p>
      )}
      {!isPending && !session && (
        <button disabled={busy} onClick={login}>
          {busy ? "Connecting…" : "Log in with Vercel"}
        </button>
      )}
      {session && (
        <a href="/api/integrations/vercel/install">
          {profile?.connected
            ? "Manage Vercel connection"
            : "Connect Vercel projects"}
        </a>
      )}
      {integrationError && (
        <p role="alert">
          The Vercel installation could not be completed. Check the integration
          credentials and callback URL, then connect again using the same Vercel
          account as your login.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {loginError && (
        <p role="alert">Vercel login did not complete. Please try again.</p>
      )}
      {loading && <p role="status">Loading Vercel projects…</p>}
      {session && !loading && (
        <button
          disabled={busy}
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh profile
        </button>
      )}
      {session && <GatewayConnection key={session.user.id} />}
      {session && profile?.connected && (
        <>
          <section className="profile-panel">
            {profile.installations.length > 1 && (
              <label>
                Installation{" "}
                <select
                  value={profile.installationId}
                  onChange={(event) => {
                    setInstallationId(event.target.value);
                    setUntil("");
                    setQuery("");
                  }}
                >
                  {profile.installations.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.teamId || "Personal account"} — {i.id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="section-heading">
              <h2>Vercel projects</h2>
              {!profile.projectsError && (
                <span>{profile.projects.length} projects on this page</span>
              )}
            </div>
            {profile.warnings?.map((warning) => (
              <p role="status" key={warning}>
                {warning}
              </p>
            ))}
            {profile.projectsError ? (
              <p role="alert">{profile.projectsError}</p>
            ) : (
              <>
                <label htmlFor="project-search">Search this page</label>
                <input
                  id="project-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by project name"
                />
                <ul className="profile-projects">
                  {projects.map((project) => (
                    <li key={project.id}>
                      <strong>{project.name}</strong>
                      <code>{project.id}</code>
                      <span>{project.framework || "Other framework"}</span>
                      {project.createdAt && (
                        <time
                          dateTime={new Date(project.createdAt).toISOString()}
                        >
                          {new Date(project.createdAt).toLocaleString()}
                        </time>
                      )}
                    </li>
                  ))}
                </ul>
                <nav className="pagination" aria-label="Project pages">
                  {until && (
                    <button onClick={() => setUntil("")}>First page</button>
                  )}
                  {profile.next && (
                    <button
                      onClick={() => {
                        setInstallationId(profile.installationId);
                        setUntil(profile.next);
                        setQuery("");
                      }}
                    >
                      More projects →
                    </button>
                  )}
                </nav>
                {!projects.length && (
                  <p>
                    {profile.projects.length
                      ? "No projects match your search."
                      : "No projects are accessible through this Vercel connection."}
                  </p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
