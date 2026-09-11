import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { schedule, runWorker } from "../../../../lib/server/collector.js";
import { failure } from "../../../../lib/server/api.js";
export const maxDuration = 240;
export async function GET(request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
  const actual = Buffer.from(request.headers.get("authorization") || "");
  if (
    !process.env.CRON_SECRET ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return new Response("Unauthorized", { status: 401 });
  try {
    await schedule();
    try {
      await runWorker();
    } finally {
      // A worker can persist snapshots before another job fails.
      revalidateTag("osh-missing", { expire: 0 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
