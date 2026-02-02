-- Function: match_menu_items
-- Purpose: Vector similarity search on menu_items table using embeddings
-- Schema: Uses current menu_items schema with name, restaurant_name, macros (jsonb), embedding (vector)
-- 
-- Parameters:
--   query_embedding: vector(1536) - The query embedding vector
--   match_threshold: float - Minimum similarity threshold (typically 0.0-1.0)
--   match_count: int - Maximum number of results to return
--
-- Returns: Table with columns: id, restaurant_name, name, macros, image_url, price_estimate, similarity
--          Ordered by similarity (descending)

CREATE OR REPLACE FUNCTION match_menu_items(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id text,
  restaurant_name text,
  name text,
  macros jsonb,
  image_url text,
  price_estimate numeric,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mi.id::text,
    mi.restaurant_name,
    mi.name,
    mi.macros,
    mi.image_url,
    mi.price_estimate,
    1 - (mi.embedding <=> query_embedding) AS similarity
  FROM menu_items mi
  WHERE mi.embedding IS NOT NULL
    AND (1 - (mi.embedding <=> query_embedding)) > match_threshold
  ORDER BY mi.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute permission to authenticated and anon users (adjust based on your RLS policy)
GRANT EXECUTE ON FUNCTION match_menu_items(vector, float, int) TO authenticated;
GRANT EXECUTE ON FUNCTION match_menu_items(vector, float, int) TO anon;

