import { and, eq, desc, asc, ilike, or, ne, sql, count } from "drizzle-orm";
import {
  projects,
  resources,
  snapshots,
  jobs,
  workerStatus,
} from "../../db/schema.js";
import { getDb } from "./db.js";
import { readUrl } from "./storage.js";
export function publicProject(p) {
  return {
    id: p.id,
    origin: p.origin,
    name: p.name,
    description: p.description,
    homepage: p.metadata.homepage,
    repository: p.metadata.repository,
    license: p.metadata.license,
    stack: p.metadata.stack,
    availability: p.availability,
    hasFullBundle: p.hasFullBundle,
    lastRetrievedAt: p.lastRetrievedAt,
    firstDiscoveredAt: p.firstDiscoveredAt,
    isTop: p.isTop,
    isPromoted: p.isPromoted,
    featuredPosition: p.featuredPosition,
  };
}
export async function listProjects({
  q = "",
  filter = "all",
  page = 1,
  admin = false,
} = {}) {
  if (!process.env.DATABASE_URL)
    return { items: [], total: 0, page: 1, configured: false };
  const db = getDb();
  const conditions = admin ? [] : [eq(projects.hidden, false)];
  if (q)
    conditions.push(
      or(
        ilike(projects.name, `%${q.slice(0, 200)}%`),
        ilike(projects.description, `%${q.slice(0, 200)}%`),
        ilike(projects.origin, `%${q.slice(0, 200)}%`),
      ),
    );
  if (filter === "featured")
    conditions.push(sql`${projects.featuredPosition} is not null`);
  if (filter === "top") conditions.push(eq(projects.isTop, true));
  if (filter === "promoted") conditions.push(eq(projects.isPromoted, true));
  if (filter === "unavailable")
    conditions.push(ne(projects.availability, "available"));
  if (filter === "home")
    conditions.push(
      sql`${projects.featuredPosition} is not null`,
      eq(projects.availability, "available"),
    );
  page = Math.min(100000, Math.max(1, Number.parseInt(page) || 1));
  const where = and(...conditions);
  const [total] = await db
    .select({ count: count() })
    .from(projects)
    .where(where);
  const rows = await db
    .select()
    .from(projects)
    .where(where)
    .orderBy(
      filter === "home"
        ? asc(projects.featuredPosition)
        : desc(projects.firstDiscoveredAt),
      asc(projects.id),
    )
    .limit(filter === "home" ? 3 : 24)
    .offset((page - 1) * 24);
  return {
    items: rows.map((p) => ({
      ...publicProject(p),
      ...(admin ? { hidden: p.hidden, lastError: p.lastError } : {}),
    })),
    total: total.count,
    page,
    configured: true,
  };
}
export async function projectDetail(id) {
  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.hidden, false)));
  if (!project) return null;
  const snapshotId =
    project.latestCompleteSnapshotId || project.latestSnapshotId;
  let archive = null;
  if (snapshotId) {
    const [snapshot] = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.id, snapshotId));
    const rows = await db
      .select()
      .from(resources)
      .where(
        and(
          eq(resources.snapshotId, snapshotId),
          eq(resources.result, "captured"),
        ),
      );
    archive = {
      retrievedAt: snapshot.retrievedAt,
      completeness: snapshot.completeness,
      resources: await Promise.all(
        rows
          .filter((r) => r.objectKey)
          .map(async (r) => ({
            kind: r.kind,
            originalUrl: r.originalUrl,
            url: await readUrl(r.objectKey),
          })),
      ),
    };
  }
  return { ...publicProject(project), archive };
}
export async function workerHealth() {
  const db = getDb();
  const states = await db
    .select({ state: jobs.state, count: count() })
    .from(jobs)
    .groupBy(jobs.state);
  const [worker] = await db
    .select()
    .from(workerStatus)
    .where(eq(workerStatus.id, "collector"));
  return { states, lastRunAt: worker?.lastRunAt || null };
}
