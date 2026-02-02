-- Add missing columns to profiles table if they don't exist
-- This ensures the table schema matches what the app expects
-- Run this in your Supabase Dashboard SQL Editor

-- Add has_completed_onboarding column if it doesn't exist
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

-- Add target_calories column if it doesn't exist (alternative name for calorie_goal)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'target_calories'
  ) THEN
    ALTER TABLE profiles ADD COLUMN target_calories INTEGER;
  END IF;
END $$;

-- Add target_protein_g column if it doesn't exist (alternative name for protein_goal)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'target_protein_g'
  ) THEN
    ALTER TABLE profiles ADD COLUMN target_protein_g INTEGER;
  END IF;
END $$;

-- Add target_carbs_g column if it doesn't exist (alternative name for carb_limit)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'target_carbs_g'
  ) THEN
    ALTER TABLE profiles ADD COLUMN target_carbs_g INTEGER;
  END IF;
END $$;

-- Add target_fats_g column if it doesn't exist (alternative name for fat_limit)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'target_fats_g'
  ) THEN
    ALTER TABLE profiles ADD COLUMN target_fats_g INTEGER;
  END IF;
END $$;

-- Add search_distance_miles column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'search_distance_miles'
  ) THEN
    ALTER TABLE profiles ADD COLUMN search_distance_miles INTEGER DEFAULT 10;
  END IF;
END $$;

-- Add user_profile JSONB column if it doesn't exist (for backward compatibility)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'user_profile'
  ) THEN
    ALTER TABLE profiles ADD COLUMN user_profile JSONB;
  END IF;
END $$;

-- Verify all columns exist
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;



