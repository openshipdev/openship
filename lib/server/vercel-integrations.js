import { and, eq, gt } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { symmetricEncrypt } from "better-auth/crypto";
import { account, verification, vercelInstallations } from "../../db/schema.js";
import { getDb } from "./db.js";
import { vercelError } from "./vercel-api.js";
import {
  exchangeInstallationCode,
  validateInstallationIdentity,
} from "./vercel-integration-api.js";
const identifier = (state) =>
  `vercel-install:${createHash("sha256").update(state).digest("hex")}`;
export async function beginInstallation(session) {
  if (!session) throw vercelError(401, "Log in with Vercel first.");
  const [linked] = await getDb()
    .select({ accountId: account.accountId })
    .from(account)
    .where(
      and(
        eq(account.userId, session.user.id),
        eq(account.providerId, "vercel"),
      ),
    );
  if (!linked) throw vercelError(403, "Log in with Vercel first.");
  const state = randomBytes(32).toString("base64url");
  await getDb()
    .insert(verification)
    .values({
      identifier: identifier(state),
      value: JSON.stringify({
        userId: session.user.id,
        sessionId: session.session.id,
        vercelUserId: linked.accountId,
      }),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
  return state;
}
export async function completeInstallation({
  session,
  state,
  cookieState,
  code,
  configurationId,
}) {
  if (
    !session ||
    typeof state !== "string" ||
    !state ||
    state !== cookieState ||
    state.length > 128
  )
    throw vercelError(
      403,
      "Installation session expired. Please connect again from your profile.",
    );
  // Atomically consume the short-lived, session-bound install attempt.
  const [attempt] = await getDb()
    .delete(verification)
    .where(
      and(
        eq(verification.identifier, identifier(state)),
        gt(verification.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!attempt)
    throw vercelError(
      403,
      "Installation session expired. Please connect again from your profile.",
    );
  const pending = JSON.parse(attempt.value);
  if (
    pending.userId !== session.user.id ||
    pending.sessionId !== session.session.id
  )
    throw vercelError(
      403,
      "Your login changed during installation. Please connect again.",
    );
  if (!code) {
    const [existing] = await getDb()
      .select({ id: vercelInstallations.id })
      .from(vercelInstallations)
      .where(
        and(
          eq(vercelInstallations.id, configurationId || ""),
          eq(vercelInstallations.userId, session.user.id),
        ),
      );
    if (existing) return;
    throw vercelError(
      400,
      "Vercel did not return an installation code. Please reinstall the integration.",
    );
  }
  const data = await exchangeInstallationCode(code);
  validateInstallationIdentity(data, pending.vercelUserId, configurationId);
  const accessToken = await symmetricEncrypt({
    key: process.env.BETTER_AUTH_SECRET,
    data: data.access_token,
  });
  const saved = await getDb()
    .insert(vercelInstallations)
    .values({
      id: data.installation_id,
      userId: session.user.id,
      vercelUserId: data.user_id,
      teamId: data.team_id || null,
      accessToken,
    })
    .onConflictDoUpdate({
      target: vercelInstallations.id,
      set: { accessToken, teamId: data.team_id || null, updatedAt: new Date() },
      setWhere: eq(vercelInstallations.userId, session.user.id),
    })
    .returning({ id: vercelInstallations.id });
  if (!saved.length)
    throw vercelError(
      403,
      "This installation is connected to another OpenShip account.",
    );
}
