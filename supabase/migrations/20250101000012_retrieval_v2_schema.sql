-- Migration 012: Retrieval v2 metadata + deterministic-first search RPC
-- Adds canonical retrieval fields without breaking legacy reads.

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS description_short TEXT,
  ADD COLUMN IF NOT EXISTS calories NUMERIC,
  ADD COLUMN IF NOT EXISTS protein_g NUMERIC,
  ADD COLUMN IF NOT EXISTS carbs_g NUMERIC,
  ADD COLUMN IF NOT EXISTS fat_g NUMERIC,
  ADD COLUMN IF NOT EXISTS cuisine_type TEXT,
  ADD COLUMN IF NOT EXISTS protein_source TEXT,
  ADD COLUMN IF NOT EXISTS cooking_method TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[],
  ADD COLUMN IF NOT EXISTS aliases TEXT[],
  ADD COLUMN IF NOT EXISTS diet_flags TEXT[],
  ADD COLUMN IF NOT EXISTS allergen_flags TEXT[],
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS active_status BOOLEAN DEFAULT TRUE;

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS canonical_name TEXT,
  ADD COLUMN IF NOT EXISTS aliases TEXT[],
  ADD COLUMN IF NOT EXISTS cuisine_types TEXT[],
  ADD COLUMN IF NOT EXISTS brand_tags TEXT[],
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS active_status BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

UPDATE menu_items
SET
  calories = COALESCE(calories, NULLIF((macros->>'calories'), '')::NUMERIC),
  protein_g = COALESCE(protein_g, NULLIF((macros->>'protein'), '')::NUMERIC),
  carbs_g = COALESCE(carbs_g, NULLIF((macros->>'carbs'), '')::NUMERIC),
  fat_g = COALESCE(fat_g, NULLIF((macros->>'fat'), '')::NUMERIC),
  description_short = COALESCE(description_short, LEFT(COALESCE(description, name), 160)),
  active_status = COALESCE(active_status, is_available, TRUE),
  last_verified_at = COALESCE(last_verified_at, NOW())
WHERE
  calories IS NULL
  OR protein_g IS NULL
  OR carbs_g IS NULL
  OR fat_g IS NULL
  OR description_short IS NULL
  OR active_status IS NULL
  OR last_verified_at IS NULL;

UPDATE restaurants
SET
  canonical_name = COALESCE(canonical_name, name),
  aliases = COALESCE(aliases, ARRAY[LOWER(name)]),
  active_status = COALESCE(active_status, TRUE),
  last_verified_at = COALESCE(last_verified_at, NOW())
