-- Add has_completed_onboarding field to profiles table
-- Run this in your Supabase Dashboard SQL Editor

-- Add the column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'has_completed_onboarding'
  ) THEN
    ALTER TABLE profiles ADD COLUMN has_completed_onboarding BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS profiles_has_completed_onboarding_idx ON profiles(has_completed_onboarding);

-- Verify the column was added
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name = 'has_completed_onboarding';

