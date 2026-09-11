import { cacheLife, cacheTag, unstable_cache } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { projects, resources, snapshots } from "../../db/schema.js";
import { getDb } from "./db.js";
import { hash, readObject } from "./storage.js";
import { loadSavedSnapshot, VIEWER_LIMITS } from "../viewer.js";

// Keep the persistent Data Cache beneath the Cache Components layer below.
// Unlike the default in-memory "use cache" handler, this layer can survive
// process restarts. Immutable metadata/bytes have no timed expiry; base64
// chunks stay below the Data Cache's 2 MB entry limit.
const CHUNK_BYTES = 1024 * 1024;
const savedResources = unstable_cache(
  async (snapshotId) => {
    const rows = await getDb()
      .select({
        kind: resources.kind,
        objectKey: resources.objectKey,
        bytes: resources.bytes,
        sha256: resources.sha256,
      })
      .from(resources)
      .where(
        and(
          eq(resources.snapshotId, snapshotId),
          eq(resources.result, "captured"),
        ),
      );
    const captured = rows.filter(
      (r) =>
        r.objectKey &&
        ["discovery", "manifest", "bundle", "systems"].includes(r.kind),
    );
    for (const kind of ["discovery", "manifest", "bundle"])
      if (!captured.some((r) => r.kind === kind))
        throw new Error("This saved snapshot is incomplete.");
    return captured;
  },
  ["osh-resources-v1"],
  { revalidate: false },
);

const savedChunk = unstable_cache(
  async (key, start, end) => {
    const bytes = await readObject(key, `bytes=${start}-${end}`);
    if (bytes.length !== end - start + 1)
      throw new Error("Incomplete saved content.");
    return bytes.toString("base64");
  },
  ["osh-object-chunk-v1"],
  { revalidate: false },
);

async function savedDocuments(snapshotId) {
  const rows = await savedResources(snapshotId);
  return Object.fromEntries(
    await Promise.all(
      rows.map(async (r) => {
        const limit =
          r.kind === "discovery"
            ? VIEWER_LIMITS.discoveryBytes
            : VIEWER_LIMITS.documentBytes;
        if (!Number.isSafeInteger(r.bytes) || r.bytes <= 0 || r.bytes > limit)
          throw new Error("Saved document exceeds viewer limits.");
        const chunks = [];
        // Bound concurrent R2 reads even for a maximum-sized bundle.
        for (let start = 0; start < r.bytes; start += CHUNK_BYTES) {
          const end = Math.min(start + CHUNK_BYTES, r.bytes) - 1;
          chunks.push(
            Buffer.from(await savedChunk(r.objectKey, start, end), "base64"),
          );
        }
        const bytes = Buffer.concat(chunks);
        if (hash(bytes) !== r.sha256)
          throw new Error("Saved document failed integrity verification.");
        return [r.kind, JSON.parse(bytes.toString("utf8"))];
      }),
    ),
  );
}

async function verifiedSnapshot(snapshotId, origin, retrievedAt) {
  const documents = await savedDocuments(snapshotId);
  return loadSavedSnapshot({
    origin,
    retrievedAt,
    hasSystems: Boolean(documents.systems),
    get: async (kind) => documents[kind],
  });
}

export async function getOshSnapshot(oshHash) {
  "use cache";
  cacheLife("max");
  if (!/^[a-f0-9]{64}$/i.test(oshHash)) return null;
  cacheTag(`osh:${oshHash.toLowerCase()}`);
  // Cache the entire lookup, including visibility. Admin changes invalidate
  // project tags; collection/unhiding invalidates cached missing snapshots.
  const [record] = await getDb()
    .select({
      id: snapshots.id,
      projectId: projects.id,
      origin: projects.origin,
      retrievedAt: snapshots.retrievedAt,
    })
    .from(snapshots)
    .innerJoin(projects, eq(snapshots.projectId, projects.id))
    .where(
      and(
        eq(snapshots.contentHash, oshHash.toLowerCase()),
        eq(projects.hidden, false),
      ),
    )
    .orderBy(asc(snapshots.retrievedAt), asc(snapshots.id))
    .limit(1);
  if (!record) {
    cacheTag("osh-missing");
    return null;
  }
  cacheTag(`osh-project:${record.projectId}`);
  return verifiedSnapshot(
    record.id,
    record.origin,
    record.retrievedAt.toISOString(),
  );
}
