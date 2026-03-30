-- Migration 003: Sources registry and ingestion job tracking

CREATE TABLE IF NOT EXISTS sources (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT UNIQUE NOT NULL,
  source_type      TEXT NOT NULL,  -- 'json','api','pdf','manual','kaggle'
  base_url         TEXT,
  reliability      NUMERIC(3,2) DEFAULT 0.80,  -- 0.00–1.00 confidence weight
  is_active        BOOLEAN DEFAULT TRUE,
  last_fetched_at  TIMESTAMPTZ,
  fetch_interval_hours INT DEFAULT 168,         -- default weekly
  metadata         JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID REFERENCES sources(id),
  restaurant_id   UUID REFERENCES restaurants(id),
  job_type        TEXT NOT NULL,    -- 'full','incremental','verify','enrich'
  status          TEXT DEFAULT 'pending',  -- 'pending','running','done','failed'
  batch_id        TEXT,
  items_found     INT DEFAULT 0,
  items_inserted  INT DEFAULT 0,
  items_updated   INT DEFAULT 0,
  items_skipped   INT DEFAULT 0,
  items_failed    INT DEFAULT 0,
  error_log       TEXT[],
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  duration_ms     INT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Link menu items to their source
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES sources(id);

-- Seed canonical data sources
INSERT INTO sources (name, source_type, reliability, metadata) VALUES
  ('JSON Import',        'json',   0.80, '{"description":"Original 104-restaurant JSON dataset"}'),
  ('Nutritionix',        'api',    0.95, '{"description":"Nutritionix restaurant nutrition API"}'),
  ('Google Places',      'api',    0.70, '{"description":"Google Places New API for restaurant metadata & photos"}'),
  ('Spoonacular',        'api',    0.85, '{"description":"Spoonacular Food & Recipe API"}'),
  ('FatSecret',          'api',    0.88, '{"description":"FatSecret Platform API"}'),
  ('Open Food Facts',    'api',    0.75, '{"description":"Open Food Facts open database"}'),
  ('Kaggle FastFood',    'kaggle', 0.80, '{"description":"Kaggle Fast Food Restaurants dataset for location seeding"}'),
  ('Manual Entry',       'manual', 0.75, '{"description":"Manually curated entries"}'),
  ('PDF Import',         'pdf',    0.90, '{"description":"Official chain nutrition PDFs"}'),
  ('Unsplash',           'api',    0.70, '{"description":"Unsplash API for dish photos"}')
ON CONFLICT (name) DO NOTHING;

-- Backfill existing items to JSON Import source
UPDATE menu_items
SET source_id = (SELECT id FROM sources WHERE name = 'JSON Import')
WHERE source_id IS NULL;
