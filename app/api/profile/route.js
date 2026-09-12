import { eq } from "drizzle-orm";
import { symmetricDecrypt } from "better-auth/crypto";
import { getSession } from "../../../lib/server/auth.js";
import { getDb } from "../../../lib/server/db.js";
import { vercelInstallations } from "../../../db/schema.js";
import { fetchInstallationProjects } from "../../../lib/server/vercel-integration-api.js";
const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(request) {
  try {
    const session = await getSession(request.headers);
    if (!session) return json({ error: "Log in to view your projects." }, 401);
    const params = new URL(request.url).searchParams;
    const until = params.get("until");
    if (until && !/^\d{1,20}$/.test(until))
      return json({ error: "Invalid project cursor." }, 400);
    const installations = await getDb()
      .select()
      .from(vercelInstallations)
      .where(eq(vercelInstallations.userId, session.user.id));
    if (!installations.length) return json({ connected: false });
    const selected = params.get("installationId")
      ? installations.find((i) => i.id === params.get("installationId"))
      : installations[0];
    if (!selected) return json({ error: "Installation not found." }, 404);
    const info = {
      connected: true,
      installationId: selected.id,
      installations: installations.map((i) => ({ id: i.id, teamId: i.teamId })),
    };
    try {
      const token = await symmetricDecrypt({
        key: process.env.BETTER_AUTH_SECRET,
        data: selected.accessToken,
      });
      return json({
        ...info,
        ...(await fetchInstallationProjects(token, selected.teamId, until)),
      });
    } catch (error) {
      return json({
        ...info,
        projects: [],
        next: null,
        projectsError: error.status
          ? error.message
          : "Projects could not be loaded. Please try again.",
      });
    }
  } catch {
    return json({ error: "Your integration is temporarily unavailable." }, 503);
  }
}
