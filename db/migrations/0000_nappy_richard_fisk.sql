CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curation_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"admin_id" text NOT NULL,
	"changes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"origin" text NOT NULL,
	"project_id" text,
	"user_id" text,
	"trigger" text NOT NULL,
	"mode" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_token" text,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"origin" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"last_retrieved_at" timestamp with time zone,
	"next_check_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"discovered_by" text,
	"availability" text DEFAULT 'available' NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"missing_count" integer DEFAULT 0 NOT NULL,
	"last_missing_at" timestamp with time zone,
	"failure_since" timestamp with time zone,
	"last_error" text,
	"has_full_bundle" boolean DEFAULT false NOT NULL,
	"latest_observation_id" text,
	"latest_snapshot_id" text,
	"latest_complete_snapshot_id" text,
	"archive_enabled_at" timestamp with time zone,
	"is_top" boolean DEFAULT false NOT NULL,
	"is_promoted" boolean DEFAULT false NOT NULL,
	"featured_position" integer,
	"hidden" boolean DEFAULT false NOT NULL,
	CONSTRAINT "projects_origin_unique" UNIQUE("origin"),
	CONSTRAINT "featured_range" CHECK ("projects"."featured_position" between 1 and 3),
	CONSTRAINT "availability_values" CHECK ("projects"."availability" in ('available','unreachable','missing','invalid'))
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshot_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"kind" text NOT NULL,
	"original_url" text NOT NULL,
	"final_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" integer,
	"etag" text,
	"last_modified" text,
	"media_type" text,
	"bytes" integer,
	"sha256" text,
	"object_key" text,
	"result" text NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "retrievals" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text,
	"user_id" text,
	"trigger" text NOT NULL,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"result" text NOT NULL,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"snapshot_id" text
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"source_digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completeness" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"inventory_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_status" (
	"id" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curation_audit" ADD CONSTRAINT "curation_audit_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_jobs" ADD CONSTRAINT "collection_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_resources" ADD CONSTRAINT "snapshot_resources_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrievals" ADD CONSTRAINT "retrievals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrievals" ADD CONSTRAINT "retrievals_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_collection" ON "collection_jobs" USING btree ("origin") WHERE "collection_jobs"."state" in ('queued','running');--> statement-breakpoint
CREATE UNIQUE INDEX "featured_slot" ON "projects" USING btree ("featured_position");--> statement-breakpoint
CREATE INDEX "projects_due" ON "projects" USING btree ("next_check_at");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_content" ON "snapshots" USING btree ("project_id","content_hash");