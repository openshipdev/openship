import { cookies } from "next/headers";
import { getSession } from "../../../../../lib/server/auth.js";
import { completeInstallation } from "../../../../../lib/server/vercel-integrations.js";
import {
  INSTALL_COOKIE,
  CALLBACK_URL,
} from "../../../../../lib/server/vercel-integration-api.js";
export async function GET(request) {
  const profile = new URL("/profile", CALLBACK_URL);
  const jar = await cookies();
  const cookieState = jar.get(INSTALL_COOKIE)?.value;
  jar.set(INSTALL_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/integrations",
    maxAge: 0,
  });
  try {
    const params = new URL(request.url).searchParams;
    if (params.has("error")) throw new Error("Installation canceled");
    const code = params.get("code");
    if (code && code.length > 4096) throw new Error("Invalid code");
    await completeInstallation({
      session: await getSession(request.headers),
      state: params.get("state"),
      cookieState,
      code,
      configurationId: params.get("configurationId"),
    });
  } catch {
    profile.searchParams.set("integrationError", "callback");
  }
  // Never follow the untrusted `next` callback parameter.
  return new Response(null, {
    status: 302,
    headers: {
      Location: profile.href,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
