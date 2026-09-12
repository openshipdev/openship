import { getAuth } from "../../../../lib/server/auth.js";
export async function GET(request) {
  if (!process.env.DATABASE_URL)
    return Response.json(
      { message: "Login is not configured." },
      { status: 503 },
    );
  // Provider credentials and refresh operations are server-only.
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (
    ["/get-access-token", "/refresh-token"].some((suffix) =>
      path.endsWith(suffix),
    )
  )
    return Response.json({ message: "Not found." }, { status: 404 });
  return getAuth().handler(request);
}
export const POST = GET;
