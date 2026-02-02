-- Comprehensive RLS policies for profiles table
-- Ensures complete profile isolation - users can only access their own profile
-- Run this in your Supabase Dashboard SQL Editor

-- Enable Row Level Security (RLS) if not already enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- Policy 1: Users can SELECT (read) only their own profile
-- This ensures users can only see their own profile data
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Policy 2: Users can UPDATE only their own profile
-- This ensures users can only modify their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy 3: Users can INSERT only their own profile
-- This ensures users can only create a profile with their own user ID
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Policy 4: Users can DELETE only their own profile (if needed)
-- Note: This is optional - you may want to prevent profile deletion
-- Uncomment if you want to allow users to delete their own profile
-- CREATE POLICY "Users can delete own profile"
--   ON profiles FOR DELETE
--   USING (auth.uid() = id);

-- Verify all policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- Test query to verify RLS is working
-- This should only return the current user's profile (if authenticated)
-- SELECT * FROM profiles;



