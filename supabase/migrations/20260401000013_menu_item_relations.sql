-- Migration 013: explicit meal-to-modifier relations + unitized modifier metadata

-- Extend menu_items with lightweight modifier/search metadata.
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_searchable BOOLEAN DEFAULT TRUE;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS modifier_unit_label TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS modifier_unit_default_qty INTEGER;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS modifier_unit_max_qty INTEGER;

ALTER TABLE menu_items
  ADD CONSTRAINT IF NOT EXISTS menu_items_modifier_unit_default_qty_check
    CHECK (modifier_unit_default_qty IS NULL OR modifier_unit_default_qty >= 0),
  ADD CONSTRAINT IF NOT EXISTS menu_items_modifier_unit_max_qty_check
    CHECK (modifier_unit_max_qty IS NULL OR modifier_unit_max_qty >= 0);

CREATE INDEX IF NOT EXISTS idx_menu_items_is_searchable
  ON menu_items (is_searchable);

CREATE TABLE IF NOT EXISTS menu_item_relations (
  id BIGSERIAL PRIMARY KEY,
  parent_item_id BIGINT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  child_item_id BIGINT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  group_name TEXT,
  min_quantity INTEGER NOT NULL DEFAULT 0,
  default_quantity INTEGER NOT NULL DEFAULT 1,
  max_quantity INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT menu_item_relations_no_self_link
    CHECK (parent_item_id <> child_item_id),
  CONSTRAINT menu_item_relations_relation_type_check
    CHECK (relation_type IN (
      'add_on',
      'side_option',
      'sauce_option',
      'dressing_option',
      'protein_option',
      'egg_swap',
      'swap_candidate'
    )),
  CONSTRAINT menu_item_relations_quantity_bounds_check
    CHECK (
      min_quantity >= 0
      AND default_quantity >= min_quantity
      AND max_quantity >= default_quantity
    ),
  CONSTRAINT menu_item_relations_unique_link
    UNIQUE (parent_item_id, child_item_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_menu_item_relations_parent
  ON menu_item_relations (parent_item_id);

CREATE INDEX IF NOT EXISTS idx_menu_item_relations_child
  ON menu_item_relations (child_item_id);

CREATE INDEX IF NOT EXISTS idx_menu_item_relations_parent_type
  ON menu_item_relations (parent_item_id, relation_type);
