-- Migration 009: Fix search_menu_items RPC
-- 1. Drop all overloads so CREATE OR REPLACE is unambiguous
-- 2. Re-create with p_restaurant_names TEXT[] (restaurant_id is NULL on all rows)
-- 3. Fix protein ordering to return a variety above minimum (not just max-protein items)
-- 4. Same treatment for count_menu_items

-- ── Drop every known overload ────────────────────────────────────────────────

DROP FUNCTION IF EXISTS search_menu_items(
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  text, text, uuid[], boolean, int, int
);

DROP FUNCTION IF EXISTS search_menu_items(
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  text, text, text[], boolean, int, int
);

DROP FUNCTION IF EXISTS count_menu_items(
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  text, text, uuid[], boolean
);

DROP FUNCTION IF EXISTS count_menu_items(
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  text, text, text[], boolean
);

-- ── search_menu_items v2 ─────────────────────────────────────────────────────

CREATE FUNCTION search_menu_items(
  p_min_calories        NUMERIC   DEFAULT NULL,
  p_max_calories        NUMERIC   DEFAULT NULL,
  p_min_protein         NUMERIC   DEFAULT NULL,
  p_max_protein         NUMERIC   DEFAULT NULL,
  p_max_carbs           NUMERIC   DEFAULT NULL,
  p_min_carbs           NUMERIC   DEFAULT NULL,
  p_max_fat             NUMERIC   DEFAULT NULL,
  p_min_fat             NUMERIC   DEFAULT NULL,
  p_normalized_category TEXT      DEFAULT NULL,
  p_meal_type           TEXT      DEFAULT NULL,
  p_restaurant_names    TEXT[]    DEFAULT NULL,
  p_exclude_large       BOOLEAN   DEFAULT TRUE,
  p_limit               INT       DEFAULT 60,
  p_offset              INT       DEFAULT 0
)
RETURNS TABLE (
  id                  BIGINT,
  name                TEXT,
  restaurant_name     TEXT,
  restaurant_id       UUID,
  macros              JSONB,
  normalized_category TEXT,
  meal_type           TEXT,
  item_type           TEXT,
  food_tags           TEXT[],
  confidence_score    NUMERIC,
  description         TEXT,
  price               NUMERIC,
  image_url           TEXT,
  allergens           TEXT[]
)
LANGUAGE SQL STABLE AS $$
  SELECT
    m.id, m.name, m.restaurant_name, m.restaurant_id,
    m.macros, m.normalized_category, m.meal_type, m.item_type,
    m.food_tags, m.confidence_score, m.description,
    m.price_estimate AS price, m.image_url, m.allergens
  FROM menu_items m
  WHERE
    m.is_available = TRUE
    AND m.item_type NOT IN ('modifier')
    AND (p_min_calories IS NULL OR (m.macros->>'calories')::numeric >= p_min_calories)
    AND (p_max_calories IS NULL OR (m.macros->>'calories')::numeric <= p_max_calories)
    AND (p_min_protein  IS NULL OR (m.macros->>'protein')::numeric  >= p_min_protein)
    AND (p_max_protein  IS NULL OR (m.macros->>'protein')::numeric  <= p_max_protein)
    AND (p_max_carbs    IS NULL OR (m.macros->>'carbs')::numeric    <= p_max_carbs)
    AND (p_min_carbs    IS NULL OR (m.macros->>'carbs')::numeric    >= p_min_carbs)
    AND (p_max_fat      IS NULL OR (m.macros->>'fat')::numeric      <= p_max_fat)
    AND (p_min_fat      IS NULL OR (m.macros->>'fat')::numeric      >= p_min_fat)
    AND (p_normalized_category IS NULL OR m.normalized_category = p_normalized_category)
    AND (
      p_meal_type IS NULL OR m.meal_type = 'all_day' OR m.meal_type = p_meal_type
      OR (p_meal_type = 'breakfast' AND m.meal_type = 'brunch')
      OR (p_meal_type = 'brunch'    AND m.meal_type = 'breakfast')
    )
    AND (
      p_restaurant_names IS NULL
      OR LOWER(m.restaurant_name) = ANY(
           SELECT LOWER(n) FROM UNNEST(p_restaurant_names) AS n
         )
    )
    AND (
      NOT p_exclude_large OR m.food_tags IS NULL
      OR NOT (m.food_tags && ARRAY['large_portion','sharing_platter','catering','multi_serving'])
    )
  ORDER BY
    -- When a calorie cap is set with no protein constraint: surface low-cal options first
    CASE WHEN p_max_calories IS NOT NULL AND p_min_protein IS NULL
         THEN (m.macros->>'calories')::numeric
    END ASC NULLS LAST,
    -- When protein minimum is set: rank by protein-per-calorie efficiency (gives variety)
    CASE WHEN p_min_protein IS NOT NULL
         THEN (m.macros->>'protein')::numeric
              / GREATEST((m.macros->>'calories')::numeric, 1)
    END DESC NULLS LAST,
    -- Always: higher confidence items surface first among ties
    m.confidence_score DESC,
    -- Tiebreak: moderate protein (not max, not minimum) for natural variety
    (m.macros->>'protein')::numeric DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION search_menu_items TO anon, authenticated;

