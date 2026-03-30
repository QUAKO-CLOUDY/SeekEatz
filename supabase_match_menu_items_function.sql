-- Function: match_menu_items
-- Purpose: semantic fallback only. Returns full DB-backed candidate rows so
-- retrieval-engine can re-apply hard filters after vector lookup.

CREATE OR REPLACE FUNCTION match_menu_items(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id text,
  restaurant_name text,
  restaurant_id uuid,
  name text,
  macros jsonb,
  normalized_category text,
  meal_type text,
  item_type text,
  food_tags text[],
  confidence_score numeric,
  description text,
  image_url text,
  price_estimate numeric,
  allergens text[],
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mi.id::text,
    mi.restaurant_name,
    mi.restaurant_id,
    mi.name,
    mi.macros,
    mi.normalized_category,
    mi.meal_type,
    mi.item_type,
    COALESCE(mi.tags, mi.food_tags) AS food_tags,
    mi.confidence_score,
    COALESCE(mi.description_short, mi.description) AS description,
    mi.image_url,
    mi.price_estimate,
    COALESCE(mi.allergen_flags, mi.allergens) AS allergens,
    1 - (mi.embedding <=> query_embedding) AS similarity
  FROM menu_items mi
  WHERE mi.embedding IS NOT NULL
    AND mi.item_type = 'meal'
    AND COALESCE(mi.active_status, mi.is_available, TRUE) = TRUE
    AND COALESCE(mi.calories, (mi.macros->>'calories')::numeric, 0) >= 150
    AND (1 - (mi.embedding <=> query_embedding)) > match_threshold
  ORDER BY mi.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_menu_items(vector, float, int) TO authenticated;
GRANT EXECUTE ON FUNCTION match_menu_items(vector, float, int) TO anon;
