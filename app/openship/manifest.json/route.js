import { openShipJson } from "../../../lib/openship-http.js";
import { sourcesManifest } from "../../../lib/openship-sources.generated.js";

export function GET() {
  return openShipJson(sourcesManifest);
}
