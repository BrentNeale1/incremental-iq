-- Seed demo data for manual testing
-- Run AFTER signing up via the UI. Finds your tenant and populates data.

-- Find the most recently created tenant and store it
DO $$
DECLARE
  tid uuid;
BEGIN
  SELECT id INTO tid FROM tenants ORDER BY created_at DESC LIMIT 1;
  IF tid IS NULL THEN
    RAISE EXCEPTION 'No tenant found. Sign up via the UI first.';
  END IF;
  PERFORM set_config('app.seed_tenant_id', tid::text, false);
  RAISE NOTICE 'Seeding data for tenant: %', tid;
END $$;

-- Mark tenant as analysis-unlocked + onboarding complete
UPDATE tenants
SET analysis_unlocked = true,
    analysis_unlocked_at = NOW() - INTERVAL '30 days',
    onboarding_completed = true,
    onboarding_completed_at = NOW() - INTERVAL '30 days'
WHERE id = current_setting('app.seed_tenant_id')::uuid;

-- Create integrations
INSERT INTO integrations (id, tenant_id, platform, status, account_id, account_name, last_synced_at, last_sync_status, metadata)
VALUES
  (gen_random_uuid(), current_setting('app.seed_tenant_id')::uuid, 'meta', 'connected', 'act_123456', 'Demo Meta Account', NOW() - INTERVAL '2 hours', 'success', '{"adAccountId": "act_123456"}'::jsonb),
  (gen_random_uuid(), current_setting('app.seed_tenant_id')::uuid, 'google_ads', 'connected', '1234567890', 'Demo Google Ads', NOW() - INTERVAL '2 hours', 'success', '{"customerId": "1234567890"}'::jsonb),
  (gen_random_uuid(), current_setting('app.seed_tenant_id')::uuid, 'shopify', 'connected', 'demo-store', 'Demo Shopify Store', NOW() - INTERVAL '2 hours', 'success', '{"shop": "demo-store.myshopify.com"}'::jsonb);

-- Create markets
INSERT INTO markets (id, tenant_id, country_code, display_name, campaign_count, is_confirmed)
VALUES
  (gen_random_uuid(), current_setting('app.seed_tenant_id')::uuid, 'US', 'United States', 4, true),
  (gen_random_uuid(), current_setting('app.seed_tenant_id')::uuid, 'AU', 'Australia', 3, true),
  (gen_random_uuid(), current_setting('app.seed_tenant_id')::uuid, 'GB', 'United Kingdom', 2, true);

-- Main seed block: campaigns, metrics, scores, saturation, budget changes, sync runs
DO $$
DECLARE
  tid uuid := current_setting('app.seed_tenant_id')::uuid;
  us_market uuid;
  au_market uuid;
  gb_market uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; c6 uuid; c7 uuid; c8 uuid; c9 uuid;
  d date;
  dow int;
  seasonal numeric;
  base_spend numeric;
  daily_revenue numeric;
