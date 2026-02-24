CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"status" text NOT NULL,
	"account_id" text,
	"account_name" text,
	"encrypted_access_token" text,
	"encrypted_refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"metadata" jsonb,
	"last_synced_at" timestamp with time zone,
	"last_sync_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"run_type" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"records_ingested" numeric(12, 0),
	"error_message" text,
	"progress_metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "sync_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "integrations" AS RESTRICTIVE FOR ALL TO "app_user" USING (tenant_id = current_setting('app.current_tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sync_runs" AS RESTRICTIVE FOR ALL TO "app_user" USING (tenant_id = current_setting('app.current_tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
-- FORCE ROW LEVEL SECURITY prevents table owners from bypassing RLS
-- Required for all tenant-data tables (Pitfall 1 from RESEARCH.md)
ALTER TABLE "integrations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_runs" FORCE ROW LEVEL SECURITY;