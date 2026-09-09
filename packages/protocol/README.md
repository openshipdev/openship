# @openship/protocol

Canonical OpenShip 1.0 types, validators, source digest/diff helpers, selector matching, safe path/base64 utilities, browser discovery retrieval, and skill synchronization.

The package also exports the standard OpenShip Sources MCP tool/resource names and tool input types;
it deliberately does not depend on an MCP SDK.

```js
import { fetchOpenShip, validateSystems } from "@openship/protocol";

const imported = await fetchOpenShip("https://example.com");
if (imported.snapshot.kind === "systems") validateSystems(imported.snapshot.document);
```

The package contains the exact canonical `skills/openship` schemas, examples, and references. See the repository root README for the generated-skill workflow.

Version 0.1.0 replaces legacy Systems with `systemsVersion: "2.0"`: `system.layers`, `system.refinements`, and optional `system.instances`. Sources and Changes retain their 1.0 formats. Consumers must migrate; `validateSystems` explicitly rejects the legacy graph. Each layer is independently renderable, while node IDs and shared context span the entire system.
