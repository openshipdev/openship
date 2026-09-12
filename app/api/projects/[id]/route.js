import { eq } from "drizzle-orm";
import nextCache from "next/cache.js";
import { projects, curationAudit } from "../../../../db/schema.js";
import { getDb } from "../../../../lib/server/db.js";
import { projectDetail } from "../../../../lib/server/projects.js";
import {
  mutation,
  body,
  failure,
  apiError,
} from "../../../../lib/server/api.js";
export async function GET(request, { params }) {
  try {
    const p = await projectDetail((await params).id);
    return p
      ? Response.json(p, { headers: { "Cache-Control": "no-store" } })
      : Response.json({ error: "Project not found." }, { status: 404 });
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request, { params }) {
  try {
    const session = await mutation(request, { admin: true });
    const input = await body(request);
    const allowed = ["isTop", "isPromoted", "featuredPosition", "hidden"];
    if (
      !Object.keys(input).length ||
      Object.keys(input).some((k) => !allowed.includes(k))
    )
      throw apiError(400, "Unknown curation field.");
    for (const [key, value] of Object.entries(input)) {
      if (
        key === "featuredPosition"
          ? value !== null && ![1, 2, 3].includes(value)
          : typeof value !== "boolean"
      )
        throw apiError(400, "Invalid curation value.");
    }
    const id = (await params).id;
    await getDb().transaction(async (tx) => {
      const [p] = await tx
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .for("update");
      if (!p) throw apiError(404, "Project not found.");
      await tx
        .update(projects)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(projects.id, id));
      await tx.insert(curationAudit).values({
        projectId: id,
        adminId: session.user.id,
        changes: Object.fromEntries(
          Object.entries(input).map(([key, value]) => [
            key,
            { before: p[key], after: value },
          ]),
        ),
      });
    });
    if (Object.hasOwn(input, "hidden")) {
      nextCache.revalidateTag(`osh-project:${id}`, { expire: 0 });
      nextCache.revalidateTag("osh-missing", { expire: 0 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (e.code === "23505" || e.cause?.code === "23505")
      return failure(
        apiError(409, "That featured slot is occupied. Clear it first."),
      );
    return failure(e);
  }
}
