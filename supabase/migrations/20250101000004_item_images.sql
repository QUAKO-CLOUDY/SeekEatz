-- Migration 004: Item images table
-- Stores dish photos (Unsplash) and restaurant logos (Google Places)
-- Images are fetched once and URLs stored permanently.

CREATE TABLE IF NOT EXISTS item_images (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id   BIGINT REFERENCES menu_items(id) ON DELETE CASCADE,
  restaurant_id  UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  image_url      TEXT NOT NULL,
  thumb_url      TEXT,
  image_type     TEXT DEFAULT 'dish',     -- 'dish' | 'logo' | 'restaurant'
  source         TEXT DEFAULT 'unsplash', -- 'unsplash' | 'google_places' | 'manual'
  source_ref     TEXT,                    -- Unsplash photo ID or Google place_id
  alt_text       TEXT,
  width          INT,
  height         INT,
  is_primary     BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Only one primary image per menu item (enforced deferrable)
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_images_primary_per_item
  ON item_images(menu_item_id, is_primary)
  WHERE is_primary = TRUE
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS idx_item_images_menu_item_id   ON item_images(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_item_images_restaurant_id  ON item_images(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_item_images_restaurant_logo
  ON item_images(restaurant_id, image_type) WHERE image_type = 'logo';

-- RLS: public read, service_role write
ALTER TABLE item_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "item_images_public_read"   ON item_images FOR SELECT USING (TRUE);
CREATE POLICY "item_images_service_write" ON item_images FOR ALL USING (auth.role() = 'service_role');
