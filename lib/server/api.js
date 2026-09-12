import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "./db.js";
import { getSession, isAdmin } from "./auth.js";
export const apiError = (status, message) =>
  Object.assign(new Error(message), { status });
export async function mutation(
  request,
  { admin = false, scope = "write" } = {},
) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.BETTER_AUTH_URL || request.url).origin;
  if (origin !== expected)
    throw apiError(403, "This action must originate from OpenShip.");
  const session = await getSession(request.headers);
  if (admin && !isAdmin(session))
    throw apiError(403, "Administrator access required.");
  const address = process.env.VERCEL
    ? request.headers.get("x-vercel-forwarded-for") || "unknown"
    : "local";
  const identity = session?.user.id || address;
  const key = createHash("sha256")
    .update(`${scope}:${identity}:${Math.floor(Date.now() / 60000)}`)
    .digest("hex");
  const rows = await getDb().execute(
    sql`insert into rate_limits (key,count,expires_at) values (${key},1,now()+interval '2 minutes') on conflict (key) do update set count=rate_limits.count+1 returning count`,
  );
  if (rows[0].count > (session ? 30 : 10))
    throw apiError(429, "Too many requests. Try again in a minute.");
  return session;
}
export async function body(request) {
  if (Number(request.headers.get("content-length")) > 4096)
    throw apiError(413, "Request too large.");
  const reader = request.body?.getReader();
  if (!reader) throw apiError(400, "JSON body required.");
  let size = 0;
  const parts = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) throw apiError(413, "Request too large.");
      parts.push(value);
    }
    const value = JSON.parse(Buffer.concat(parts).toString());
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw apiError(400, "Supply a JSON object.");
    return value;
  } catch (e) {
    if (e.status) throw e;
    throw apiError(400, "Invalid JSON.");
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
export function failure(error) {
  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
      ? error.status
      : 503;
  return Response.json(
    {
      error:
        status !== 503
          ? error.message
          : "Project storage is temporarily unavailable.",
    },
    { status },
  );
}
