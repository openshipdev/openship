import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_ID,
  oauthRequest,
  parseDevice,
  publicState,
} from "../lib/server/gateway-device.js";
const device = {
  device_code: "secret-device",
  user_code: "ABCD-EFGH",
  verification_uri: "https://vercel.com/oauth/device",
  expires_in: 600,
  interval: 5,
};
test("fx device request uses the verified client and scopes", async () => {
  const original = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(
      url,
      "https://api.vercel.com/login/oauth/device-authorization",
    );
    assert.equal(options.body.get("client_id"), CLIENT_ID);
    assert.equal(options.body.get("scope"), "openid offline_access");
    assert.equal(options.redirect, "error");
    return Response.json(device);
  };
  try {
    assert.deepEqual(
      await oauthRequest("device-authorization", {
        scope: "openid offline_access",
      }),
      device,
    );
  } finally {
    global.fetch = original;
  }
});
test("pending response reveals only user code and link, bound to session and expiry", () => {
  const pending = parseDevice(device, "session", 1000);
  const result = publicState(pending, "session", 1000);
  assert.equal(result.status, "pending");
  assert.equal(result.pollAfter, 5000);
  assert.ok(result.url.includes("user_code=ABCD-EFGH"));
  assert.ok(!JSON.stringify(result).includes("secret-device"));
  assert.deepEqual(publicState(pending, "different", 1000), {
    status: "disconnected",
  });
  assert.deepEqual(publicState(pending, "session", 601000), {
    status: "expired",
  });
});
test("device verification URL must be the Vercel device endpoint", () => {
  for (const url of [
    "https://evil.test/oauth/device",
    "https://vercel.com/other",
    "http://vercel.com/oauth/device",
  ])
    assert.throws(() =>
      parseDevice({ ...device, verification_uri: url }, "session"),
    );
});
test("connected status never exposes access or refresh tokens", () => {
  const result = publicState(
    {
      status: "connected",
      accessToken: "access-secret",
      refreshToken: "refresh-secret",
      expiresAt: 123,
      modelCount: 375,
      catalogStatus: 200,
    },
    "session",
  );
  assert.deepEqual(result, {
    status: "connected",
    expiresAt: 123,
    modelCount: 375,
    catalogStatus: 200,
    teams: [],
    teamId: "",
    teamsError: undefined,
  });
});

test("Gateway origin check accepts public origin behind a proxy and rejects other origins", async () => {
  const { hasTrustedOrigin } = await import("../lib/server/request-origin.js");
  const publicUrl = "https://openship-dev.staffx.dev";
  const request = (origin) =>
    new Request("http://localhost:3000/api/profile/gateway", {
      headers: origin ? { origin, "x-forwarded-host": "evil.example" } : {},
    });
  assert.equal(hasTrustedOrigin(request(publicUrl), publicUrl), true);
  assert.equal(
    hasTrustedOrigin(request("https://evil.example"), publicUrl),
    false,
  );
  assert.equal(
    hasTrustedOrigin(request("http://localhost:3000"), publicUrl),
    false,
  );
  assert.equal(hasTrustedOrigin(request("null"), publicUrl), false);
  assert.equal(hasTrustedOrigin(request(), publicUrl), false);
  assert.equal(hasTrustedOrigin(request("http://localhost:3000"), ""), true);
});

test("fx OAuth catalog uses the coding-agent endpoint with its bearer token", async () => {
  const { checkCatalog } = await import("../lib/server/gateway-device.js");
  const original = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(
      url,
      "https://ai-gateway.vercel.sh/coding-agent/v1/models?teamId=team_test",
    );
    assert.equal(options.headers.Authorization, "Bearer test-token");
    return Response.json({ data: [{ id: "model-a" }, { id: "model-b" }] });
  };
  try {
    const result = await checkCatalog({
      status: "connected",
      accessToken: "test-token",
      teamId: "team_test",
    });
    assert.equal(result.catalogStatus, 200);
    assert.equal(result.modelCount, 2);
  } finally {
    global.fetch = original;
  }
});
