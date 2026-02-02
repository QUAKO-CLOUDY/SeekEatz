-- ============================================
-- CANONICAL RESTAURANTS MIGRATION
-- Creates canonical restaurants table and links menu_items via restaurant_id
-- Safe to run multiple times (idempotent)
-- ============================================

-- Step 1: Ensure restaurants table exists with id and name
CREATE TABLE IF NOT EXISTS restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Create unique index on lower(name) for case-insensitive uniqueness
-- This ensures "CAVA" and "cava" are treated as the same restaurant
CREATE UNIQUE INDEX IF NOT EXISTS restaurants_lower_name_unique 
ON restaurants (LOWER(TRIM(name)));

-- Step 3: Add restaurant_id column to menu_items if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'menu_items' AND column_name = 'restaurant_id'
  ) THEN
    ALTER TABLE menu_items ADD COLUMN restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Step 4: Create index on menu_items.restaurant_id for fast filtering
CREATE INDEX IF NOT EXISTS menu_items_restaurant_id_idx ON menu_items(restaurant_id);

-- Step 5: Backfill restaurant_id by matching normalized restaurant_name to restaurants.name
-- This creates canonical restaurants from existing menu_items data
DO $$
DECLARE
  menu_item_record RECORD;
  canonical_restaurant_id UUID;
  normalized_name TEXT;
BEGIN
  -- First, populate restaurants table from distinct menu_items.restaurant_name values
  -- Use the most common casing (or Title Case) as the canonical name
  INSERT INTO restaurants (name)
  SELECT DISTINCT ON (LOWER(TRIM(restaurant_name)))
    -- Use the most common casing (mode) or Title Case as fallback
    INITCAP(TRIM(restaurant_name)) as canonical_name
  FROM menu_items
  WHERE restaurant_name IS NOT NULL 
    AND TRIM(restaurant_name) != ''
  ON CONFLICT (LOWER(TRIM(name))) DO NOTHING;
  
  -- Then, backfill restaurant_id in menu_items
  FOR menu_item_record IN 
    SELECT DISTINCT restaurant_name 
    FROM menu_items 
    WHERE restaurant_name IS NOT NULL 
      AND TRIM(restaurant_name) != ''
      AND restaurant_id IS NULL
  LOOP
    normalized_name = TRIM(menu_item_record.restaurant_name);
    
    -- Find or create canonical restaurant
    SELECT id INTO canonical_restaurant_id
    FROM restaurants
    WHERE LOWER(TRIM(name)) = LOWER(normalized_name)
    LIMIT 1;
    
    -- If not found, create it (shouldn't happen after first INSERT, but safe guard)
    IF canonical_restaurant_id IS NULL THEN
      INSERT INTO restaurants (name)
      VALUES (INITCAP(normalized_name))
      ON CONFLICT (LOWER(TRIM(name))) DO UPDATE SET name = restaurants.name
      RETURNING id INTO canonical_restaurant_id;
    END IF;
    
    -- Update all menu_items with this restaurant_name
    UPDATE menu_items
    SET restaurant_id = canonical_restaurant_id
    WHERE restaurant_name = menu_item_record.restaurant_name
      AND restaurant_id IS NULL;
  END LOOP;
  
  RAISE NOTICE 'Backfilled restaurant_id for menu_items';
END $$;

-- Step 6: Create or replace search_restaurants_trgm RPC function
-- This searches restaurants.name (canonical) with trigram similarity
-- Returns restaurant id, name, and similarity score
CREATE OR REPLACE FUNCTION search_restaurants_trgm(query_text TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  similarity REAL
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.name,
    similarity(LOWER(TRIM(r.name)), LOWER(TRIM(query_text)))::REAL as similarity
  FROM restaurants r
  WHERE similarity(LOWER(TRIM(r.name)), LOWER(TRIM(query_text))) > 0.1
  ORDER BY similarity DESC
  LIMIT 10;
END;
$$;

-- Step 7: Enable pg_trgm extension if not already enabled (required for similarity function)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- VERIFICATION QUERIES (run these to check results)
-- ============================================
-- SELECT COUNT(*) as total_restaurants FROM restaurants;
-- SELECT COUNT(*) as menu_items_with_restaurant_id FROM menu_items WHERE restaurant_id IS NOT NULL;
-- SELECT COUNT(*) as menu_items_without_restaurant_id FROM menu_items WHERE restaurant_id IS NULL;
-- SELECT r.name, COUNT(mi.id) as menu_item_count 
-- FROM restaurants r 
-- LEFT JOIN menu_items mi ON mi.restaurant_id = r.id 
-- GROUP BY r.id, r.name 
-- ORDER BY menu_item_count DESC 
-- LIMIT 10;

