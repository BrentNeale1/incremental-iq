ALTER TABLE "tenants" ADD COLUMN "onboarding_completed" boolean NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN "onboarding_completed_at" timestamptz;
