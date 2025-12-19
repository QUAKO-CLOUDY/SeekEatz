-- SQL migration to add free month promo columns to waitlist_signups
-- Run this in your Supabase Dashboard SQL Editor

-- Add new columns for free month promo
ALTER TABLE waitlist_signups 
ADD COLUMN IF NOT EXISTS promo_code TEXT NULL,
ADD COLUMN IF NOT EXISTS is_free_month BOOLEAN DEFAULT FALSE;

-- Create index on is_free_month for faster queries
CREATE INDEX IF NOT EXISTS waitlist_signups_is_free_month_idx ON waitlist_signups(is_free_month);

-- Note: We're keeping is_early_access column if it exists (not deleting it)
-- but we'll stop using it in the application logic

-- Verify the table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'waitlist_signups'
ORDER BY ordinal_position;

