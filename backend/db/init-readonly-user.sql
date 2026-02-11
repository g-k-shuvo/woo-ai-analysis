-- Create read-only user for AI-generated queries
-- This script runs on first container start via docker-entrypoint-initdb.d

-- Create the read-only user (idempotent: DO block checks existence)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'woo_ai_readonly') THEN
    CREATE USER woo_ai_readonly WITH PASSWORD 'woo_ai_pass';
  END IF;
END
$$;

-- Allow connection to the database
GRANT CONNECT ON DATABASE woo_ai_analytics TO woo_ai_readonly;

-- Allow usage of the public schema (required to see tables)
GRANT USAGE ON SCHEMA public TO woo_ai_readonly;

-- Grant SELECT on all existing tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO woo_ai_readonly;

-- Grant SELECT on all future tables created by the application user (woo_ai)
ALTER DEFAULT PRIVILEGES FOR ROLE woo_ai IN SCHEMA public GRANT SELECT ON TABLES TO woo_ai_readonly;

-- Explicitly revoke any write privileges (defense-in-depth)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM woo_ai_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE woo_ai IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM woo_ai_readonly;
