-- Create read-only user for AI-generated queries
CREATE USER woo_ai_readonly WITH PASSWORD 'woo_ai_pass';
GRANT CONNECT ON DATABASE woo_ai_analytics TO woo_ai_readonly;
GRANT USAGE ON SCHEMA public TO woo_ai_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO woo_ai_readonly;
