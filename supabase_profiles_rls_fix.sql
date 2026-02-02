-- Alternative RLS policy fix for profiles table
-- This allows users to insert their own profile during signup
-- Run this in your Supabase Dashboard SQL Editor
-- 
-- NOTE: The trigger approach (supabase_profiles_auto_create_trigger.sql) is preferred,
-- but this is an alternative if you don't want to use triggers

-- Drop existing insert policy if it exists
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Create a more permissive insert policy
-- This allows users to insert a profile where the id matches their auth.uid()
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Also ensure the policy allows the insert to happen
-- The WITH CHECK clause ensures the id matches the authenticated user's ID
-- This should work even during signup since auth.uid() should be available

-- Verify the policy was created
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
AND policyname = 'Users can insert own profile';