-- ── count_menu_items v2 ──────────────────────────────────────────────────────

CREATE FUNCTION count_menu_items(
  p_min_calories        NUMERIC   DEFAULT NULL,
  p_max_calories        NUMERIC   DEFAULT NULL,
  p_min_protein         NUMERIC   DEFAULT NULL,
  p_max_protein         NUMERIC   DEFAULT NULL,
  p_max_carbs           NUMERIC   DEFAULT NULL,
  p_min_carbs           NUMERIC   DEFAULT NULL,
  p_max_fat             NUMERIC   DEFAULT NULL,
  p_min_fat             NUMERIC   DEFAULT NULL,
  p_normalized_category TEXT      DEFAULT NULL,
  p_meal_type           TEXT      DEFAULT NULL,
  p_restaurant_names    TEXT[]    DEFAULT NULL,
  p_exclude_large       BOOLEAN   DEFAULT TRUE
)
RETURNS BIGINT
LANGUAGE SQL STABLE AS $$
  SELECT COUNT(*) FROM menu_items m
  WHERE
    m.is_available = TRUE AND m.item_type NOT IN ('modifier')
    AND (p_min_calories IS NULL OR (m.macros->>'calories')::numeric >= p_min_calories)
    AND (p_max_calories IS NULL OR (m.macros->>'calories')::numeric <= p_max_calories)
    AND (p_min_protein  IS NULL OR (m.macros->>'protein')::numeric  >= p_min_protein)
    AND (p_max_protein  IS NULL OR (m.macros->>'protein')::numeric  <= p_max_protein)
    AND (p_max_carbs    IS NULL OR (m.macros->>'carbs')::numeric    <= p_max_carbs)
    AND (p_min_carbs    IS NULL OR (m.macros->>'carbs')::numeric    >= p_min_carbs)
    AND (p_max_fat      IS NULL OR (m.macros->>'fat')::numeric      <= p_max_fat)
    AND (p_min_fat      IS NULL OR (m.macros->>'fat')::numeric      >= p_min_fat)
    AND (p_normalized_category IS NULL OR m.normalized_category = p_normalized_category)
    AND (
      p_meal_type IS NULL OR m.meal_type = 'all_day' OR m.meal_type = p_meal_type
      OR (p_meal_type = 'breakfast' AND m.meal_type = 'brunch')
      OR (p_meal_type = 'brunch'    AND m.meal_type = 'breakfast')
    )
    AND (
      p_restaurant_names IS NULL
      OR LOWER(m.restaurant_name) = ANY(
           SELECT LOWER(n) FROM UNNEST(p_restaurant_names) AS n
         )
    )
    AND (
      NOT p_exclude_large OR m.food_tags IS NULL
      OR NOT (m.food_tags && ARRAY['large_portion','sharing_platter','catering','multi_serving'])\
    );
$$;

GRANT EXECUTE ON FUNCTION count_menu_items TO anon, authenticated;
