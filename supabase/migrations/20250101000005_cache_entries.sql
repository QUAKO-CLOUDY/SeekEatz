-- Migration 005: Search result cache table
-- Hash-keyed cache with TTL for expensive queries.

CREATE TABLE IF NOT EXISTS cache_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key    TEXT UNIQUE NOT NULL,   -- SHA-256 hash of canonical params
  cache_type   TEXT DEFAULT 'search',  -- 'search' | 'vector' | 'restaurant'
  params_json  JSONB,                  -- Params that generated this result
  results_json JSONB,                  -- Serialized Meal[] result
  result_count INT,
  hit_count    INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  expires_at   TIMESTAMPTZ,
  cache_version TEXT DEFAULT 'v1'
);

CREATE INDEX IF NOT EXISTS idx_cache_entries_key      ON cache_entries(cache_key);
CREATE INDEX IF NOT EXISTS idx_cache_entries_expires  ON cache_entries(expires_at);
CREATE INDEX IF NOT EXISTS idx_cache_entries_type     ON cache_entries(cache_type);

-- Cleanup function: removes expired entries, returns count removed
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE removed INT;
BEGIN
  DELETE FROM cache_entries WHERE expires_at < NOW();
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

-- RLS: service_role only (cache is internal)
ALTER TABLE cache_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cache_service_only" ON cache_entries FOR ALL USING (auth.role() = 'service_role');
