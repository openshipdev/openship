import { getAuth } from "../../../../lib/server/auth.js";
export async function GET(request) {
  if (!process.env.DATABASE_URL)
    return Response.json(
      { message: "Login is not configured." },
      { status: 503 },
    );
  return getAuth().handler(request);
}
export const POST = GET;