WHERE
  canonical_name IS NULL
  OR aliases IS NULL
  OR active_status IS NULL
  OR last_verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id ON menu_items (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_active_status ON menu_items (active_status);
CREATE INDEX IF NOT EXISTS idx_menu_items_meal_type ON menu_items (meal_type);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items (normalized_category);
CREATE INDEX IF NOT EXISTS idx_menu_items_cuisine_type ON menu_items (cuisine_type);
CREATE INDEX IF NOT EXISTS idx_menu_items_protein_source ON menu_items (protein_source);
CREATE INDEX IF NOT EXISTS idx_menu_items_calories_protein ON menu_items (meal_type, calories, protein_g);
CREATE INDEX IF NOT EXISTS idx_menu_items_tags_gin ON menu_items USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_menu_items_aliases_gin ON menu_items USING GIN (aliases);
CREATE INDEX IF NOT EXISTS idx_menu_items_diet_flags_gin ON menu_items USING GIN (diet_flags);
CREATE INDEX IF NOT EXISTS idx_menu_items_allergen_flags_gin ON menu_items USING GIN (allergen_flags);

DROP FUNCTION IF EXISTS search_meals_v2(
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  text, text, text[], boolean, int, int, text, text[], text[], text[], text[]
);

CREATE FUNCTION search_meals_v2(
  p_min_calories NUMERIC DEFAULT NULL,
  p_max_calories NUMERIC DEFAULT NULL,
  p_min_protein NUMERIC DEFAULT NULL,
  p_max_protein NUMERIC DEFAULT NULL,
  p_max_carbs NUMERIC DEFAULT NULL,
  p_min_carbs NUMERIC DEFAULT NULL,
  p_max_fat NUMERIC DEFAULT NULL,
  p_min_fat NUMERIC DEFAULT NULL,
  p_normalized_category TEXT DEFAULT NULL,
  p_meal_type TEXT DEFAULT NULL,
  p_restaurant_names TEXT[] DEFAULT NULL,
  p_exclude_large BOOLEAN DEFAULT TRUE,
  p_limit INT DEFAULT 60,
  p_offset INT DEFAULT 0,
  p_name_keyword TEXT DEFAULT NULL,
  p_cuisine_types TEXT[] DEFAULT NULL,
  p_tags_any TEXT[] DEFAULT NULL,
  p_protein_sources TEXT[] DEFAULT NULL,
  p_exclude_terms TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  name TEXT,
  restaurant_name TEXT,
  restaurant_id UUID,
  macros JSONB,
  normalized_category TEXT,
  meal_type TEXT,
  item_type TEXT,
  food_tags TEXT[],
  confidence_score NUMERIC,
  description TEXT,
  price NUMERIC,
  image_url TEXT,
  allergens TEXT[]
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    m.id,
    m.name,
    m.restaurant_name,
    m.restaurant_id,
    m.macros,
    m.normalized_category,
    m.meal_type,
    m.item_type,
    COALESCE(m.tags, m.food_tags) AS food_tags,
    m.confidence_score,
    COALESCE(m.description_short, m.description) AS description,
    m.price_estimate AS price,
    m.image_url,
    COALESCE(m.allergen_flags, m.allergens) AS allergens
  FROM menu_items m
  WHERE
    m.item_type = 'meal'
    AND COALESCE(m.active_status, m.is_available, TRUE) = TRUE
    AND COALESCE(m.calories, (m.macros->>'calories')::NUMERIC, 0) >= 150
    AND (p_min_calories IS NULL OR COALESCE(m.calories, (m.macros->>'calories')::NUMERIC, 0) >= p_min_calories)
    AND (p_max_calories IS NULL OR COALESCE(m.calories, (m.macros->>'calories')::NUMERIC, 0) <= p_max_calories)
    AND (p_min_protein IS NULL OR COALESCE(m.protein_g, (m.macros->>'protein')::NUMERIC, 0) >= p_min_protein)
    AND (p_max_protein IS NULL OR COALESCE(m.protein_g, (m.macros->>'protein')::NUMERIC, 0) <= p_max_protein)
    AND (p_max_carbs IS NULL OR COALESCE(m.carbs_g, (m.macros->>'carbs')::NUMERIC, 0) <= p_max_carbs)
    AND (p_min_carbs IS NULL OR COALESCE(m.carbs_g, (m.macros->>'carbs')::NUMERIC, 0) >= p_min_carbs)
    AND (p_max_fat IS NULL OR COALESCE(m.fat_g, (m.macros->>'fat')::NUMERIC, 0) <= p_max_fat)
    AND (p_min_fat IS NULL OR COALESCE(m.fat_g, (m.macros->>'fat')::NUMERIC, 0) >= p_min_fat)
    AND (p_normalized_category IS NULL OR m.normalized_category = p_normalized_category)
    AND (
      p_meal_type IS NULL
      OR m.meal_type = 'all_day'
      OR m.meal_type = p_meal_type
      OR (p_meal_type = 'breakfast' AND m.meal_type = 'brunch')
      OR (p_meal_type = 'brunch' AND m.meal_type = 'breakfast')
    )
    AND (
      p_restaurant_names IS NULL
      OR LOWER(m.restaurant_name) = ANY(SELECT LOWER(n) FROM UNNEST(p_restaurant_names) AS n)
    )
    AND (
      NOT p_exclude_large
      OR COALESCE(m.tags, m.food_tags) IS NULL
      OR NOT (COALESCE(m.tags, m.food_tags) && ARRAY['large_portion','sharing_platter','catering','multi_serving'])
    )
    AND (
      p_name_keyword IS NULL
      OR LOWER(m.name) LIKE '%' || LOWER(p_name_keyword) || '%'
      OR LOWER(COALESCE(m.description_short, m.description, '')) LIKE '%' || LOWER(p_name_keyword) || '%'
    )
    AND (
      p_cuisine_types IS NULL
      OR m.cuisine_type = ANY(p_cuisine_types)
      OR EXISTS (
        SELECT 1
        FROM UNNEST(COALESCE(m.tags, ARRAY[]::TEXT[])) AS tag
        WHERE tag = ANY(p_cuisine_types)
      )
    )
    AND (
      p_tags_any IS NULL
      OR COALESCE(m.tags, m.food_tags) && p_tags_any
      OR EXISTS (
        SELECT 1
        FROM UNNEST(COALESCE(m.aliases, ARRAY[]::TEXT[])) AS alias
        WHERE alias = ANY(p_tags_any)
      )
    )
    AND (
      p_protein_sources IS NULL
      OR m.protein_source = ANY(p_protein_sources)
      OR EXISTS (
        SELECT 1
        FROM UNNEST(COALESCE(m.tags, ARRAY[]::TEXT[])) AS tag
        WHERE tag = ANY(p_protein_sources)
      )
    )
    AND (
      p_exclude_terms IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM UNNEST(p_exclude_terms) AS excluded
        WHERE LOWER(m.name) LIKE '%' || REPLACE(excluded, '_', ' ') || '%'
           OR LOWER(COALESCE(m.description_short, m.description, '')) LIKE '%' || REPLACE(excluded, '_', ' ') || '%'
      )
    )
  ORDER BY
    CASE
      WHEN p_min_protein IS NOT NULL
      THEN COALESCE(m.protein_g, (m.macros->>'protein')::NUMERIC, 0)
           / GREATEST(COALESCE(m.calories, (m.macros->>'calories')::NUMERIC, 1), 1)
    END DESC NULLS LAST,
    CASE
      WHEN p_max_calories IS NOT NULL
      THEN ABS(COALESCE(m.calories, (m.macros->>'calories')::NUMERIC, 0) - p_max_calories)
    END ASC NULLS LAST,
    m.confidence_score DESC,
    COALESCE(m.protein_g, (m.macros->>'protein')::NUMERIC, 0) DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION search_meals_v2 TO anon, authenticated;
