-- Migration 006: Restaurant locations with PostGIS
-- Enables "near me" radius queries at zero cost per query.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS restaurant_locations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  google_place_id  TEXT,
  address          TEXT,
  city             TEXT,
  state            TEXT,
  zip_code         TEXT,
  country          TEXT DEFAULT 'US',
  latitude         DOUBLE PRECISION,
  longitude        DOUBLE PRECISION,
  coordinates      GEOGRAPHY(POINT, 4326),  -- PostGIS geography type
  phone            TEXT,
  hours_json       JSONB,
  is_open          BOOLEAN DEFAULT TRUE,
  data_source      TEXT DEFAULT 'kaggle',   -- 'kaggle' | 'google_places' | 'manual'
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- GiST index for fast radius queries
CREATE INDEX IF NOT EXISTS idx_restaurant_locations_geo
  ON restaurant_locations USING GIST(coordinates);
CREATE INDEX IF NOT EXISTS idx_restaurant_locations_restaurant_id
  ON restaurant_locations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_locations_city_state
  ON restaurant_locations(city, state);

-- Radius search function using PostGIS
CREATE OR REPLACE FUNCTION find_restaurants_near(
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  radius_miles DOUBLE PRECISION DEFAULT 5.0
)
RETURNS TABLE (
  restaurant_id   UUID,
  restaurant_name TEXT,
  distance_miles  DOUBLE PRECISION,
  address         TEXT,
  city            TEXT,
  state           TEXT,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    rl.restaurant_id,
    r.name AS restaurant_name,
    ST_Distance(
      rl.coordinates,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    ) / 1609.344 AS distance_miles,
    rl.address,
    rl.city,
    rl.state,
    rl.latitude,
    rl.longitude
  FROM restaurant_locations rl
  JOIN restaurants r ON r.id = rl.restaurant_id
  WHERE ST_DWithin(
    rl.coordinates,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
    radius_miles * 1609.344  -- convert miles to meters
  )
  ORDER BY distance_miles ASC;
$$;

GRANT EXECUTE ON FUNCTION find_restaurants_near TO anon, authenticated;

-- RLS
ALTER TABLE restaurant_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locations_public_read"   ON restaurant_locations FOR SELECT USING (TRUE);
CREATE POLICY "locations_service_write" ON restaurant_locations FOR ALL USING (auth.role() = 'service_role');
