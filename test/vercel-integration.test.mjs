import test from "node:test";
import assert from "node:assert/strict";
import {
  CALLBACK_URL,
  exchangeInstallationCode,
  validateInstallationIdentity,
  fetchInstallationProjects,
} from "../lib/server/vercel-integration-api.js";
import { completeInstallation } from "../lib/server/vercel-integrations.js";

test("installation exchange uses integration credentials and the registered callback", async (t) => {
  const names = [
    "VERCEL_INTEGRATION_CLIENT_ID",
    "VERCEL_INTEGRATION_CLIENT_SECRET",
    "BETTER_AUTH_SECRET",
  ];
  const before = names.map((name) => process.env[name]);
  names.forEach((name, i) => {
    process.env[name] = `test-${i}`;
  });
  t.after(() =>
    names.forEach((name, i) => {
      if (before[i] === undefined) delete process.env[name];
      else process.env[name] = before[i];
    }),
  );
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://api.vercel.com/v2/oauth/access_token");
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "error");
    assert.equal(init.body.get("client_id"), "test-0");
    assert.equal(init.body.get("client_secret"), "test-1");
    assert.equal(init.body.get("redirect_uri"), CALLBACK_URL);
    assert.equal(init.body.get("code"), "one-time-code");
    return Response.json({
      access_token: "installation-token",
      installation_id: "icfg_test",
      user_id: "vercel-user",
      team_id: "team_test",
    });
  });
  const result = await exchangeInstallationCode("one-time-code");
  assert.equal(result.installation_id, "icfg_test");
});

test("installation must belong to the logged-in Vercel identity and callback configuration", () => {
  const data = { user_id: "user-1", installation_id: "icfg_1" };
  assert.doesNotThrow(() =>
    validateInstallationIdentity(data, "user-1", "icfg_1"),
  );
  assert.throws(
    () => validateInstallationIdentity(data, "user-2", "icfg_1"),
    /same Vercel account/,
  );
  assert.throws(
    () => validateInstallationIdentity(data, "user-1", "icfg_2"),
    /does not match/,
  );
});

test("missing session or mismatched installation state fails before database or token exchange", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Must not call upstream");
  });
  await assert.rejects(
    completeInstallation({
      session: null,
      state: "state",
      cookieState: "state",
    }),
    /session expired/,
  );
  await assert.rejects(
    completeInstallation({
      session: { user: { id: "user" } },
      state: "attacker-state",
      cookieState: "browser-state",
    }),
    /session expired/,
  );
});

test("projects use installation team and cursor and omit sensitive settings", async (t) => {
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const url = new URL(input);
    assert.equal(
      url.origin + url.pathname,
      "https://api.vercel.com/v9/projects",
    );
    assert.equal(url.searchParams.get("teamId"), "team_1");
    assert.equal(url.searchParams.get("until"), "123");
    assert.equal(init.headers.Authorization, "Bearer installation-token");
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "error");
    return Response.json({
      projects: [
        {
          id: "prj_1",
          name: "app",
          framework: "nextjs",
          createdAt: 123,
          env: [{ value: "secret" }],
          targets: { production: { secret: "omit" } },
        },
        { id: "prj_2", name: "other", createdAt: 1e30 },
        null,
      ],
      pagination: { next: 100 },
    });
  });
  assert.deepEqual(
    await fetchInstallationProjects("installation-token", "team_1", "123"),
    {
      projects: [
        { id: "prj_1", name: "app", framework: "nextjs", createdAt: 123 },
        { id: "prj_2", name: "other", framework: null, createdAt: null },
      ],
      next: "100",
    },
  );
});

test("missing project permission prompts connection repair", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "private" }, { status: 403 }),
  );
  await assert.rejects(
    fetchInstallationProjects("token", null),
    (e) =>
      e.status === 403 &&
      e.message.includes("Project Read") &&
      !e.message.includes("private"),
  );
});
