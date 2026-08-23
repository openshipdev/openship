# @openship/protocol

Canonical OpenShip 1.0 types, validators, source digest/diff helpers, selector matching, safe path/base64 utilities, browser discovery retrieval, and skill synchronization.

```js
import { fetchOpenShip, validateSystems } from "@openship/protocol";

const imported = await fetchOpenShip("https://example.com");
if (imported.snapshot.kind === "systems") validateSystems(imported.snapshot.document);
```

The package contains the exact canonical `skills/openship` schemas, examples, and references. See the repository root README for the generated-skill workflow.
