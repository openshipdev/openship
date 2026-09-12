import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { memoryAdapter } from "better-auth/adapters/memory";
import { symmetricEncrypt, symmetricDecrypt } from "better-auth/crypto";
import { vercelOAuthConfig } from "../lib/server/vercel-oauth.js";
import { fetchVercelProjects } from "../lib/server/vercel-api.js";

const secret = "test-only-secret-with-at-least-32-characters";
function setup() {
  const db = { user: [], session: [], account: [], verification: [] };
  const config = {
    ...vercelOAuthConfig(),
    clientId: "test-client",
    clientSecret: "test-secret",
  };
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret,
    database: memoryAdapter(db),
    account: { encryptOAuthTokens: true, accountLinking: { enabled: false } },
    plugins: [genericOAuth({ config: [config] })],
  });
  return { auth, db };
}
test("Vercel uses authorization code with S256 PKCE and offline scope", async () => {
  const { auth } = setup();
  const context = await auth.$context;
  const provider = context.socialProviders.find((item) => item.id === "vercel");
  const verifier = "a".repeat(43);
  const url = await provider.createAuthorizationURL({
    state: "test-state",
    codeVerifier: verifier,
    redirectURI: "http://localhost:3000/api/auth/callback/vercel",
    scopes: [],
  });
  assert.equal(url.origin + url.pathname, "https://vercel.com/oauth/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "test-state");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    url.searchParams.get("code_challenge"),
    createHash("sha256").update(verifier).digest("base64url"),
  );
  assert.ok(
    url.searchParams.get("scope").split(" ").includes("offline_access"),
  );
});
test("expired tokens refresh and persist an encrypted rotated refresh token", async (t) => {
  const { auth, db } = setup();
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser({
    name: "Test",
    email: "vercel@example.com",
  });
  const account = await context.internalAdapter.createAccount({
    userId: user.id,
    providerId: "vercel",
    accountId: "vercel-user",
    accessToken: await symmetricEncrypt({ key: secret, data: "old-access" }),
    refreshToken: await symmetricEncrypt({ key: secret, data: "old-refresh" }),
    accessTokenExpiresAt: new Date(0),
  });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls++;
    assert.equal(String(url), "https://api.vercel.com/login/oauth/token");
    const body = new URLSearchParams(init.body);
    assert.equal(body.get("grant_type"), "refresh_token");
    assert.equal(body.get("refresh_token"), "old-refresh");
    assert.equal(body.get("client_id"), "test-client");
    return Response.json({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3600,
      token_type: "Bearer",
    });
  });
  const result = await auth.api.getAccessToken({
    body: { accountId: account.id, userId: user.id },
  });
  assert.equal(result.accessToken, "new-access");
  const saved = db.account.find((item) => item.id === account.id);
  assert.notEqual(saved.refreshToken, "new-refresh");
  assert.equal(
    await symmetricDecrypt({ key: secret, data: saved.refreshToken }),
    "new-refresh",
  );
  assert.equal(
    await symmetricDecrypt({ key: secret, data: saved.accessToken }),
    "new-access",
  );
  await auth.api.getAccessToken({
    body: { accountId: account.id, userId: user.id },
  });
  assert.equal(calls, 1);
});
test("callback without valid OAuth state cannot create a session", async () => {
  const { auth, db } = setup();
  const response = await auth.handler(
    new Request(
      "http://localhost:3000/api/auth/callback/vercel?code=untrusted&state=missing",
    ),
  );
  assert.equal(response.status, 302);
  assert.ok(response.headers.get("location").includes("error"));
  assert.equal(db.session.length, 0);
  assert.equal(db.account.length, 0);
});
test("projects paginate, include teams, deduplicate, and omit sensitive settings", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const url = new URL(input);
    requests.push(url);
    assert.equal(init.headers.Authorization, "Bearer oauth-token");
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "error");
    if (url.pathname === "/v2/teams")
      return Response.json({
        teams: [{ id: "team_test" }],
        pagination: { next: null },
      });
    if (url.searchParams.has("teamId"))
      return Response.json({
        projects: [
          {
            id: "p1",
            name: "Alpha",
            framework: "nextjs",
            env: [{ value: "secret" }],
          },
        ],
        pagination: { next: null },
      });
    if (url.searchParams.get("until") === "123")
      return Response.json({
        projects: [{ id: "p2", name: "Beta" }],
        pagination: { next: null },
      });
    return Response.json({
      projects: [{ id: "p1", name: "Alpha", framework: "nextjs" }],
      pagination: { next: 123 },
    });
  });
  assert.deepEqual(await fetchVercelProjects("oauth-token"), {
    projects: [
      { id: "p1", name: "Alpha", framework: "nextjs" },
      { id: "p2", name: "Beta", framework: null },
    ],
    warnings: [],
  });
  assert.equal(requests.length, 4);
  assert.equal(requests[1].searchParams.get("until"), "123");
  assert.equal(requests[3].searchParams.get("teamId"), "team_test");
});
test("denied teams preserve accessible projects with a visible warning", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) =>
    new URL(input).pathname === "/v2/teams"
      ? Response.json({ error: "private upstream details" }, { status: 403 })
      : Response.json({
          projects: [{ id: "p1", name: "Alpha" }],
          pagination: { next: null },
        }),
  );
  const result = await fetchVercelProjects("token");
  assert.equal(result.projects.length, 1);
  assert.match(result.warnings[0], /Team-owned projects may be missing/);
  assert.ok(!JSON.stringify(result).includes("private upstream"));
});
test("empty successful project lists are not reported as API errors", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) =>
    Response.json(
      new URL(input).pathname === "/v2/teams"
        ? { teams: [] }
        : { projects: [] },
    ),
  );
  assert.deepEqual(await fetchVercelProjects("token"), {
    projects: [],
    warnings: [],
  });
});
test("valid login with denied project permission is not reported as expired", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) =>
    new URL(input).pathname === "/login/oauth/userinfo"
      ? Response.json({ sub: "user" })
      : Response.json({}, { status: 401 }),
  );
  await assert.rejects(
    fetchVercelProjects("token"),
    (error) =>
      error.status === 403 &&
      error.message.includes("permission to read projects"),
  );
});
test("repeated project cursor fails instead of looping or showing incomplete results", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ projects: [], pagination: { next: 123 } }),
  );
  await assert.rejects(
    fetchVercelProjects("token"),
    /pagination could not be completed/,
  );
});
