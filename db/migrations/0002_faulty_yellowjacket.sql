ALTER TABLE "projects" ADD COLUMN "product_description" text NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "product_summary" text NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "technical_description" text NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "technical_summary" text NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "product_description_length" CHECK (char_length("projects"."product_description") between 1 and 120);--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "technical_description_length" CHECK (char_length("projects"."technical_description") between 1 and 120);