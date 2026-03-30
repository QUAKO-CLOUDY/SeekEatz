-- Migration 013: Keep restaurant_locations.coordinates in sync with latitude/longitude
-- This allows app-side and ingestion writes to set lat/lng only while PostGIS
-- maintains the geography point used by find_restaurants_near.

CREATE OR REPLACE FUNCTION sync_restaurant_location_coordinates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.coordinates := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  ELSE
    NEW.coordinates := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_restaurant_location_coordinates ON restaurant_locations;

CREATE TRIGGER trg_sync_restaurant_location_coordinates
BEFORE INSERT OR UPDATE OF latitude, longitude
ON restaurant_locations
FOR EACH ROW
EXECUTE FUNCTION sync_restaurant_location_coordinates();

UPDATE restaurant_locations
SET coordinates = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND coordinates IS NULL;
