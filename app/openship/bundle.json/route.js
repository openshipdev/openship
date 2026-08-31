import { openShipJson } from "../../../lib/openship-http.js";
import { sourcesBundle } from "../../../lib/openship-sources.generated.js";

export function GET() {
  return openShipJson(sourcesBundle);
}
