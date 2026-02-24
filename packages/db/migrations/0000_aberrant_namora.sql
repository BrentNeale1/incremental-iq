CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" text DEFAULT 'starter' NOT NULL,
	"analysis_unlocked" boolean DEFAULT false NOT NULL,
	"analysis_unlocked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ad_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid,
	"external_id" text NOT NULL,
	"name" text,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ad_set_id" uuid,
	"creative_id" uuid,
	"external_id" text NOT NULL,
	"name" text,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "creatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"source" text NOT NULL,
	"name" text,
	"format" text,
	"headline" text,
	"primary_text" text,
	"description" text,
	"call_to_action" text,
	"image_url" text,
	"video_url" text,
	"thumbnail_url" text,
	"aspect_ratio" text,
	"duration_seconds" numeric(6, 1),
	"external_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creatives" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "campaign_metrics" (
	"date" date NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"source" text NOT NULL,
	"spend_usd" numeric(12, 4),
	"direct_revenue" numeric(14, 4),
	"direct_conversions" numeric(10, 2),
	"direct_roas" numeric(8, 4),
	"modeled_revenue" numeric(14, 4),
	"modeled_conversions" numeric(10, 2),
	"modeled_roas" numeric(8, 4),
	"modeled_incremental_lift" numeric(8, 6),
	"modeled_lift_lower" numeric(8, 6),
	"modeled_lift_upper" numeric(8, 6),
	"modeled_confidence" numeric(5, 4),
	"modeled_at" timestamp with time zone,
	"impressions" numeric(14, 0),
	"clicks" numeric(12, 0),
	"ctr" numeric(8, 6),
	"cpm" numeric(10, 4)
);
--> statement-breakpoint
ALTER TABLE "campaign_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "raw_api_pulls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source" text NOT NULL,
	"pulled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"api_version" text,
	"attribution_window" text,
	"api_params" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"normalized" boolean DEFAULT false NOT NULL,
	"normalized_at" timestamp with time zone,
	"schema_version" text
);
--> statement-breakpoint
ALTER TABLE "raw_api_pulls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ingestion_coverage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source" text NOT NULL,
	"coverage_date" date NOT NULL,
	"status" text NOT NULL,
	"record_count" numeric(12, 0),
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "ingestion_coverage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ad_sets" ADD CONSTRAINT "ad_sets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_ad_set_id_ad_sets_id_fk" FOREIGN KEY ("ad_set_id") REFERENCES "public"."ad_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_metrics_unique" ON "campaign_metrics" USING btree ("tenant_id","campaign_id","date","source");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ad_sets" AS RESTRICTIVE FOR ALL TO "app_user" USING (tenant_id = current_setting('app.current_tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ads" AS RESTRICTIVE FOR ALL TO "app_user" USING (tenant_id = current_setting('app.current_tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "campaigns" AS RESTRICTIVE FOR ALL TO "app_user" USING (tenant_id = current_setting('app.current_tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "creatives" AS RESTRICTIVE FOR ALL TO "app_user" USING (tenant_id = current_setting('app.current_tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "campaign_metrics" AS RESTRICTIVE FOR ALL TO "app_user" USING (tenant_id = current_setting('app.current_tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "raw_api_pulls" AS RESTRICTIVE FOR ALL TO "app_user" USING (tenant_id = current_setting('app.current_tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ingestion_coverage" AS RESTRICTIVE FOR ALL TO "app_user" USING (tenant_id = current_setting('app.current_tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
-- FORCE ROW LEVEL SECURITY prevents table owners from bypassing RLS
-- Required for all tenant-data tables (Pitfall 1 from RESEARCH.md)
ALTER TABLE "campaigns" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ad_sets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ads" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "creatives" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaign_metrics" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "raw_api_pulls" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ingestion_coverage" FORCE ROW LEVEL SECURITY;