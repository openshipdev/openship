# OpenShip

This repository is the sole source of truth for OpenShip 1.0.

- `skills/openship/` contains the canonical protocol skill, schemas, examples, and normative references.
- `packages/protocol/` publishes the browser/Node consumer package `@openship/protocol`.
- Protocol envelopes remain version `1.0`; package releases use independent semantic versions beginning at `0.0.1`.

## Consumer workflow

```sh
openship sync-skill skills/openship
openship verify-skill skills/openship
openship validate system.json
```

Consumers commit the synchronized skill tree so deployments can expose it without a runtime dependency on this repository. `UPSTREAM.json` pins the package version, source commit, exact file set, and digest. Consumers must verify it in pretest/CI and must not edit the generated copy.

Package releases are published from `protocol-v*` tags through npm trusted publishing with public access and provenance.
