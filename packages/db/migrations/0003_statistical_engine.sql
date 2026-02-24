CREATE TABLE "incrementality_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"scored_at" timestamp with time zone NOT NULL,
	"score_type" text NOT NULL,
	"lift_mean" numeric(8, 6),
	"lift_lower" numeric(8, 6),
	"lift_upper" numeric(8, 6),
	"confidence" numeric(5, 4),
	"data_points" numeric(8, 0),
	"status" text NOT NULL,
	"raw_model_output" jsonb,
	"market_id" uuid
);
--> statement-breakpoint
ALTER TABLE "incrementality_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "seasonal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"name" text NOT NULL,
	"event_date" date NOT NULL,
	"window_before" numeric(4, 0) DEFAULT '0',
	"window_after" numeric(4, 0) DEFAULT '0',
	"is_user_defined" boolean DEFAULT false NOT NULL,
	"year" numeric(4, 0)
);
--> statement-breakpoint
ALTER TABLE "seasonal_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "budget_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"change_date" date NOT NULL,
	"spend_before_avg" numeric(12, 4),
	"spend_after_avg" numeric(12, 4),
	"change_pct" numeric(8, 4),
	"lift_impact" numeric(8, 6),
	"lift_impact_lower" numeric(8, 6),
	"lift_impact_upper" numeric(8, 6),
	"source" text NOT NULL,
	"status" text NOT NULL,
	"dismissed_at" timestamp with time zone,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "saturation_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"estimated_at" timestamp with time zone NOT NULL,
	"saturation_pct" numeric(5, 4),
	"hill_alpha" numeric(14, 6),
	"hill_mu" numeric(14, 6),
	"hill_gamma" numeric(8, 4),
	"status" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saturation_estimates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "funnel_stage" text DEFAULT 'conversion';--> statement-breakpoint
CREATE INDEX "incrementality_scores_lookup_idx" ON "incrementality_scores" USING btree ("tenant_id","campaign_id","score_type","scored_at");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "incrementality_scores" AS RESTRICTIVE FOR ALL TO "app_user" USING (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "seasonal_events" AS RESTRICTIVE FOR ALL TO "app_user" USING (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "budget_changes" AS RESTRICTIVE FOR ALL TO "app_user" USING (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "saturation_estimates" AS RESTRICTIVE FOR ALL TO "app_user" USING (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
-- FORCE ROW LEVEL SECURITY prevents table owners from bypassing RLS
-- Required for all tenant-data tables (same pattern as 0000_aberrant_namora.sql)
ALTER TABLE "incrementality_scores" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "seasonal_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "budget_changes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "saturation_estimates" FORCE ROW LEVEL SECURITY;
