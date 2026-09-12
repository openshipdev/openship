import { vercelError } from "./vercel-api.js";
export const INSTALL_URL = "https://vercel.com/integrations/openship-dev/new";
export const CALLBACK_URL =
  "https://openship-dev.staffx.dev/api/integrations/callback/vercel";
export const INSTALL_COOKIE = "openship-vercel-install";
export function integrationConfigured() {
  return Boolean(
    process.env.VERCEL_INTEGRATION_CLIENT_ID &&
    process.env.VERCEL_INTEGRATION_CLIENT_SECRET &&
    process.env.BETTER_AUTH_SECRET,
  );
}
export async function exchangeInstallationCode(code) {
  if (!integrationConfigured())
    throw vercelError(
      503,
      "Vercel integration credentials are not configured.",
    );
  const response = await fetch("https://api.vercel.com/v2/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.VERCEL_INTEGRATION_CLIENT_ID,
      client_secret: process.env.VERCEL_INTEGRATION_CLIENT_SECRET,
      code,
      redirect_uri: CALLBACK_URL,
    }),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw vercelError(
      502,
      "Vercel could not complete the installation. Please connect again.",
    );
  const data = await response.json();
  if (
    ![data.access_token, data.installation_id, data.user_id].every(
      (v) => typeof v === "string" && v.length > 0,
    ) ||
    (data.team_id != null && typeof data.team_id !== "string")
  )
    throw vercelError(502, "Vercel returned an invalid installation response.");
  return data;
}
export function validateInstallationIdentity(
  data,
  vercelUserId,
  configurationId,
) {
  if (data.user_id !== vercelUserId)
    throw vercelError(
      403,
      "Install using the same Vercel account you used to log in.",
    );
  if (configurationId && data.installation_id !== configurationId)
    throw vercelError(403, "Installation does not match the callback.");
}
export async function fetchInstallationProjects(token, teamId, until) {
  const url = new URL("https://api.vercel.com/v9/projects");
  url.searchParams.set("limit", "50");
  if (teamId) url.searchParams.set("teamId", teamId);
  if (until) url.searchParams.set("until", until);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw vercelError(
      response.status === 401 || response.status === 403 ? 403 : 502,
      response.status === 401 || response.status === 403
        ? "Vercel denied project access. Check that the integration is installed with Project Read permission and access to your projects."
        : "Vercel projects are temporarily unavailable.",
    );
  const data = await response.json();
  if (!Array.isArray(data.projects))
    throw vercelError(502, "Vercel returned an invalid project list.");
  return {
    // The raw project response may contain environment variables. Only expose
    // the fields required to render the profile.
    projects: data.projects
      .filter(
        (p) => p && typeof p.id === "string" && typeof p.name === "string",
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        framework: typeof p.framework === "string" ? p.framework : null,
        createdAt:
          typeof p.createdAt === "number" &&
          Number.isFinite(new Date(p.createdAt).getTime())
            ? p.createdAt
            : null,
      })),
    next: /^\d+$/.test(String(data.pagination?.next))
      ? String(data.pagination.next)
      : null,
  };
}
