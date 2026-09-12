// Generic OAuth supplies refresh support missing from the built-in Vercel provider.
export function vercelOAuthConfig() {
  return {
    providerId: "vercel",
    name: "Vercel",
    clientId: process.env.VERCEL_CLIENT_ID,
    clientSecret: process.env.VERCEL_CLIENT_SECRET,
    authorizationUrl: "https://vercel.com/oauth/authorize",
    tokenUrl: "https://api.vercel.com/login/oauth/token",
    scopes: ["openid", "email", "profile", "offline_access"],
    pkce: true,
    authentication: "post",
    accountSubject: ({ profile }) => profile.sub,
    // Resolve identity from the authenticated endpoint, never unverified JWT claims.
    async getUserInfo({ accessToken }) {
      const response = await fetch(
        "https://api.vercel.com/login/oauth/userinfo",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) return null;
      return response.json();
    },
    mapProfileToUser: (profile) => ({
      name: profile.name || profile.preferred_username || "Vercel user",
      email: profile.email,
      emailVerified: profile.email_verified === true,
      image: profile.picture,
    }),
  };
}
