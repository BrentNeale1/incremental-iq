-- Create the app_user role required by RLS policies
-- This role is referenced in migration 0000 (CREATE POLICY ... TO "app_user")
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_user';
  END IF;
END
$$;

-- Grant connect and usage to app_user
GRANT CONNECT ON DATABASE incremental_iq TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- After migrations run, app_user needs SELECT/INSERT/UPDATE/DELETE on all tables
-- This is handled by a post-migration grant (ALTER DEFAULT PRIVILEGES)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
