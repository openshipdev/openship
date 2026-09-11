# Project directory deployment

## Infrastructure

Keep the Next.js app on Vercel with the Node.js runtime. Create a Neon Postgres database and a **private** Cloudflare R2 bucket. Use separate databases, buckets, OAuth applications, and secrets for development/preview and production. Nothing in this implementation provisions or purchases infrastructure automatically.

The app needs a Vercel plan supporting the five-minute cron in `vercel.json`, 240-second function duration, and enough memory for documents up to 64 MiB and a 32 MiB decoded source snapshot. Verify those limits in the deployment dashboard before enabling production. The collector stops starting requests before its time budget runs out; Postgres leases and per-resource checkpoints recover interrupted work.

Copy `.env.example` to `.env.local` for local Next.js. Set matching variables in Vercel:

| Variable                                   | Purpose                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | Neon pooled Postgres connection string; use its required TLS settings.                               |
| `BETTER_AUTH_URL`                          | Exact canonical application origin, e.g. `https://openship.dev`. Redirect alternate hostnames to it. |
| `BETTER_AUTH_SECRET`                       | Cryptographically random secret of at least 32 characters.                                           |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub OAuth app credentials.                                                                        |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth web application credentials.                                                            |
| `ADMIN_USER_IDS`                           | Comma-separated Better Auth user IDs with curation access. Empty means no administrators.            |
| `R2_ACCOUNT_ID`, `R2_BUCKET`               | Cloudflare account and private bucket.                                                               |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | S3 credentials scoped to object read/write in this bucket.                                           |
| `CRON_SECRET`                              | Random bearer secret for `/api/internal/collect`; Vercel sends it automatically.                     |

The migration CLI reads `DATABASE_URL` from the shell (it does not load `.env.local`). Set it in your deployment/migration environment, then run `pnpm db:migrate` **before** deploying the new app. Generate future reviewed migrations with `pnpm db:generate`; do not use schema push against production. The checked-in initial migration includes the Better Auth user/account/session/verification schema matching the configured Drizzle adapter, project tables, and constraints.

## OAuth

Register these callback URLs on each OAuth application:

- GitHub: `<BETTER_AUTH_URL>/api/auth/callback/github`
- Google: `<BETTER_AUTH_URL>/api/auth/callback/google`

For Google, also set the authorized JavaScript origin to `BETTER_AUTH_URL`. Request basic profile/email access only; project collection never uses provider access tokens. Cross-provider account linking is disabled; use the original provider if the same email is already registered. OAuth tokens are encrypted at rest using the Better Auth secret.

After signing in, obtain the intended administrator's `auth_user.id` using a private database console and add it to `ADMIN_USER_IDS`; redeploy. All curation is server-authorized and audited. There is no public ownership-claim flow.

## R2 browser reads

Keep public bucket access disabled. Allow cross-origin `GET` and `HEAD` from the production and dedicated preview origins in the bucket's CORS policy; expose `Content-Length`, `Content-Type`, and `ETag`. Example (replace origins):

```json
[
  {
    "AllowedOrigins": ["https://openship.dev", "https://preview.example.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Type", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

The API returns five-minute signed GET URLs for validated resources of visible projects. Objects are delivered as attachments/octet-stream and parsed as inert data by the viewer; provider HTML and code are never executed. Curation hiding prevents new signed URLs; already-issued URLs expire within five minutes.

## Collection and retained metadata

`POST /api/projects/observe` accepts only a URL and derives identity from the session. The server independently validates discovery and Sources; invalid new projects are never listed. Anonymous checks discard content after validation and do not write R2 objects. Authenticated views authorize full capture, and daily jobs maintain that authorization. Anonymous checks never remove existing archives. Sources-only projects are valid.

`projects` stores `productDescription`, `productSummary`, `technicalDescription`, and `technicalSummary` in dedicated columns for fast listing and detail reads. Description columns are constrained to 1–120 characters; summary columns contain Markdown. The summaries migration assumes an empty projects table and removes the legacy description column without backfilling. `projects` also contains normalized identity, availability and failure counters, curation, observation/archive pointers, and discovery/view/check/retrieval/archive/next-check timestamps. The separate archive timestamp prevents anonymous metadata checks from postponing full refreshes. `metadata` JSONB stores homepage, repository, license, extensible project fields, stack, protocol versions, advertised capability endpoints, agent metadata, provider page, source digest, provider-generated time, commit SHA/ref/date/dirty state, file/byte totals, and graph counts. These descriptive fields are provider claims, not verified ownership or live infrastructure inventory.

`retrievals` records the actor, trigger, mode, queued/start/completion times, validation result, error/HTTP category, snapshot pointer, and observed metadata. `snapshots` stores content hashes, source digest, completeness, retrieval time, metadata, and inventory key. `snapshot_resources` records original/final URLs, fetch time, HTTP/cache headers, media type, size, content hash, object key, and capture/validation result for each resource. `collection_jobs` records leases, retries, and resource progress. `curation_audit` records administrator changes. Auth records are never exposed through the directory API.

Full capture saves discovery, separate advertised Sources, optional Systems (including embedded Sources), skill, source instructions, changes policy, provider page, and archive. Other links remain recorded but are never recursively crawled or invoked. Optional failures produce partial snapshots; `hasFullBundle` specifically means a validated Sources bundle was saved. The most recent complete archive is preferred for offline viewing, falling back to a partial archive with valid Sources if no complete archive exists.

Distinct snapshots are retained indefinitely; identical contents reuse the snapshot. Retrieval records still record each check. Object writes precede database publication: interrupted or invalid captures may leave unreferenced private objects. Do not configure blanket expiration on `objects/`, since live snapshots deduplicate across that prefix. Any later garbage collection must preserve keys referenced by snapshots **and active jobs**.

## Operations and preview acceptance

Run `pnpm test` and `pnpm build`. To exercise the real database pipeline, migrate a disposable database and run `TEST_DATABASE_URL=... pnpm test:collection`. The integration test truncates project tables in that explicitly selected test database and uses an in-memory object-store double; it must never target production.

In an isolated preview, verify both OAuth callbacks, logout/session expiry, signed-in capture against the real private bucket, CORS/signed URL expiry, offline fallback, and cron delivery. Test featured slots and hidden projects with an administrator account, then without it. Repeat the browser checks at desktop and phone widths.

Administrators see queued/running/failed counts and the last scheduler invocation under Collection health on `/projects`. Monitor Vercel cron errors, growing job backlog, repeated failed retrievals, and a scheduler timestamp older than ten minutes. A job retries at increasing minute delays up to three claims; interrupted runs resume after the five-minute lease expires. Storage failures preserve saved archives and do not change provider availability. Provider transport failures mark unreachable; invalid core documents mark invalid. Discovery 404/410 requires three daily checks to mark missing; successful validation restores available.

Deploy the migration first, then the app and environment, and verify one real capture before enabling general traffic. Rollback can disable cron and restore the prior app without dropping the additive tables or objects. Browser-based viewing remains usable during storage outages; the directory reports temporary unavailability. The local integration tests verify OAuth initiation, sessions, expiry, logout, curation authorization, and audit writes. Live provider callback completion and real R2 reads/writes still require the configured preview checks above. No production deployment is implied by local tests.
