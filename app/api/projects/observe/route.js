import { after } from "next/server";
import { enqueue, runWorker } from "../../../../lib/server/collector.js";
import {
  mutation,
  body,
  failure,
  apiError,
} from "../../../../lib/server/api.js";
export const maxDuration = 240;
export async function POST(request) {
  try {
    const session = await mutation(request);
    const input = await body(request);
    if (
      typeof input.url !== "string" ||
      Object.keys(input).some((k) => k !== "url")
    )
      throw apiError(400, "Supply only a project URL.");
    let result;
    try {
      result = await enqueue(input.url, session?.user.id);
    } catch (e) {
      if (e.code === "url" || e instanceof TypeError)
        throw apiError(400, "Use a public HTTPS project URL.");
      throw e;
    }
    if (result.jobId) after(() => runWorker());
    return Response.json(result, { status: result.jobId ? 202 : 200 });
  } catch (e) {
    return failure(e);
  }
}
