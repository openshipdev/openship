import { hasTrustedOrigin } from "../../../../lib/server/request-origin.js";
import { getSession } from "../../../../lib/server/auth.js";
import { gatewayDevice } from "../../../../lib/server/gateway-device.js";
const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(request) {
  try {
    const session = await getSession(request.headers);
    if (!session) return json({ error: "Log in to OpenShip first." }, 401);
    return json(await gatewayDevice(session));
  } catch {
    return json({ error: "Gateway connection status is unavailable." }, 503);
  }
}
export async function POST(request) {
  if (!hasTrustedOrigin(request))
    return json({ error: "Invalid request origin." }, 403);
  try {
    const session = await getSession(request.headers);
    if (!session) return json({ error: "Log in to OpenShip first." }, 401);
    const { action, teamId } = await request.json();
    if (!["start", "poll", "check", "disconnect", "team"].includes(action))
      return json({ error: "Invalid action." }, 400);
    if (
      action === "team" &&
      (typeof teamId !== "string" || teamId.length > 200)
    )
      return json({ error: "Invalid team." }, 400);
    return json(await gatewayDevice(session, action, teamId));
  } catch {
    return json(
      {
        error:
          "Vercel device authorization could not be completed. Please try again.",
      },
      502,
    );
  }
}
