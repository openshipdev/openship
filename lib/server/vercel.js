import { and, eq, sql } from "drizzle-orm";
import { account } from "../../db/schema.js";
import { getAuth } from "./auth.js";
import { getDb } from "./db.js";
import { vercelError } from "./vercel-api.js";

export async function getVercelAccess(session, headers) {
  if (!session) throw vercelError(401, "Log in to view your profile.");
  // Serialize refreshes across application instances. Better Auth persists the
  // encrypted replacement tokens before releasing this per-user lock.
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`vercel:${session.user.id}`}, 0))`,
    );
    const [linked] = await tx
      .select({ id: account.id })
      .from(account)
      .where(
        and(
          eq(account.userId, session.user.id),
          eq(account.providerId, "vercel"),
        ),
      );
    if (!linked) return null;
    try {
      const result = await getAuth(tx).api.getAccessToken({
        headers,
        body: { accountId: linked.id },
      });
      if (!result.accessToken) throw new Error("Missing token");
      return result.accessToken;
    } catch {
      throw vercelError(
        401,
        "Vercel access could not be refreshed. Please log out and log in with Vercel again.",
      );
    }
  });
}
