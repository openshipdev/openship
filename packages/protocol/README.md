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
