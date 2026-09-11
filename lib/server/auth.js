import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { dash } from "@better-auth/infra";
import { getDb } from "./db.js";
import * as schema from "../../db/schema.js";
let auth;
export function getAuth() {
  return (auth ??= betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      },
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
    },
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    plugins: [
      dash()
    ]
  }));
}
export async function getSession(headers) {
  return process.env.DATABASE_URL
    ? getAuth().api.getSession({ headers })
    : null;
}
export function isAdmin(session) {
  return Boolean(
    session?.user?.id &&
    (process.env.ADMIN_USER_IDS || "")
      .split(",")
      .map((x) => x.trim())
      .includes(session.user.id),
  );
}
