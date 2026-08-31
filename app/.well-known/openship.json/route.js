import { openShipJson } from "../../../lib/openship-http.js";
import { sourcesManifest } from "../../../lib/openship-sources.generated.js";

export function GET(request) {
  const origin = new URL(request.url).origin;
  return openShipJson({
    openship: "1.0",
    capability: "discovery",
    project: sourcesManifest.project,
    capabilities: {
      sources: {
        manifest: `${origin}/openship/manifest.json`,
        bundle: `${origin}/openship/bundle.json`,
      },
    },
  });
}
