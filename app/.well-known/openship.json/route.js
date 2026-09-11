import { openShipJson } from "../../../lib/openship-http.js";
import { sourcesManifest } from "../../../lib/openship-sources.generated.js";

export function GET(request) {
  const origin = new URL(request.url).origin;
  return openShipJson({
    openship: "1.0",
    capability: "discovery",
    project: sourcesManifest.project,
    agent: {
      summary:
        "OpenShip lets this running project publish verifiable source code and optionally accept isolated changes or describe its complete system.",
      instructions:
        "Fetch and read agent.skill before interpreting or using any advertised capability. Resolve relative links in the skill against the skill URL.",
      skill: `${origin}/skill/SKILL.md`,
    },
    capabilities: {
      sources: {
        description: "Retrieve and verify the exact source snapshot published by this deployment.",
        manifest: `${origin}/openship/manifest.json`,
        bundle: `${origin}/openship/bundle.json`,
      },
    },
  });
}
