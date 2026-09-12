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

## Website and project directory

The website has `/`, `/view`, `/docs`, `/projects`, and `/osh/[oshHash]`. Project cards link to their latest saved snapshot, falling back to `/view` when none exists. Both viewer routes share the same project display: separate layer and instance selectors, graph/domain filters, the architecture canvas, and component details. Sources-only providers use a compact file browser. Existing documentation URLs redirect to `/docs?topic=...`; machine-readable protocol endpoints remain available.

Valid projects viewed by anyone are independently checked and listed. Signed-in views enable durable snapshots in private Cloudflare R2 storage, with metadata in Postgres. Better Auth supports GitHub and Google. Scheduled checks refresh projects daily and retain earlier snapshots; archived projects remain viewable when a provider disappears.

See [deployment and metadata documentation](docs/deployment.md) for database migrations, OAuth, R2 CORS, environment variables, administrator setup, retention behavior, and preview acceptance checks. Without configured storage, the browser viewer still works.

Share selections with `/view?url=...`, `layer`, `instance`, `node`, or `file`. The viewer validates published data and displays sources as text; it never executes provider content. Limits remain 1 MiB discovery, 64 MiB per document, 32 MiB decoded Sources, 30 seconds per request, and 2,000 nodes / 10,000 connections. Browser provider reads require CORS; local HTTP viewing is supported only in development. Server collection always requires public HTTPS and independently checks DNS and redirects.

## Snapshot caching (Next.js 16.3.5)

Cache Components is enabled. `/osh/[oshHash]` identifies a saved snapshot by its
DB `contentHash` and serves a prerendered shell with a Suspense skeleton. The
snapshot content streams from the server; no login or live provider fetch is needed.

- The entire `getOshSnapshot()` lookup uses `"use cache"`, including existence,
  visibility, and verified snapshot content. A fresh cache hit performs no DB
  queries or R2 reads. The page can also be prefetched.
- Snapshot lookups use `cacheLife("max")`: background
  revalidation after 30 days, hard expiration after one year. Cache hits avoid
  document reconstruction, JSON parsing, hashing, and protocol validation.
- The existing persistent Data Cache remains underneath: resource metadata and
  R2 byte ranges use `unstable_cache` with `revalidate: false` (no timed expiry).
  Each 1 MiB chunk fits below its 2 MB entry limit after base64 encoding.
- The default `use cache` handler is in-memory and can be evicted or reset by a
  restart/deploy. The Data Cache's persistence and sharing depend on the hosting
  environment. A miss repopulates safely from immutable DB/R2 data.
- Entries have `osh:<hash>` and `osh-project:<projectId>` tags. Admin hide/unhide
  changes immediately expire the project tag. Missing/hidden results use the
  `osh-missing` tag, expired after collection or visibility changes so a previous
  404 does not mask a newly saved or unhidden snapshot. Mutation handlers use
  `revalidateTag(tag, { expire: 0 })`, so the next server read waits for fresh data.
  Direct DB edits require the same invalidation. Already downloaded browser
  content cannot be recalled.

This follows Next's [Cache Components migration guidance](https://nextjs.org/docs/app/guides/migrating-to-cache-components),
which supports retaining an existing Data Cache beneath `use cache`.
Do not replace that layer with plain `use cache` and assume durable caching;
shared remote caching requires a hosting-provided or configured cache handler.

## Layered Systems release

`@openship/protocol` 0.1.0 introduces Systems 2.0 (`systemsVersion: "2.0"`). Consumers must use ordered `system.layers`, explicit `system.refinements`, and optional `system.instances`; the old graph is rejected. Sources and Changes remain compatible. The viewer renders one layer at a time and binds instances separately.

Release the tested protocol tarball before deploying migrated consumers. Memorioso must pin 0.1.0 and synchronize its vendored skill with that exact artifact. Roll out the updated viewer and Memorioso together; consumers can explicitly select Sources while a provider still serves legacy Systems. Secret and snapshot references remain descriptive and unresolved.

### Vercel login and profile

Create a [Sign in with Vercel app](https://vercel.com/docs/sign-in-with-vercel/getting-started) and configure:

- Scopes: `openid email profile offline_access` (email is required by the existing account system).
- Client authentication: `client_secret_post`.
- Callback URL: `<BETTER_AUTH_URL>/api/auth/callback/vercel`, for example `http://localhost:3000/api/auth/callback/vercel`. Register each production/local callback explicitly.
- Server environment variables: `VERCEL_CLIENT_ID` and `VERCEL_CLIENT_SECRET`, plus the existing `DATABASE_URL`, `BETTER_AUTH_URL`, and stable `BETTER_AUTH_SECRET`.

Restart the app after configuring credentials. Choose **Log in → Vercel**, or open `/profile`. Existing Google/GitHub users can explicitly switch accounts from that page; automatic email-based account linking stays disabled.

The integration uses Better Auth's generic OAuth provider for Authorization Code + S256 PKCE and refresh-token support. Tokens are stored encrypted in the existing `auth_account` table; no schema migration is needed. Refresh operations use a database transaction and per-user advisory lock to persist rotated tokens atomically. The public token retrieval/refresh endpoints are blocked; only server-side code retrieves credentials.

After Vercel login, the app redirects through `/api/integrations/vercel/install` to `https://vercel.com/integrations/openship-dev/new` with a one-time state. Existing users can also connect from `/profile`.

Configure the **openship-dev integration**, separately from the login app:

- Redirect URL: `https://openship-dev.staffx.dev/api/integrations/callback/vercel`
- Permissions: **Project: Read**, and grant access to the projects to display.
- Server environment: `VERCEL_INTEGRATION_CLIENT_ID` and `VERCEL_INTEGRATION_CLIENT_SECRET` from the Integrations Console. These are separate from `VERCEL_CLIENT_ID` and `VERCEL_CLIENT_SECRET`.
- Apply database migrations with the configured `DATABASE_URL` before deploying. The `vercel_installations` table stores encrypted installation tokens and their owning user/team.

The installation must be started on `openship-dev.staffx.dev` (the callback host) with the logged-in user's session. The callback checks the one-time state against an HttpOnly cookie and database record, binds it to the same session and Vercel identity, exchanges the authorization code at `/v2/oauth/access_token`, and redirects to `/profile`. Untrusted callback `next` URLs are not followed. Failed or expired attempts can be restarted from the profile.

`/profile` uses the installation token to fetch `/v9/projects` scoped to the installation's team. It shows project names, frameworks and creation dates, with pagination and selection between installed connections. Tokens and raw project settings or environment variables never reach the browser. Revoked installations or missing permissions produce an access error; login tokens are not used as a fallback. AI Gateway is not called.

Run `pnpm test:vercel` for OAuth, installation security, and Vercel API regression checks.

The profile also offers a separate **AI Gateway via fx** device authorization.
It uses the public client ID from `vercel-labs/fx` commit
`95b567af7c6f9ff079bb0b665b39864326bbacfd`, with `openid offline_access`.
The UI identifies the fx registration before users approve it. This connection
requires an OpenShip session but does not require a Vercel login or installation.
Device codes, access tokens and rotating refresh tokens are encrypted in
`gateway_connections`; only approval links, user codes and connection status
reach the browser. Pending approvals are bound to the initiating session.
Polling respects Vercel's interval, slowdown responses and expiry. Concurrent
polls and refreshes are serialized. The profile checks the authenticated model
catalog after approval; this does not verify inference billing. Disconnect removes
the local connection; users can revoke the authorization in Vercel.
