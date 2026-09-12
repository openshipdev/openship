export function vercelError(status, message) {
  return Object.assign(new Error(message), { status });
}
async function requestJson(url, token, headers = {}) {
  const response = await fetch(url, {
    headers: { ...headers, Authorization: `Bearer ${token}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    if (response.status === 401) {
      // Project API rejection does not imply the Vercel login token is expired.
      // Check the issuer before telling the user to repeat authentication.
      let identityStatus;
      try {
        const identity = await fetch(
          "https://api.vercel.com/login/oauth/userinfo",
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(15000),
          },
        );
        identityStatus = identity.status;
        await identity.body?.cancel();
      } catch {
        /* Keep the Project API rejection distinct from an expired login. */
      }
      if (identityStatus === 200)
        throw vercelError(
          403,
          "You are logged in with Vercel, but this connection does not have permission to read projects. Logging in again will not resolve this. Check the app's Vercel API permissions.",
        );
      if (identityStatus === 401)
        throw vercelError(
          401,
          "Your Vercel token is no longer valid. Please log out and log in with Vercel again.",
        );
      throw vercelError(
        502,
        "The Vercel projects API rejected the OAuth token, and Vercel login validity could not be checked. Please try again later.",
      );
    }
    if (response.status === 403)
      throw vercelError(
        403,
        "Vercel denied access to projects. Check your app permissions and team access.",
      );
    throw vercelError(
      502,
      "Vercel is temporarily unavailable. Please try again.",
    );
  }
  return response.json();
}
async function fetchCollection(path, key, token, teamId) {
  const items = [];
  const cursors = new Set();
  let until;
  do {
    const url = new URL(path, "https://api.vercel.com");
    url.searchParams.set("limit", "100");
    if (teamId) url.searchParams.set("teamId", teamId);
    if (until != null) url.searchParams.set("until", String(until));
    const data = await requestJson(url, token);
    if (!Array.isArray(data[key]))
      throw vercelError(502, "Vercel returned an invalid project response.");
    items.push(...data[key]);
    until = data.pagination?.next;
    if (until != null) {
      if (cursors.has(String(until)) || cursors.size >= 100)
        throw vercelError(
          502,
          "Vercel project pagination could not be completed.",
        );
      cursors.add(String(until));
    }
  } while (until != null);
  return items;
}

export async function fetchVercelProjects(token) {
  const projects = new Map();
  const warnings = [];
  function add(items) {
    for (const project of items) {
      if (
        !project ||
        typeof project.id !== "string" ||
        typeof project.name !== "string"
      )
        continue;
      // Project responses can contain environment variables and other secrets.
      // Return only the fields used in the profile.
      projects.set(project.id, {
        id: project.id,
        name: project.name,
        framework:
          typeof project.framework === "string" ? project.framework : null,
      });
    }
  }
  add(await fetchCollection("/v9/projects", "projects", token));
  try {
    const teams = await fetchCollection("/v2/teams", "teams", token);
    for (const team of teams) {
      if (typeof team?.id !== "string") continue;
      add(await fetchCollection("/v9/projects", "projects", token, team.id));
    }
  } catch (error) {
    warnings.push(
      error.status === 401 || error.status === 403
        ? "Vercel did not grant access to all teams. Team-owned projects may be missing from this list."
        : "Some team projects could not be loaded. Refresh to try again.",
    );
  }
  return {
    projects: [...projects.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    warnings,
  };
}
