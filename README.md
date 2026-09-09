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

## This site is OpenShip Sources compliant

The production site publishes only the Sources capability:

- `/.well-known/openship.json` advertises the current snapshot.
- `/openship/manifest.json` describes the declared file set and its digest.
- `/openship/bundle.json` contains the complete, verifiable source snapshot.

`openship.sources.json` is the fail-closed publication allowlist. The site build generates the
served Manifest and Bundle from that exact list and refuses unsafe or secret-shaped paths.


## Browser viewer

`/view?url=https%3A%2F%2Fexample.com` opens a public OpenShip provider directly in the browser.
The viewer validates discovery and prefers Systems, using its embedded Sources for both views.
A failed Systems load offers an explicit Sources fallback. There is no backend URL-fetch proxy,
account, database, or uploaded project. Providers must allow CORS, including on redirects;
use the final canonical site URL when a hosting-level redirect does not supply CORS headers.

Share a selection with `view=sources|system`, `panel=architecture|connections|context`, and
`node` or `file`. Source files and context are displayed as text, never executed. Optional
numeric `metadata.order` affects diagram ordering; all conformant v1 graphs work without it.
The current browser limits are 1 MiB discovery, 64 MiB per document, 32 MiB decoded Sources,
30 seconds per request, and 2,000 nodes / 10,000 connections for diagrams. Loopback HTTP is
available only in development. Run `pnpm test:viewer` for loader, validation and URL-state tests.

## Layered Systems release

`@openship/protocol` 0.1.0 introduces Systems 2.0 (`systemsVersion: "2.0"`). Consumers must use ordered `system.layers`, explicit `system.refinements`, and optional `system.instances`; the old graph is rejected. Sources and Changes remain compatible. The viewer renders one layer at a time and binds instances separately.

Release the tested protocol tarball before deploying migrated consumers. Memorioso must pin 0.1.0 and synchronize its vendored skill with that exact artifact. Roll out the updated viewer and Memorioso together; consumers can explicitly select Sources while a provider still serves legacy Systems. Secret and snapshot references remain descriptive and unresolved.
