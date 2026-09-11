import { listProjects } from "../../../lib/server/projects.js";
import { getDb } from "../../../lib/server/db.js";
import { projects } from "../../../db/schema.js";
import { and, eq } from "drizzle-orm";
import { failure } from "../../../lib/server/api.js";
export async function GET(request) {
  try {
    const p = new URL(request.url).searchParams;
    if (p.has("origin")) {
      const [project] = await getDb()
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(eq(projects.origin, p.get("origin")), eq(projects.hidden, false)),
        );
      return Response.json({ id: project?.id || null });
    }
    return Response.json(
      await listProjects({
        q: p.get("q") || "",
        filter: p.get("filter") || "all",
        page: p.get("page") || 1,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
