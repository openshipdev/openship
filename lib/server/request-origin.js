// A reverse proxy may expose an internal host through request.url. Use the
// configured public auth origin; never derive trust from forwarded headers.
export function hasTrustedOrigin(
  request,
  publicUrl = process.env.BETTER_AUTH_URL,
) {
  try {
    const expected = new URL(publicUrl || request.url).origin;
    return expected !== "null" && request.headers.get("origin") === expected;
  } catch {
    return false;
  }
}
