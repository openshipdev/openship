import { cookies } from "next/headers";
import { getSession } from "../../../../../lib/server/auth.js";
import { beginInstallation } from "../../../../../lib/server/vercel-integrations.js";
import {
  INSTALL_URL,
  INSTALL_COOKIE,
  CALLBACK_URL,
  integrationConfigured,
} from "../../../../../lib/server/vercel-integration-api.js";
export async function GET(request) {
  // Read request state before configuration checks so missing build-time
  // credentials cannot prerender a permanent error redirect.
  const jar = await cookies();
  const profile = new URL("/profile", CALLBACK_URL);
  try {
    if (!integrationConfigured())
      throw new Error("Integration credentials are not configured.");
    const state = await beginInstallation(await getSession(request.headers));
    jar.set(INSTALL_COOKIE, state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/integrations",
      maxAge: 900,
    });
    const url = new URL(INSTALL_URL);
    url.searchParams.set("state", state);
    return new Response(null, {
      status: 302,
      headers: { Location: url.href, "Cache-Control": "no-store" },
    });
  } catch {
    profile.searchParams.set("integrationError", "start");
    return new Response(null, {
      status: 302,
      headers: { Location: profile.href, "Cache-Control": "no-store" },
    });
  }
}
