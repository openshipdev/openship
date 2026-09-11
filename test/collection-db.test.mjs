import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../lib/server/db.js";
import { projects, jobs, snapshots, retrievals } from "../db/schema.js";
import { enqueue, runWorker } from "../lib/server/collector.js";
import { hash } from "../lib/server/storage.js";
import { listProjects } from "../lib/server/projects.js";
const enabled = Boolean(process.env.TEST_DATABASE_URL);
if (enabled) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const fixture = async (name) =>
  JSON.parse(
    await readFile(
      new URL(
        `../skills/openship/references/examples/valid/${name}.json`,
        import.meta.url,
      ),
    ),
  );
const discovery = await fixture("discovery");
const manifest = await fixture("sources-manifest");
const bundle = await fixture("sources-bundle");
const objects = new Map();
let puts = 0,
  optionalFailure = false,
  storageFailure = false,
  invalid = false;
let callback = null;
const io = {
  fetchResource: async (url) => {
    if (callback) {
      const fn = callback;
      callback = null;
      await fn();
    }
    let content;
    if (url.endsWith("/.well-known/openship.json"))
      content = {
        ...discovery,
        capabilities: { sources: discovery.capabilities.sources },
      };
    else if (url === discovery.capabilities.sources.manifest)
      content = manifest;
    else if (url === discovery.capabilities.sources.bundle)
      content = invalid
        ? { ...bundle, digest: "sha256:" + "0".repeat(64) }
        : bundle;
    else {
      if (optionalFailure)
        throw Object.assign(Error("offline"), { status: 503 });
      content = "public document";
    }
    return {
      bytes: Buffer.from(JSON.stringify(content)),
      finalUrl: url,
      status: 200,
      mediaType: "application/json",
      retrievedAt: new Date().toISOString(),
    };
  },
  put: async (bytes) => {
    if (storageFailure) throw Error("R2 unavailable");
    puts++;
    const digest = hash(bytes),
      key = `objects/${digest}`;
    objects.set(key, bytes);
    return { key, digest };
  },
  readObject: async (key) => objects.get(key),
};
test(
  "collection integration against an isolated migrated PostgreSQL database",
  { skip: !enabled },
  async (t) => {
    const db = getDb();
    // Explicit opt-in: TEST_DATABASE_URL must point at a disposable database.
    await db.execute(
      sql`truncate curation_audit,snapshot_resources,retrievals,collection_jobs,snapshots,projects cascade`,
    );
    await t.test(
      "anonymous views validate metadata without object writes and concurrent requests deduplicate",
      async () => {
        await Promise.all(
          Array.from({ length: 8 }, () => enqueue("https://one.example")),
        );
        assert.equal((await db.select().from(jobs)).length, 1);
        await runWorker({ io });
        const [p] = await db.select().from(projects);
        assert.equal(p.hasFullBundle, false);
        assert.equal(p.name, manifest.project.name);
        assert.equal(puts, 0);
      },
    );
    await t.test(
      "signed-in view upgrades metadata-only listing and stores a complete archive",
      async () => {
        await enqueue("https://one.example", "user-1");
        await runWorker({ io });
        const [p] = await db.select().from(projects);
        assert.equal(p.hasFullBundle, true);
        assert(p.latestCompleteSnapshotId);
        assert(p.archiveEnabledAt);
        assert.equal((await db.select().from(snapshots)).length, 1);
      },
    );
    await t.test(
      "unchanged refresh reuses snapshot, anonymous view never downgrades archive",
      async () => {
        await enqueue("https://one.example", "user-1", "admin", true);
        await runWorker({ io });
        assert.equal((await db.select().from(snapshots)).length, 1);
        const n = puts;
        await enqueue("https://one.example", null, "anonymous_view", true);
        await runWorker({ io });
        assert.equal(puts, n);
        assert.equal((await db.select().from(projects))[0].hasFullBundle, true);
      },
    );
    await t.test(
      "failed optional resources retain previous complete archive and record partial snapshot",
      async () => {
        optionalFailure = true;
        await enqueue("https://one.example", "user-1", "admin", true);
        await runWorker({ io });
        const [p] = await db.select().from(projects);
        assert.notEqual(p.latestSnapshotId, p.latestCompleteSnapshotId);
        assert.equal((await db.select().from(snapshots)).length, 2);
        optionalFailure = false;
      },
    );
    await t.test(
      "storage failure never publishes a new snapshot or destroys old archive",
      async () => {
        storageFailure = true;
        await enqueue("https://one.example", "user-1", "admin", true);
        await runWorker({ io });
        assert.equal((await db.select().from(snapshots)).length, 2);
        assert.equal((await db.select().from(projects))[0].hasFullBundle, true);
        storageFailure = false;
        await db
          .update(jobs)
          .set({ nextAttemptAt: new Date() })
          .where(eq(jobs.state, "queued"));
        await runWorker({ io });
      },
    );
    await t.test(
      "invalid core snapshot does not publish a project",
      async () => {
        invalid = true;
        await enqueue("https://bad.example");
        await runWorker({ io });
        assert.equal(
          (
            await db
              .select()
              .from(projects)
              .where(eq(projects.origin, "https://bad.example"))
          ).length,
          0,
        );
        invalid = false;
      },
    );
    await t.test(
      "login during anonymous collection upgrades active job and archives before completion",
      async () => {
        await enqueue("https://race.example");
        callback = () => enqueue("https://race.example", "user-2");
        await runWorker({ io });
        const [p] = await db
          .select()
          .from(projects)
          .where(eq(projects.origin, "https://race.example"));
        assert.equal(p.hasFullBundle, true);
      },
    );
    await t.test("expired job lease resumes collection", async () => {
      await enqueue("https://resume.example", "user-1");
      await db
        .update(jobs)
        .set({ state: "running", leaseUntil: new Date(0) })
        .where(eq(jobs.origin, "https://resume.example"));
      await runWorker({ io });
      const [p] = await db
        .select()
        .from(projects)
        .where(eq(projects.origin, "https://resume.example"));
      assert.equal(p.hasFullBundle, true);
    });
    await t.test(
      "featured slots are unique; hidden and unavailable projects are excluded from home",
      async () => {
        const rows = await db.select().from(projects);
        await db
          .update(projects)
          .set({ featuredPosition: 1 })
          .where(eq(projects.id, rows[0].id));
        await assert.rejects(
          db
            .update(projects)
            .set({ featuredPosition: 1 })
            .where(eq(projects.id, rows[1].id)),
        );
        await db
          .update(projects)
          .set({ hidden: true })
          .where(eq(projects.id, rows[0].id));
        assert.equal((await listProjects({ filter: "home" })).items.length, 0);
        await db
          .update(projects)
          .set({ hidden: false, availability: "missing" })
          .where(eq(projects.id, rows[0].id));
        assert.equal((await listProjects({ filter: "home" })).items.length, 0);
      },
    );
    await t.test(
      "public projection excludes actor IDs, auth records, and internal storage keys",
      async () => {
        const list = await listProjects();
        for (const p of list.items)
          for (const key of [
            "discoveredBy",
            "archiveEnabledAt",
            "latestObservationId",
            "latestCompleteSnapshotId",
            "metadata",
          ])
            assert.equal(key in p, false);
      },
    );
    await t.test(
      "anonymous metadata freshness does not postpone an old archive refresh",
      async () => {
        await db
          .update(projects)
          .set({ lastRetrievedAt: new Date(), lastArchivedAt: new Date(0) })
          .where(eq(projects.origin, "https://race.example"));
        const queued = await enqueue("https://race.example", "user-2");
        assert(queued.jobId);
        await runWorker({ io });
        const [p] = await db
          .select()
          .from(projects)
          .where(eq(projects.origin, "https://race.example"));
        assert(p.lastArchivedAt > new Date(0));
      },
    );
    await t.test(
      "scheduled checks preserve archive authorization and update worker health",
      async () => {
        const { schedule } = await import("../lib/server/collector.js");
        const { workerHealth } = await import("../lib/server/projects.js");
        await enqueue("https://anonymous.example");
        await runWorker({ io });
        await db.update(projects).set({ nextCheckAt: new Date(0) });
        await schedule();
        const queued = await db
          .select()
          .from(jobs)
          .where(eq(jobs.state, "queued"));
        assert.equal(
          queued.find((j) => j.origin === "https://anonymous.example").mode,
          "metadata",
        );
        assert.equal(
          queued.find((j) => j.origin === "https://race.example").mode,
          "full",
        );
        assert((await workerHealth()).lastRunAt);
        await Promise.all([runWorker({ io }), runWorker({ io })]);
        assert.equal(
          (await db.select().from(jobs).where(eq(jobs.state, "running")))
            .length,
          0,
        );
      },
    );
    await t.test(
      "auth schema, OAuth starts, authorization, audit, expiry and logout",
      async () => {
        process.env.BETTER_AUTH_URL = "http://localhost:3011";
        process.env.BETTER_AUTH_SECRET =
          "isolated-test-only-auth-secret-32-characters";
        process.env.GITHUB_CLIENT_ID = "test-github";
        process.env.GITHUB_CLIENT_SECRET = "test-secret";
        process.env.GOOGLE_CLIENT_ID = "test-google";
        process.env.GOOGLE_CLIENT_SECRET = "test-secret";
        const { getAuth, getSession } = await import("../lib/server/auth.js");
        const { user, session, curationAudit } =
          await import("../db/schema.js");
        const { PATCH } = await import("../app/api/projects/[id]/route.js");
        const { GET: list } = await import("../app/api/projects/route.js");
        const auth = getAuth();
        for (const provider of ["github", "google"]) {
          const response = await auth.handler(
            new Request("http://localhost:3011/api/auth/sign-in/social", {
              method: "POST",
              headers: {
                Origin: "http://localhost:3011",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                provider,
                callbackURL: "/view?url=https%3A%2F%2Fexample.com",
                disableRedirect: true,
              }),
            }),
          );
          assert.equal(response.status, 200);
          const result = await response.json();
          const url = new URL(result.url);
          assert.equal(
            url.hostname,
            provider === "github" ? "github.com" : "accounts.google.com",
          );
          assert.equal(
            url.searchParams.get("redirect_uri"),
            `http://localhost:3011/api/auth/callback/${provider}`,
          );
        }
        const blocked = await auth.handler(
          new Request("http://localhost:3011/api/auth/sign-in/social", {
            method: "POST",
            headers: {
              Origin: "http://localhost:3011",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              provider: "github",
              callbackURL: "https://attacker.example",
            }),
          }),
        );
        assert.equal(blocked.status, 403);
        await db
          .insert(user)
          .values({
            id: "test-admin",
            name: "Test admin",
            email: "admin@isolated.example",
            emailVerified: true,
          })
          .onConflictDoNothing();
        await db.delete(session).where(eq(session.userId, "test-admin"));
        await db.insert(session).values({
          id: "test-session",
          token: "test-session-token",
          userId: "test-admin",
          expiresAt: new Date(Date.now() + 3600000),
        });
        const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET)
          .update("test-session-token")
          .digest("base64");
        const cookie = `better-auth.session_token=${encodeURIComponent("test-session-token." + signature)}`;
        const headers = new Headers({
          Origin: "http://localhost:3011",
          Cookie: cookie,
          "Content-Type": "application/json",
        });
        assert.equal((await getSession(headers)).user.id, "test-admin");
        assert.equal(
          await getSession(
            new Headers({ Cookie: "better-auth.session_token=forged" }),
          ),
          null,
        );
        const [p] = await db.select().from(projects);
        const params = Promise.resolve({ id: p.id });
        const request = (h = headers) =>
          new Request(`http://localhost:3011/api/projects/${p.id}`, {
            method: "PATCH",
            headers: h,
            body: JSON.stringify({ hidden: true }),
          });
        assert.equal((await PATCH(request(), { params })).status, 403);
        process.env.ADMIN_USER_IDS = "test-admin";
        assert.equal(
          (
            await PATCH(
              request(
                new Headers({
                  Origin: "https://attacker.example",
                  Cookie: cookie,
                }),
              ),
              { params },
            )
          ).status,
          403,
        );
        assert.equal((await PATCH(request(), { params })).status, 200);
        assert.equal((await db.select().from(curationAudit)).length, 1);
        const publicList = await (
          await list(
            new Request("http://localhost:3011/api/projects?admin=true"),
          )
        ).json();
        assert(!publicList.items.some((row) => row.id === p.id));
        await db
          .update(session)
          .set({ expiresAt: new Date(0) })
          .where(eq(session.id, "test-session"));
        assert.equal(await getSession(headers), null);
        await db.insert(session).values({
          id: "test-session-logout",
          token: "test-session-token",
          userId: "test-admin",
          expiresAt: new Date(Date.now() + 3600000),
        });
        const logout = await auth.handler(
          new Request("http://localhost:3011/api/auth/sign-out", {
            method: "POST",
            headers,
          }),
        );
        assert.equal(logout.status, 200);
        assert.equal(await getSession(headers), null);
      },
    );
    await db.$client.end();
  },
);
