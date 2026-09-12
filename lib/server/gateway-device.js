import { eq, sql } from "drizzle-orm";
import { symmetricEncrypt, symmetricDecrypt } from "better-auth/crypto";
import { getDb } from "./db.js";
import { gatewayConnections } from "../../db/schema.js";

// vercel-labs/fx @ 95b567af7c6f9ff079bb0b665b39864326bbacfd
// src/core/auth/oauth_session.zig and oauth.zig
export const CLIENT_ID = "cl_zzh5hiOZbwJ9bfqEcYqPIJv3TaPaEYL0";
const base = "https://api.vercel.com/login/oauth/";
export async function oauthRequest(endpoint, fields) {
  const response = await fetch(base + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...fields }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json();
  if (!response.ok && !data.error) throw new Error("OAuth request failed");
  return data;
}
export function parseDevice(data, sessionId, now = Date.now()) {
  if (data.error) throw new Error("Device authorization rejected");
  const url = new URL(data.verification_uri_complete || data.verification_uri);
  if (
    url.origin !== "https://vercel.com" ||
    url.pathname !== "/oauth/device" ||
    typeof data.device_code !== "string" ||
    !data.device_code ||
    typeof data.user_code !== "string" ||
    !data.user_code ||
    !Number.isFinite(data.expires_in) ||
    data.expires_in <= 0
  )
    throw new Error("Invalid device authorization");
  url.searchParams.set("user_code", data.user_code);
  const interval = Math.max(5, Number(data.interval) || 5) * 1000;
  return {
    status: "pending",
    sessionId,
    deviceCode: data.device_code,
    userCode: data.user_code,
    url: url.href,
    expiresAt: now + data.expires_in * 1000,
    interval,
    nextPoll: now + interval,
  };
}
export function publicState(state, sessionId, now = Date.now()) {
  if (!state) return { status: "disconnected" };
  if (state.status === "pending") {
    if (state.sessionId !== sessionId) return { status: "disconnected" };
    if (state.expiresAt <= now) return { status: "expired" };
    return {
      status: "pending",
      userCode: state.userCode,
      url: state.url,
      expiresAt: state.expiresAt,
      pollAfter: Math.max(1000, state.nextPoll - now),
    };
  }
  return {
    status: state.status,
    expiresAt: state.expiresAt,
    modelCount: state.modelCount,
    catalogStatus: state.catalogStatus,
    teams: state.teams || [],
    teamId: state.teamId || "",
    teamsError: state.teamsError,
  };
}
export async function gatewayDevice(session, action = "status", teamId) {
  return getDb().transaction(async (tx) => {
    // Serialize starts, polls and refresh rotation across tabs and instances.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${"gateway-device:" + session.user.id}))`,
    );
    const [row] = await tx
      .select()
      .from(gatewayConnections)
      .where(eq(gatewayConnections.userId, session.user.id));
    let state = row
      ? JSON.parse(
          await symmetricDecrypt({
            key: process.env.BETTER_AUTH_SECRET,
            data: row.state,
          }),
        )
      : null;
    const now = Date.now();
    if (action === "disconnect") {
      await tx
        .delete(gatewayConnections)
        .where(eq(gatewayConnections.userId, session.user.id));
      return { status: "disconnected" };
    }
    if (action === "start") {
      if (
        state?.status !== "pending" ||
        state.expiresAt <= now ||
        state.sessionId !== session.session.id
      )
        state = parseDevice(
          await oauthRequest("device-authorization", {
            scope: "openid offline_access",
          }),
          session.session.id,
        );
    } else if (action === "poll" && state?.status === "pending") {
      if (state.sessionId !== session.session.id)
        return { status: "disconnected" };
      if (state.expiresAt <= now) state = { status: "expired" };
      else if (state.nextPoll <= now) {
        let data;
        try {
          data = await oauthRequest("token", {
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: state.deviceCode,
          });
        } catch {
          data = { error: "authorization_pending" };
        }
        if (
          data.error === "authorization_pending" ||
          data.error === "slow_down"
        ) {
          if (data.error === "slow_down") state.interval += 5000;
          state.nextPoll = Date.now() + state.interval;
        } else if (data.error)
          state = {
            status: data.error === "access_denied" ? "denied" : "expired",
          };
        else state = await tokenState(data);
      }
    } else if (
      ["check", "team"].includes(action) &&
      state?.status === "connected"
    ) {
      if (state.expiresAt <= now + 60000) {
        // On an uncertain refresh result, require reauthorization rather than
        // replaying a refresh token which may already have been rotated.
        try {
          state = await tokenState(
            await oauthRequest("token", {
              grant_type: "refresh_token",
              refresh_token: state.refreshToken,
            }),
            state.teamId,
          );
        } catch {
          state = { status: "expired" };
        }
      }
      if (state.status === "connected") {
        state = await loadTeams(state);
        if (action === "team") {
          if (!state.teams.some((team) => team.id === teamId))
            throw new Error("Team is not available to this connection");
          state.teamId = teamId;
        }
        state = await checkCatalog(state);
      }
    }
    if (action !== "status" && state) {
      const encrypted = await symmetricEncrypt({
        key: process.env.BETTER_AUTH_SECRET,
        data: JSON.stringify(state),
      });
      await tx
        .insert(gatewayConnections)
        .values({ userId: session.user.id, state: encrypted })
        .onConflictDoUpdate({
          target: gatewayConnections.userId,
          set: { state: encrypted, updatedAt: new Date() },
        });
    }
    return publicState(state, session.session.id);
  });
}
async function tokenState(data, teamId) {
  if (
    data.error ||
    typeof data.access_token !== "string" ||
    !data.access_token ||
    typeof data.refresh_token !== "string" ||
    !data.refresh_token ||
    !Number.isFinite(data.expires_in) ||
    data.expires_in <= 0 ||
    data.token_type?.toLowerCase() !== "bearer"
  )
    return { status: "expired" };
  return loadTeams({
    teamId,
    status: "connected",
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
}
export async function checkCatalog(state) {
  if (!state.teamId) return { ...state, catalogStatus: null, modelCount: null };
  try {
    const response = await fetch(
      `https://ai-gateway.vercel.sh/coding-agent/v1/models?teamId=${encodeURIComponent(state.teamId)}`,
      {
        headers: { Authorization: `Bearer ${state.accessToken}` },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = await response.json();
    return {
      ...state,
      catalogStatus: response.status,
      modelCount:
        response.ok && Array.isArray(data.data) ? data.data.length : null,
    };
  } catch {
    return { ...state, catalogStatus: null, modelCount: null };
  }
}

async function loadTeams(state) {
  try {
    const teams = [];
    let until;
    const seen = new Set();
    do {
      const url = new URL("https://api.vercel.com/v2/teams");
      url.searchParams.set("limit", "100");
      if (until) url.searchParams.set("until", until);
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${state.accessToken}` },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Teams unavailable");
      const data = await response.json();
      if (!Array.isArray(data.teams)) throw new Error("Invalid teams");
      for (const team of data.teams) {
        if (
          typeof team.id === "string" &&
          typeof team.name === "string" &&
          !teams.some((t) => t.id === team.id)
        )
          teams.push({ id: team.id, name: team.name });
      }
      until = data.pagination?.next ? String(data.pagination.next) : null;
      if (until && (seen.has(until) || seen.size >= 20))
        throw new Error("Invalid pagination");
      if (until) seen.add(until);
    } while (until);
    return {
      ...state,
      teams,
      teamsError: null,
      teamId: teams.some((t) => t.id === state.teamId) ? state.teamId : "",
    };
  } catch {
    return {
      ...state,
      teams: [],
      teamId: "",
      teamsError: "Unable to load Vercel teams. Check Gateway access to retry.",
    };
  }
}
