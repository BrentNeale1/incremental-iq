CREATE TABLE "markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"display_name" text NOT NULL,
	"campaign_count" integer DEFAULT 0 NOT NULL,
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "markets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "campaign_markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"market_id" uuid,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_markets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaign_markets" ADD CONSTRAINT "campaign_markets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "outcome_mode" text DEFAULT 'ecommerce' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_markets_unique" ON "campaign_markets" USING btree ("tenant_id","campaign_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "markets" AS RESTRICTIVE FOR ALL TO "app_user" USING (tenant_id = current_setting('app.current_tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "campaign_markets" AS RESTRICTIVE FOR ALL TO "app_user" USING (tenant_id = current_setting('app.current_tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
-- FORCE ROW LEVEL SECURITY prevents table owners from bypassing RLS
-- Required for all tenant-data tables (same pattern as 0000_aberrant_namora.sql)
ALTER TABLE "markets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaign_markets" FORCE ROW LEVEL SECURITY;
