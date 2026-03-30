-- Migration 001: Extend restaurants table
-- Adds logo, cuisine tagging, Google Places, and location metadata

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cuisine_type TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cuisine_tags TEXT[];
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS chain_type TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS is_chain BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS google_places_id TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS google_rating NUMERIC(3,1);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS price_tier SMALLINT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_restaurants_cuisine_type    ON restaurants(cuisine_type);
CREATE INDEX IF NOT EXISTS idx_restaurants_cuisine_tags    ON restaurants USING GIN(cuisine_tags);
CREATE INDEX IF NOT EXISTS idx_restaurants_google_places_id ON restaurants(google_places_id);

ALTER TABLE restaurants
  ADD CONSTRAINT IF NOT EXISTS restaurants_chain_type_check
    CHECK (chain_type IN ('fast_food','fast_casual','casual_dining','fine_dining','cafe','bar_grill','buffet','food_truck')),
  ADD CONSTRAINT IF NOT EXISTS restaurants_price_tier_check
    CHECK (price_tier BETWEEN 1 AND 4);
