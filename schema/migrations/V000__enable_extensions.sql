-- V000: Enable required PostgreSQL extensions
-- This migration must run before all others

-- Enable btree_gist extension for exclusion constraints on rent_schedule
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Verify extension is enabled
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN
        RAISE EXCEPTION 'btree_gist extension is required but not available';
    END IF;
    RAISE NOTICE 'btree_gist extension is enabled';
END $$;
