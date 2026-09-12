import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const time = (name) => timestamp(name, { withTimezone: true, mode: "date" });
const created = () => time("created_at").notNull().defaultNow();
export const user = pgTable("auth_user", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: created(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});
export const session = pgTable("auth_session", {
  id: id(),
  expiresAt: time("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: created(),
  updatedAt: time("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
export const account = pgTable("auth_account", {
  id: id(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: time("access_token_expires_at"),
  refreshTokenExpiresAt: time("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: created(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});
export const verification = pgTable("auth_verification", {
  id: id(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: time("expires_at").notNull(),
  createdAt: created(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});
export const projects = pgTable(
  "projects",
  {
    id: id(),
    origin: text("origin").notNull().unique(),
    name: text("name").notNull(),
    productDescription: text("product_description").notNull(),
    productSummary: text("product_summary").notNull(),
    technicalDescription: text("technical_description").notNull(),
    technicalSummary: text("technical_summary").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    firstDiscoveredAt: created(),
    lastViewedAt: time("last_viewed_at"),
    lastCheckedAt: time("last_checked_at"),
    lastRetrievedAt: time("last_retrieved_at"),
    lastArchivedAt: time("last_archived_at"),
    nextCheckAt: time("next_check_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
    discoveredBy: text("discovered_by"),
    availability: text("availability").notNull().default("available"),
    failureCount: integer("failure_count").notNull().default(0),
    missingCount: integer("missing_count").notNull().default(0),
    lastMissingAt: time("last_missing_at"),
    failureSince: time("failure_since"),
    lastError: text("last_error"),
    hasFullBundle: boolean("has_full_bundle").notNull().default(false),
    latestObservationId: text("latest_observation_id"),
    latestSnapshotId: text("latest_snapshot_id"),
    latestCompleteSnapshotId: text("latest_complete_snapshot_id"),
    archiveEnabledAt: time("archive_enabled_at"),
    isTop: boolean("is_top").notNull().default(false),
    isPromoted: boolean("is_promoted").notNull().default(false),
    featuredPosition: integer("featured_position"),
    hidden: boolean("hidden").notNull().default(false),
  },
  (t) => [
    check(
      "product_description_length",
      sql`char_length(${t.productDescription}) between 1 and 120`,
    ),
    check(
      "technical_description_length",
      sql`char_length(${t.technicalDescription}) between 1 and 120`,
    ),
    uniqueIndex("featured_slot").on(t.featuredPosition),
    check("featured_range", sql`${t.featuredPosition} between 1 and 3`),
    check(
      "availability_values",
      sql`${t.availability} in ('available','unreachable','missing','invalid')`,
    ),
    index("projects_due").on(t.nextCheckAt),
  ],
);
export const snapshots = pgTable(
  "snapshots",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    contentHash: text("content_hash").notNull(),
    sourceDigest: text("source_digest").notNull(),
    retrievedAt: created(),
    completeness: text("completeness").notNull(),
    metadata: jsonb("metadata").notNull(),
    inventoryKey: text("inventory_key").notNull(),
  },
  (t) => [uniqueIndex("snapshot_content").on(t.projectId, t.contentHash)],
);
export const resources = pgTable("snapshot_resources", {
  id: id(),
  snapshotId: text("snapshot_id")
    .notNull()
    .references(() => snapshots.id),
  kind: text("kind").notNull(),
  originalUrl: text("original_url").notNull(),
  finalUrl: text("final_url"),
  retrievedAt: created(),
  status: integer("status"),
  etag: text("etag"),
  lastModified: text("last_modified"),
  mediaType: text("media_type"),
  bytes: integer("bytes"),
  sha256: text("sha256"),
  objectKey: text("object_key"),
  result: text("result").notNull(),
  error: text("error"),
});
export const retrievals = pgTable("retrievals", {
  id: id(),
  projectId: text("project_id").references(() => projects.id),
  userId: text("user_id"),
  trigger: text("trigger").notNull(),
  mode: text("mode").notNull(),
  queuedAt: created(),
  startedAt: time("started_at"),
  completedAt: time("completed_at"),
  result: text("result").notNull(),
  error: text("error"),
  metadata: jsonb("metadata").notNull().default({}),
  snapshotId: text("snapshot_id").references(() => snapshots.id),
});
export const jobs = pgTable(
  "collection_jobs",
  {
    id: id(),
    origin: text("origin").notNull(),
    projectId: text("project_id").references(() => projects.id),
    userId: text("user_id"),
    trigger: text("trigger").notNull(),
    mode: text("mode").notNull(),
    state: text("state").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: time("next_attempt_at").notNull().defaultNow(),
    leaseUntil: time("lease_until"),
    leaseToken: text("lease_token"),
    progress: jsonb("progress").notNull().default({}),
    lastError: text("last_error"),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("one_active_collection")
      .on(t.origin)
      .where(sql`${t.state} in ('queued','running')`),
  ],
);
export const curationAudit = pgTable("curation_audit", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  adminId: text("admin_id").notNull(),
  changes: jsonb("changes").notNull(),
  createdAt: created(),
});
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: time("expires_at").notNull(),
});
export const workerStatus = pgTable("worker_status", {
  id: text("id").primaryKey(),
  lastRunAt: time("last_run_at").notNull(),
});

export const vercelInstallations = pgTable("vercel_installations", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  vercelUserId: text("vercel_user_id").notNull(),
  teamId: text("team_id"),
  accessToken: text("access_token").notNull(),
  gatewayToken: text("gateway_token"),
  gatewayStatus: text("gateway_status"),
  gatewayMessage: text("gateway_message"),
  createdAt: created(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});

export const gatewayConnections = pgTable("gateway_connections", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  state: text("state").notNull(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});
