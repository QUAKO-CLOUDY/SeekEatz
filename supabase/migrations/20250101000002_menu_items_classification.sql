-- Migration 002: Menu items classification fields + functional indexes
-- NOTE: Generated columns avoided due to 32MB maintenance_work_mem limit
-- with 1536-dim embeddings per row. Using functional indexes instead.

-- 002a: New classification columns
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'meal';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS meal_type TEXT DEFAULT 'all_day';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS normalized_category TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS food_tags TEXT[];
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS fiber_g NUMERIC;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS sugar_g NUMERIC;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS sodium_mg NUMERIC;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS cholesterol_mg NUMERIC;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS saturated_fat_g NUMERIC;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS trans_fat_g NUMERIC;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS serving_size TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS serving_unit TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS allergens TEXT[];
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(4,2) DEFAULT 0.80;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_modifier BOOLEAN DEFAULT FALSE;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS modifier_for TEXT[];
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS modifier_effect JSONB;

-- 002b: Constraints
ALTER TABLE menu_items
  ADD CONSTRAINT IF NOT EXISTS menu_items_item_type_check
    CHECK (item_type IN ('meal','drink','alcohol','modifier','sauce','side','dessert','snack')),
  ADD CONSTRAINT IF NOT EXISTS menu_items_meal_type_check
    CHECK (meal_type IN ('breakfast','lunch','dinner','all_day','snack','dessert','drink','brunch')),
  ADD CONSTRAINT IF NOT EXISTS menu_items_confidence_score_check
    CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00);

-- 002c: Functional indexes on JSONB macros (hit by search_menu_items RPC)
CREATE INDEX IF NOT EXISTS idx_menu_items_calories
  ON menu_items (((macros->>'calories')::numeric));
CREATE INDEX IF NOT EXISTS idx_menu_items_protein
  ON menu_items (((macros->>'protein')::numeric));
CREATE INDEX IF NOT EXISTS idx_menu_items_carbs
  ON menu_items (((macros->>'carbs')::numeric));
CREATE INDEX IF NOT EXISTS idx_menu_items_fat
  ON menu_items (((macros->>'fat')::numeric));

-- Classification indexes
CREATE INDEX IF NOT EXISTS idx_menu_items_meal_type      ON menu_items(meal_type);
CREATE INDEX IF NOT EXISTS idx_menu_items_item_type      ON menu_items(item_type);
CREATE INDEX IF NOT EXISTS idx_menu_items_norm_cat       ON menu_items(normalized_category);
CREATE INDEX IF NOT EXISTS idx_menu_items_available
  ON menu_items(is_available) WHERE is_available = TRUE;
CREATE INDEX IF NOT EXISTS idx_menu_items_food_tags      ON menu_items USING GIN(food_tags);
CREATE INDEX IF NOT EXISTS idx_menu_items_allergens      ON menu_items USING GIN(allergens);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_menu_items_meal_type_calories
  ON menu_items(meal_type, ((macros->>'calories')::numeric));
CREATE INDEX IF NOT EXISTS idx_menu_items_protein_calories
  ON menu_items(((macros->>'protein')::numeric) DESC, ((macros->>'calories')::numeric));
