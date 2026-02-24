CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"link_path" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kpi_order" jsonb DEFAULT '["spend","revenue","roas","incremental_revenue"]'::jsonb,
	"view_mode" text DEFAULT 'executive' NOT NULL,
	"dark_mode" boolean DEFAULT false NOT NULL,
	"brand_colors" jsonb,
	"notification_preferences" jsonb DEFAULT '{"anomaly_detected":{"in_app":true,"email":false},"recommendation_ready":{"in_app":true,"email":false},"seasonal_alert":{"in_app":true,"email":true},"data_health":{"in_app":true,"email":true}}'::jsonb,
	CONSTRAINT "user_preferences_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "notifications_tenant_unread_idx" ON "notifications" USING btree ("tenant_id","read","created_at");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "notifications" AS RESTRICTIVE FOR ALL TO "app_user" USING (tenant_id = current_setting('app.current_tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "user_preferences" AS RESTRICTIVE FOR ALL TO "app_user" USING (tenant_id = current_setting('app.current_tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
-- FORCE ROW LEVEL SECURITY prevents table owners from bypassing RLS
-- Required for all tenant-data tables (same pattern as 0000_aberrant_namora.sql)
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_preferences" FORCE ROW LEVEL SECURITY;
