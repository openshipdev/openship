import { after } from "next/server";
import { eq } from "drizzle-orm";
import { projects } from "../../../../../db/schema.js";
import { getDb } from "../../../../../lib/server/db.js";
import { enqueue, runWorker } from "../../../../../lib/server/collector.js";
import { mutation, failure, apiError } from "../../../../../lib/server/api.js";
export const maxDuration = 240;
export async function POST(request, { params }) {
  try {
    const session = await mutation(request, { admin: true });
    const [p] = await getDb()
      .select()
      .from(projects)
      .where(eq(projects.id, (await params).id));
    if (!p) throw apiError(404, "Project not found.");
    const result = await enqueue(p.origin, session.user.id, "admin", true);
    after(() => runWorker());
    return Response.json(result, { status: 202 });
  } catch (e) {
    return failure(e);
  }
}
