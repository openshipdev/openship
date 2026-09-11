import { eq, and, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  validateDiscovery,
  validateSources,
  validateSystems,
  validateChangesPolicy,
} from "@openship/protocol";
import {
  projects,
  jobs,
  retrievals,
  snapshots,
  resources,
  workerStatus,
  rateLimits,
} from "../../db/schema.js";
import { getDb } from "./db.js";
import { checkedUrl, fetchResource } from "./safe-fetch.js";
import { put, readObject, hash } from "./storage.js";
const DAY = 86400000;
const MAX = 256 * 1024 * 1024;
const parse = (resource) => {
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(resource),
    );
  } catch {
    throw Object.assign(new Error("Invalid JSON document."), {
      code: "validation",
    });
  }
};
const validate = (fn) => {
  try {
    return fn();
  } catch (e) {
    throw Object.assign(e, { code: "validation" });
  }
};
export function targets(discovery, origin) {
  const cap = discovery.capabilities;
  return [
    ["discovery", `${origin}/.well-known/openship.json`, true],
    ["manifest", cap.sources.manifest, true],
    ["bundle", cap.sources.bundle, true],
    ["systems", cap.systems?.document, false],
    ["skill", discovery.agent.skill, false],
    ["instructions", cap.sources.instructions, false],
    ["policy", cap.changes?.policy, false],
    ["page", discovery.page, false],
    ["archive", cap.sources.archive, false],
  ]
    .filter(([, url]) => url)
    .map(([kind, url, required]) => ({ kind, url, required }));
}
export function projectMetadata(discovery, manifest, system) {
  return {
    ...manifest.project,
    stack: manifest.stack || [],
    openship: discovery.openship,
    systemsVersion: system?.systemsVersion || null,
    capabilities: discovery.capabilities,
    agent: discovery.agent,
    providerPage: discovery.page,
    sourceDigest: manifest.digest,
    generatedAt: manifest.generatedAt || null,
    commit: manifest.commit || null,
    files: manifest.totals.files,
    decodedBytes: manifest.totals.bytes,
    layers: system?.system.layers.length || 0,
    nodes: system?.system.layers.reduce((n, l) => n + l.nodes.length, 0) || 0,
    edges: system?.system.layers.reduce((n, l) => n + l.edges.length, 0) || 0,
    instances: system?.system.instances?.length || 0,
  };
}
export function failureState(project, error, now = new Date()) {
  const missing = error.discovery && [404, 410].includes(error.status);
  const daily = !project.lastMissingAt || now - project.lastMissingAt >= DAY;
  const missingCount = missing ? project.missingCount + (daily ? 1 : 0) : 0;
  return {
    availability:
      missing && missingCount >= 3
        ? "missing"
        : error.code === "validation"
          ? "invalid"
          : "unreachable",
    failureCount: project.failureCount + 1,
    missingCount,
    lastMissingAt: missing ? (daily ? now : project.lastMissingAt) : null,
    failureSince: project.failureSince || now,
    lastError: error.code || "transport",
    lastCheckedAt: now,
    nextCheckAt: new Date(+now + DAY),
    updatedAt: now,
  };
}
export async function enqueue(
  value,
  userId = null,
  trigger = userId ? "signed_in_view" : "anonymous_view",
  force = false,
) {
  const db = getDb();
  const origin = checkedUrl(value).origin;
  const now = new Date();
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.origin, origin));
  if (project) {
    const update = {
      ...(trigger.endsWith("view") ? { lastViewedAt: now } : {}),
      ...(userId && !project.archiveEnabledAt ? { archiveEnabledAt: now } : {}),
    };
    if (Object.keys(update).length)
      await db.update(projects).set(update).where(eq(projects.id, project.id));
    if (
      !force &&
      project.lastRetrievedAt &&
      now - project.lastRetrievedAt < DAY &&
      (!userId ||
        (project.hasFullBundle &&
          project.lastArchivedAt &&
          now - project.lastArchivedAt < DAY))
    )
      return { projectId: project.id, state: "current" };
  }
  // A view without a session never initiates full collection. Scheduled jobs may use earlier archive authorization.
  const mode =
    userId || (trigger === "scheduled" && project?.archiveEnabledAt)
      ? "full"
      : "metadata";
  const [job] = await db
    .insert(jobs)
    .values({ origin, projectId: project?.id, userId, trigger, mode })
    .onConflictDoUpdate({
      target: jobs.origin,
      targetWhere: sql`${jobs.state} in ('queued','running')`,
      set: {
        mode: sql`case when ${jobs.mode} = 'full' or ${mode} = 'full' then 'full' else 'metadata' end`,
        userId: sql`coalesce(${userId}, ${jobs.userId})`,
        trigger: sql`case when ${mode} = 'full' then ${trigger} else ${jobs.trigger} end`,
      },
    })
    .returning();
  return { projectId: project?.id || null, jobId: job.id, state: job.state };
}
async function claim() {
  const db = getDb();
  const token = randomUUID();
  return db.transaction(async (tx) => {
    const result = await tx.execute(
      sql`select id from collection_jobs where (state = 'queued' and next_attempt_at <= now()) or (state = 'running' and lease_until < now()) order by created_at for update skip locked limit 1`,
    );
    if (!result.length) return null;
    const [job] = await tx
      .update(jobs)
      .set({
        state: "running",
        leaseToken: token,
        leaseUntil: new Date(Date.now() + 300000),
        attempts: sql`${jobs.attempts}+1`,
      })
      .where(eq(jobs.id, result[0].id))
      .returning();
    return job;
  });
}
async function capture(job, deadline, io) {
  const db = getDb();
  const progress = {
    resources: [],
    total: 0,
    startedAt: new Date().toISOString(),
    ...job.progress,
  };
  const memory = new Map();
  const readStored = (key) =>
    io.readObject(key).catch((error) => {
      throw Object.assign(error, { storage: true });
    });
  const full = job.mode === "full";
  const checkpoint = async () => {
    if (full)
      await db
        .update(jobs)
        .set({ progress })
        .where(and(eq(jobs.id, job.id), eq(jobs.leaseToken, job.leaseToken)));
  };
  const get = async (target) => {
    let record = progress.resources.find((r) => r.kind === target.kind);
    if (record) return record.objectKey ? readStored(record.objectKey) : null;
    if (Date.now() > deadline) {
      await checkpoint();
      return undefined;
    }
    try {
      const result = await io.fetchResource(target.url, {
        maxBytes: Math.min(
          target.kind === "discovery" ? 1048576 : 67108864,
          MAX - progress.total,
        ),
      });
      progress.total += result.bytes.length;
      const stored = full
        ? await io.put(result.bytes).catch((error) => {
            throw Object.assign(error, { storage: true });
          })
        : { digest: hash(result.bytes) };
      record = {
        kind: target.kind,
        originalUrl: target.url,
        finalUrl: result.finalUrl,
        status: result.status,
        mediaType: result.mediaType,
        etag: result.etag,
        lastModified: result.lastModified,
        retrievedAt: result.retrievedAt,
        bytes: result.bytes.length,
        sha256: stored.digest,
        objectKey: stored.key,
        result: "captured",
      };
      progress.resources.push(record);
      memory.set(target.kind, result.bytes);
      await checkpoint();
      return result.bytes;
    } catch (error) {
      if (target.kind === "discovery") error.discovery = true;
      // Storage failures must be retried, never recorded as a completed optional fetch.
      if (error.storage) throw error;
      if (target.required) throw error;
      progress.resources.push({
        kind: target.kind,
        originalUrl: target.url,
        status: error.status || null,
        result: "failed",
        error: error.code || "transport",
      });
      await checkpoint();
      return null;
    }
  };
  const discoveryBytes = await get({
    kind: "discovery",
    url: `${job.origin}/.well-known/openship.json`,
    required: true,
  });
  if (discoveryBytes === undefined) return null;
  const discovery = validate(() => validateDiscovery(parse(discoveryBytes)));
  for (const target of targets(discovery, job.origin)
    .slice(1)
    .filter(
      (t) => full || ["manifest", "bundle", "systems"].includes(t.kind),
    )) {
    const bytes = await get(target);
    if (bytes === undefined) return null;
    if (bytes) memory.set(target.kind, bytes);
  }
  const data = async (kind) =>
    memory.get(kind) ||
    (progress.resources.find((r) => r.kind === kind)?.objectKey
      ? readStored(progress.resources.find((r) => r.kind === kind).objectKey)
      : null);
  const manifest = parse(await data("manifest"));
  const bundle = parse(await data("bundle"));
  validate(() =>
    validateSources(manifest, bundle, { maxDecodedBytes: 33554432 }),
  );
  let system = null;
  const systemBytes = await data("systems");
  if (systemBytes) {
    try {
      system = validateSystems(parse(systemBytes), {
        maxDecodedBytes: 33554432,
      });
    } catch {
      const record = progress.resources.find((r) => r.kind === "systems");
      record.result = "invalid";
      record.error = "validation";
    }
  }
  const policy = await data("policy");
  if (policy) {
    try {
      validateChangesPolicy(parse(policy));
    } catch {
      const record = progress.resources.find((r) => r.kind === "policy");
      record.result = "invalid";
      record.error = "validation";
    }
  }
  return {
    discovery,
    manifest,
    system,
    metadata: projectMetadata(discovery, manifest, system),
    progress,
  };
}
async function finish(job, result, io) {
  const db = getDb();
  const now = new Date();
  const { manifest, metadata, progress } = result;
  let inventory;
  if (job.mode === "full")
    inventory = await io
      .put(Buffer.from(JSON.stringify(progress.resources)))
      .catch((error) => {
        throw Object.assign(error, { storage: true });
      });
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(jobs)
      .where(eq(jobs.id, job.id))
      .for("update");
    if (current.leaseToken !== job.leaseToken) return;
    // An authenticated visit during an anonymous check upgrades and reruns collection.
    if (current.mode !== job.mode) {
      await tx
        .update(jobs)
        .set({ state: "queued", progress: {}, leaseUntil: null })
        .where(eq(jobs.id, job.id));
      return;
    }
    const [project] = await tx
      .insert(projects)
      .values({
        origin: job.origin,
        name: manifest.project.name,
        description: manifest.project.description,
        metadata,
        discoveredBy: job.userId,
        lastViewedAt: job.trigger.endsWith("view") ? now : null,
        archiveEnabledAt: job.mode === "full" ? now : null,
      })
      .onConflictDoUpdate({
        target: projects.origin,
        set: {
          name: manifest.project.name,
          description: manifest.project.description,
          metadata,
        },
      })
      .returning();
    let snapshotId = null;
    let complete = false;
    if (inventory) {
      complete = progress.resources.every((r) => r.result === "captured");
      const contentHash = hash(
        JSON.stringify(
          progress.resources.map((r) => [r.kind, r.sha256 || null, r.result]),
        ),
      );
      let [snapshot] = await tx
        .select()
        .from(snapshots)
        .where(
          and(
            eq(snapshots.projectId, project.id),
            eq(snapshots.contentHash, contentHash),
          ),
        );
      if (!snapshot) {
        [snapshot] = await tx
          .insert(snapshots)
          .values({
            projectId: project.id,
            contentHash,
            sourceDigest: manifest.digest,
            completeness: complete ? "complete" : "partial",
            metadata,
            inventoryKey: inventory.key,
          })
          .returning();
        await tx.insert(resources).values(
          progress.resources.map((r) => ({
            ...r,
            snapshotId: snapshot.id,
            retrievedAt: r.retrievedAt ? new Date(r.retrievedAt) : now,
          })),
        );
      }
      snapshotId = snapshot.id;
    }
    const [retrieval] = await tx
      .insert(retrievals)
      .values({
        projectId: project.id,
        userId: job.userId,
        trigger: job.trigger,
        mode: job.mode,
        queuedAt: job.createdAt,
        startedAt: new Date(progress.startedAt),
        completedAt: now,
        result: inventory && !complete ? "partial" : "success",
        metadata,
        snapshotId,
      })
      .returning();
    await tx
      .update(projects)
      .set({
        availability: "available",
        failureCount: 0,
        missingCount: 0,
        lastMissingAt: null,
        failureSince: null,
        lastError: null,
        lastCheckedAt: now,
        lastRetrievedAt: now,
        nextCheckAt: new Date(+now + DAY),
        updatedAt: now,
        latestObservationId: retrieval.id,
        ...(snapshotId
          ? {
              hasFullBundle: true,
              lastArchivedAt: now,
              latestSnapshotId: snapshotId,
              archiveEnabledAt: project.archiveEnabledAt || now,
              ...(complete ? { latestCompleteSnapshotId: snapshotId } : {}),
            }
          : {}),
      })
      .where(eq(projects.id, project.id));
    await tx
      .update(jobs)
      .set({
        state: "done",
        projectId: project.id,
        leaseUntil: null,
        progress: {},
      })
      .where(eq(jobs.id, job.id));
  });
}
export async function runWorker({
  budgetMs = 210000,
  io = { fetchResource, put, readObject },
} = {}) {
  const deadline = Date.now() + budgetMs;
  const db = getDb();
  while (Date.now() < deadline - 35000) {
    const job = await claim();
    if (!job) break;
    try {
      const result = await capture(job, deadline - 30000, io);
      if (result) await finish(job, result, io);
      else {
        await db
          .update(jobs)
          .set({ state: "queued", leaseUntil: null, nextAttemptAt: new Date() })
          .where(and(eq(jobs.id, job.id), eq(jobs.leaseToken, job.leaseToken)));
        break;
      }
    } catch (error) {
      await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(jobs)
          .where(eq(jobs.id, job.id))
          .for("update");
        if (current.leaseToken !== job.leaseToken) return;
        const terminal =
          job.attempts >= 3 ||
          ["url", "validation", "size"].includes(error.code);
        await tx
          .update(jobs)
          .set({
            state: terminal ? "failed" : "queued",
            leaseUntil: null,
            nextAttemptAt: new Date(Date.now() + job.attempts * 60000),
            lastError: error.code || "storage_or_transport",
            ...(error.code === "validation" ? { progress: {} } : {}),
          })
          .where(eq(jobs.id, job.id));
        const [project] = await tx
          .select()
          .from(projects)
          .where(eq(projects.origin, job.origin));
        if (
          project &&
          terminal &&
          !error.storage &&
          (error.code || error.status)
        )
          await tx
            .update(projects)
            .set(failureState(project, error))
            .where(eq(projects.id, project.id));
        await tx.insert(retrievals).values({
          projectId: project?.id,
          userId: job.userId,
          trigger: job.trigger,
          mode: job.mode,
          queuedAt: job.createdAt,
          startedAt: new Date(),
          completedAt: new Date(),
          result: "failed",
          error: error.code || "storage_or_transport",
          metadata: { httpStatus: error.status || null },
        });
      });
    }
  }
}
export async function schedule() {
  const db = getDb();
  const due = await db
    .select()
    .from(projects)
    .where(lte(projects.nextCheckAt, new Date()))
    .limit(100);
  for (const project of due) {
    await enqueue(project.origin, null, "scheduled", true);
    await db
      .update(projects)
      .set({ nextCheckAt: new Date(Date.now() + DAY) })
      .where(eq(projects.id, project.id));
  }
  await db
    .insert(workerStatus)
    .values({ id: "collector", lastRunAt: new Date() })
    .onConflictDoUpdate({
      target: workerStatus.id,
      set: { lastRunAt: new Date() },
    });
  await db.delete(rateLimits).where(lte(rateLimits.expiresAt, new Date()));
}