BEGIN
  -- Get market IDs
  SELECT id INTO us_market FROM markets WHERE tenant_id = tid AND country_code = 'US';
  SELECT id INTO au_market FROM markets WHERE tenant_id = tid AND country_code = 'AU';
  SELECT id INTO gb_market FROM markets WHERE tenant_id = tid AND country_code = 'GB';

  -- Create campaigns
  INSERT INTO campaigns (id, tenant_id, name, source, external_id, status, funnel_stage)
  VALUES (gen_random_uuid(), tid, 'Meta - US Brand Awareness', 'meta', 'meta_us_brand_1', 'active', 'awareness')
  RETURNING id INTO c1;

  INSERT INTO campaigns (id, tenant_id, name, source, external_id, status, funnel_stage)
  VALUES (gen_random_uuid(), tid, 'Meta - US Conversions', 'meta', 'meta_us_conv_1', 'active', 'conversion')
  RETURNING id INTO c2;

  INSERT INTO campaigns (id, tenant_id, name, source, external_id, status, funnel_stage)
  VALUES (gen_random_uuid(), tid, 'Meta - AU Retargeting', 'meta', 'meta_au_retarget_1', 'active', 'conversion')
  RETURNING id INTO c3;

  INSERT INTO campaigns (id, tenant_id, name, source, external_id, status, funnel_stage)
  VALUES (gen_random_uuid(), tid, 'Meta - GB Prospecting', 'meta', 'meta_gb_prospect_1', 'active', 'consideration')
  RETURNING id INTO c4;

  INSERT INTO campaigns (id, tenant_id, name, source, external_id, status, funnel_stage)
  VALUES (gen_random_uuid(), tid, 'Google - US Search Brand', 'google_ads', 'gads_us_search_1', 'active', 'conversion')
  RETURNING id INTO c5;

  INSERT INTO campaigns (id, tenant_id, name, source, external_id, status, funnel_stage)
  VALUES (gen_random_uuid(), tid, 'Google - US Performance Max', 'google_ads', 'gads_us_pmax_1', 'active', 'conversion')
  RETURNING id INTO c6;

  INSERT INTO campaigns (id, tenant_id, name, source, external_id, status, funnel_stage)
  VALUES (gen_random_uuid(), tid, 'Google - AU Search Generic', 'google_ads', 'gads_au_search_1', 'active', 'consideration')
  RETURNING id INTO c7;

  INSERT INTO campaigns (id, tenant_id, name, source, external_id, status, funnel_stage)
  VALUES (gen_random_uuid(), tid, 'Google - AU Shopping', 'google_ads', 'gads_au_shop_1', 'active', 'conversion')
  RETURNING id INTO c8;

  INSERT INTO campaigns (id, tenant_id, name, source, external_id, status, funnel_stage)
  VALUES (gen_random_uuid(), tid, 'Google - GB Display', 'google_ads', 'gads_gb_display_1', 'active', 'awareness')
  RETURNING id INTO c9;

  -- Campaign-market assignments
  INSERT INTO campaign_markets (tenant_id, campaign_id, market_id, source) VALUES
    (tid, c1, us_market, 'auto_detected'),
    (tid, c2, us_market, 'auto_detected'),
    (tid, c3, au_market, 'auto_detected'),
    (tid, c4, gb_market, 'auto_detected'),
    (tid, c5, us_market, 'auto_detected'),
    (tid, c6, us_market, 'auto_detected'),
    (tid, c7, au_market, 'auto_detected'),
    (tid, c8, au_market, 'auto_detected'),
    (tid, c9, gb_market, 'auto_detected');

  -- Generate 90 days of daily metrics for each campaign
  FOR d IN SELECT generate_series(CURRENT_DATE - 90, CURRENT_DATE - 1, '1 day'::interval)::date LOOP
    dow := EXTRACT(DOW FROM d)::int;
    seasonal := CASE
      WHEN EXTRACT(MONTH FROM d) = 12 THEN 1.4
      WHEN EXTRACT(MONTH FROM d) = 11 AND EXTRACT(DAY FROM d) > 20 THEN 1.6
      WHEN dow IN (0, 6) THEN 0.85
      ELSE 1.0
    END;

    -- c1: Meta US Brand Awareness
    base_spend := (250 + random() * 100) * seasonal;
    daily_revenue := base_spend * (0.8 + random() * 0.4);
    INSERT INTO campaign_metrics (date, tenant_id, campaign_id, source, spend_usd, direct_revenue, direct_conversions, direct_roas, modeled_revenue, modeled_conversions, modeled_roas, modeled_incremental_lift, modeled_lift_lower, modeled_lift_upper, modeled_confidence, modeled_at, impressions, clicks, ctr, cpm)
    VALUES (d, tid, c1, 'meta', base_spend, daily_revenue, (daily_revenue/45)::numeric(10,2), (daily_revenue/base_spend)::numeric(8,4),
            daily_revenue*1.3, (daily_revenue*1.3/45)::numeric(10,2), (daily_revenue*1.3/base_spend)::numeric(8,4),
            0.12+random()*0.08, 0.05, 0.22, 0.72+random()*0.15, NOW()-INTERVAL '1 day',
            (base_spend*180)::numeric(14,0), (base_spend*2.1)::numeric(12,0), 0.012, (base_spend/(base_spend*180)*1000)::numeric(10,4));

    -- c2: Meta US Conversions
    base_spend := (180 + random() * 80) * seasonal;
    daily_revenue := base_spend * (2.5 + random() * 1.5);
    INSERT INTO campaign_metrics (date, tenant_id, campaign_id, source, spend_usd, direct_revenue, direct_conversions, direct_roas, modeled_revenue, modeled_conversions, modeled_roas, modeled_incremental_lift, modeled_lift_lower, modeled_lift_upper, modeled_confidence, modeled_at, impressions, clicks, ctr, cpm)
    VALUES (d, tid, c2, 'meta', base_spend, daily_revenue, (daily_revenue/65)::numeric(10,2), (daily_revenue/base_spend)::numeric(8,4),
            daily_revenue*0.85, (daily_revenue*0.85/65)::numeric(10,2), (daily_revenue*0.85/base_spend)::numeric(8,4),
            0.22+random()*0.10, 0.14, 0.35, 0.85+random()*0.10, NOW()-INTERVAL '1 day',
            (base_spend*120)::numeric(14,0), (base_spend*3.5)::numeric(12,0), 0.029, (base_spend/(base_spend*120)*1000)::numeric(10,4));

    -- c3: Meta AU Retargeting
    base_spend := (80 + random() * 40) * seasonal;
    daily_revenue := base_spend * (3.5 + random() * 2.0);
    INSERT INTO campaign_metrics (date, tenant_id, campaign_id, source, spend_usd, direct_revenue, direct_conversions, direct_roas, modeled_revenue, modeled_conversions, modeled_roas, modeled_incremental_lift, modeled_lift_lower, modeled_lift_upper, modeled_confidence, modeled_at, impressions, clicks, ctr, cpm)
    VALUES (d, tid, c3, 'meta', base_spend, daily_revenue, (daily_revenue/55)::numeric(10,2), (daily_revenue/base_spend)::numeric(8,4),
            daily_revenue*0.6, (daily_revenue*0.6/55)::numeric(10,2), (daily_revenue*0.6/base_spend)::numeric(8,4),
            0.08+random()*0.06, 0.02, 0.18, 0.65+random()*0.20, NOW()-INTERVAL '1 day',
            (base_spend*90)::numeric(14,0), (base_spend*4.2)::numeric(12,0), 0.047, (base_spend/(base_spend*90)*1000)::numeric(10,4));

    -- c4: Meta GB Prospecting
    base_spend := (120 + random() * 50) * seasonal;
    daily_revenue := base_spend * (1.2 + random() * 0.8);
    INSERT INTO campaign_metrics (date, tenant_id, campaign_id, source, spend_usd, direct_revenue, direct_conversions, direct_roas, modeled_revenue, modeled_conversions, modeled_roas, modeled_incremental_lift, modeled_lift_lower, modeled_lift_upper, modeled_confidence, modeled_at, impressions, clicks, ctr, cpm)
    VALUES (d, tid, c4, 'meta', base_spend, daily_revenue, (daily_revenue/40)::numeric(10,2), (daily_revenue/base_spend)::numeric(8,4),
            daily_revenue*1.1, (daily_revenue*1.1/40)::numeric(10,2), (daily_revenue*1.1/base_spend)::numeric(8,4),
            0.15+random()*0.10, 0.07, 0.28, 0.70+random()*0.18, NOW()-INTERVAL '1 day',
            (base_spend*150)::numeric(14,0), (base_spend*2.8)::numeric(12,0), 0.019, (base_spend/(base_spend*150)*1000)::numeric(10,4));

    -- c5: Google US Search Brand
    base_spend := (300 + random() * 120) * seasonal;
    daily_revenue := base_spend * (4.0 + random() * 2.0);
    INSERT INTO campaign_metrics (date, tenant_id, campaign_id, source, spend_usd, direct_revenue, direct_conversions, direct_roas, modeled_revenue, modeled_conversions, modeled_roas, modeled_incremental_lift, modeled_lift_lower, modeled_lift_upper, modeled_confidence, modeled_at, impressions, clicks, ctr, cpm)
    VALUES (d, tid, c5, 'google_ads', base_spend, daily_revenue, (daily_revenue/80)::numeric(10,2), (daily_revenue/base_spend)::numeric(8,4),
            daily_revenue*0.45, (daily_revenue*0.45/80)::numeric(10,2), (daily_revenue*0.45/base_spend)::numeric(8,4),
            0.30+random()*0.12, 0.20, 0.45, 0.90+random()*0.08, NOW()-INTERVAL '1 day',
            (base_spend*50)::numeric(14,0), (base_spend*6.0)::numeric(12,0), 0.12, (base_spend/(base_spend*50)*1000)::numeric(10,4));

    -- c6: Google US PMax
    base_spend := (200 + random() * 80) * seasonal;
    daily_revenue := base_spend * (2.0 + random() * 1.2);
    INSERT INTO campaign_metrics (date, tenant_id, campaign_id, source, spend_usd, direct_revenue, direct_conversions, direct_roas, modeled_revenue, modeled_conversions, modeled_roas, modeled_incremental_lift, modeled_lift_lower, modeled_lift_upper, modeled_confidence, modeled_at, impressions, clicks, ctr, cpm)
    VALUES (d, tid, c6, 'google_ads', base_spend, daily_revenue, (daily_revenue/70)::numeric(10,2), (daily_revenue/base_spend)::numeric(8,4),
            daily_revenue*0.75, (daily_revenue*0.75/70)::numeric(10,2), (daily_revenue*0.75/base_spend)::numeric(8,4),
            0.18+random()*0.09, 0.10, 0.30, 0.80+random()*0.12, NOW()-INTERVAL '1 day',
            (base_spend*200)::numeric(14,0), (base_spend*3.0)::numeric(12,0), 0.015, (base_spend/(base_spend*200)*1000)::numeric(10,4));

    -- c7: Google AU Search Generic
    base_spend := (90 + random() * 40) * seasonal;
    daily_revenue := base_spend * (1.5 + random() * 1.0);
    INSERT INTO campaign_metrics (date, tenant_id, campaign_id, source, spend_usd, direct_revenue, direct_conversions, direct_roas, modeled_revenue, modeled_conversions, modeled_roas, modeled_incremental_lift, modeled_lift_lower, modeled_lift_upper, modeled_confidence, modeled_at, impressions, clicks, ctr, cpm)
    VALUES (d, tid, c7, 'google_ads', base_spend, daily_revenue, (daily_revenue/50)::numeric(10,2), (daily_revenue/base_spend)::numeric(8,4),
            daily_revenue*0.9, (daily_revenue*0.9/50)::numeric(10,2), (daily_revenue*0.9/base_spend)::numeric(8,4),
            0.10+random()*0.08, 0.03, 0.22, 0.68+random()*0.18, NOW()-INTERVAL '1 day',
            (base_spend*80)::numeric(14,0), (base_spend*3.8)::numeric(12,0), 0.048, (base_spend/(base_spend*80)*1000)::numeric(10,4));

    -- c8: Google AU Shopping
    base_spend := (150 + random() * 60) * seasonal;
    daily_revenue := base_spend * (3.0 + random() * 1.5);
    INSERT INTO campaign_metrics (date, tenant_id, campaign_id, source, spend_usd, direct_revenue, direct_conversions, direct_roas, modeled_revenue, modeled_conversions, modeled_roas, modeled_incremental_lift, modeled_lift_lower, modeled_lift_upper, modeled_confidence, modeled_at, impressions, clicks, ctr, cpm)
    VALUES (d, tid, c8, 'google_ads', base_spend, daily_revenue, (daily_revenue/60)::numeric(10,2), (daily_revenue/base_spend)::numeric(8,4),
            daily_revenue*0.7, (daily_revenue*0.7/60)::numeric(10,2), (daily_revenue*0.7/base_spend)::numeric(8,4),
            0.25+random()*0.10, 0.16, 0.38, 0.88+random()*0.08, NOW()-INTERVAL '1 day',
            (base_spend*100)::numeric(14,0), (base_spend*5.0)::numeric(12,0), 0.05, (base_spend/(base_spend*100)*1000)::numeric(10,4));

    -- c9: Google GB Display
    base_spend := (70 + random() * 30) * seasonal;
    daily_revenue := base_spend * (0.6 + random() * 0.4);
    INSERT INTO campaign_metrics (date, tenant_id, campaign_id, source, spend_usd, direct_revenue, direct_conversions, direct_roas, modeled_revenue, modeled_conversions, modeled_roas, modeled_incremental_lift, modeled_lift_lower, modeled_lift_upper, modeled_confidence, modeled_at, impressions, clicks, ctr, cpm)
    VALUES (d, tid, c9, 'google_ads', base_spend, daily_revenue, (daily_revenue/35)::numeric(10,2), (daily_revenue/base_spend)::numeric(8,4),
            daily_revenue*1.5, (daily_revenue*1.5/35)::numeric(10,2), (daily_revenue*1.5/base_spend)::numeric(8,4),
            0.05+random()*0.05, 0.01, 0.12, 0.55+random()*0.20, NOW()-INTERVAL '1 day',
            (base_spend*300)::numeric(14,0), (base_spend*1.5)::numeric(12,0), 0.005, (base_spend/(base_spend*300)*1000)::numeric(10,4));
  END LOOP;

  -- Incrementality scores (latest per campaign, adjusted)
  INSERT INTO incrementality_scores (tenant_id, campaign_id, scored_at, score_type, lift_mean, lift_lower, lift_upper, confidence, data_points, status, market_id)
  VALUES
    (tid, c1, NOW()-INTERVAL '1 day', 'adjusted', 0.145, 0.062, 0.228, 0.7500, 85, 'scored', us_market),
    (tid, c2, NOW()-INTERVAL '1 day', 'adjusted', 0.265, 0.180, 0.350, 0.9100, 88, 'scored', us_market),
    (tid, c5, NOW()-INTERVAL '1 day', 'adjusted', 0.355, 0.250, 0.460, 0.9400, 90, 'scored', us_market),
    (tid, c6, NOW()-INTERVAL '1 day', 'adjusted', 0.210, 0.130, 0.290, 0.8300, 87, 'scored', us_market),
    (tid, c3, NOW()-INTERVAL '1 day', 'adjusted', 0.085, 0.020, 0.150, 0.6500, 82, 'scored', au_market),
    (tid, c7, NOW()-INTERVAL '1 day', 'adjusted', 0.125, 0.045, 0.205, 0.7200, 78, 'scored', au_market),
    (tid, c8, NOW()-INTERVAL '1 day', 'adjusted', 0.290, 0.200, 0.380, 0.8900, 85, 'scored', au_market),
    (tid, c4, NOW()-INTERVAL '1 day', 'adjusted', 0.178, 0.090, 0.266, 0.7800, 80, 'scored', gb_market),
    (tid, c9, NOW()-INTERVAL '1 day', 'adjusted', 0.055, 0.010, 0.100, 0.5500, 70, 'pooled_estimate', gb_market);

  -- Incrementality scores (raw)
  INSERT INTO incrementality_scores (tenant_id, campaign_id, scored_at, score_type, lift_mean, lift_lower, lift_upper, confidence, data_points, status, market_id)
  VALUES
    (tid, c1, NOW()-INTERVAL '1 day', 'raw', 0.130, 0.050, 0.210, 0.7000, 85, 'scored', us_market),
    (tid, c2, NOW()-INTERVAL '1 day', 'raw', 0.240, 0.160, 0.320, 0.8800, 88, 'scored', us_market),
    (tid, c5, NOW()-INTERVAL '1 day', 'raw', 0.330, 0.230, 0.430, 0.9200, 90, 'scored', us_market),
    (tid, c6, NOW()-INTERVAL '1 day', 'raw', 0.195, 0.115, 0.275, 0.8000, 87, 'scored', us_market),
    (tid, c3, NOW()-INTERVAL '1 day', 'raw', 0.070, 0.010, 0.130, 0.6000, 82, 'scored', au_market),
    (tid, c7, NOW()-INTERVAL '1 day', 'raw', 0.110, 0.030, 0.190, 0.6800, 78, 'scored', au_market),
    (tid, c8, NOW()-INTERVAL '1 day', 'raw', 0.275, 0.185, 0.365, 0.8600, 85, 'scored', au_market),
    (tid, c4, NOW()-INTERVAL '1 day', 'raw', 0.160, 0.075, 0.245, 0.7500, 80, 'scored', gb_market),
    (tid, c9, NOW()-INTERVAL '1 day', 'raw', 0.045, 0.005, 0.085, 0.5000, 70, 'pooled_estimate', gb_market);

  -- Saturation estimates
  INSERT INTO saturation_estimates (tenant_id, campaign_id, estimated_at, saturation_pct, hill_alpha, hill_mu, hill_gamma, status)
  VALUES
    (tid, c1, NOW()-INTERVAL '1 day', 0.4500, 150000.0, 280.0, 1.8, 'estimated'),
    (tid, c2, NOW()-INTERVAL '1 day', 0.6200, 120000.0, 200.0, 2.1, 'estimated'),
    (tid, c3, NOW()-INTERVAL '1 day', 0.7800, 45000.0, 90.0, 2.5, 'estimated'),
    (tid, c4, NOW()-INTERVAL '1 day', 0.3500, 80000.0, 150.0, 1.6, 'estimated'),
    (tid, c5, NOW()-INTERVAL '1 day', 0.5800, 200000.0, 350.0, 2.0, 'estimated'),
    (tid, c6, NOW()-INTERVAL '1 day', 0.5100, 130000.0, 220.0, 1.9, 'estimated'),
    (tid, c7, NOW()-INTERVAL '1 day', 0.4200, 60000.0, 110.0, 1.7, 'estimated'),
    (tid, c8, NOW()-INTERVAL '1 day', 0.6800, 95000.0, 160.0, 2.3, 'estimated'),
    (tid, c9, NOW()-INTERVAL '1 day', 0.2800, 50000.0, 80.0, 1.4, 'estimated');

  -- Budget changes
  INSERT INTO budget_changes (tenant_id, campaign_id, change_date, spend_before_avg, spend_after_avg, change_pct, lift_impact, lift_impact_lower, lift_impact_upper, source, status)
  VALUES
    (tid, c2, CURRENT_DATE - 15, 180.00, 250.00, 38.89, 0.045, 0.012, 0.078, 'auto_detected', 'analyzed'),
    (tid, c5, CURRENT_DATE - 8, 350.00, 420.00, 20.00, 0.032, 0.010, 0.054, 'auto_detected', 'analyzed'),
    (tid, c3, CURRENT_DATE - 22, 100.00, 60.00, -40.00, -0.015, -0.035, 0.005, 'auto_detected', 'analyzed');

  -- Sync runs
  INSERT INTO sync_runs (tenant_id, integration_id, platform, run_type, status, started_at, completed_at, records_ingested)
  SELECT tid, i.id, i.platform, 'incremental', 'success', NOW()-INTERVAL '2 hours', NOW()-INTERVAL '1 hour 50 minutes',
    CASE i.platform WHEN 'meta' THEN 45 WHEN 'google_ads' THEN 38 ELSE 120 END
  FROM integrations i WHERE i.tenant_id = tid;

  RAISE NOTICE 'Seed complete: 9 campaigns, 90 days metrics, 3 markets, scores, saturation, budget changes';
END $$;
