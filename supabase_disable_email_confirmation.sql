-- Disable email confirmation for beta testing
-- This allows users to sign up and immediately sign in without email confirmation
-- Run this in your Supabase Dashboard SQL Editor
--
-- NOTE: In production, you may want to re-enable email confirmation for security

-- This is done via Supabase Dashboard, not SQL
-- Go to: Authentication > Settings > Email Auth
-- Set "Enable email confirmations" to OFF
--
-- Alternatively, you can use the Supabase Management API or CLI:
-- supabase projects update <project-ref> --disable-email-confirmations

-- Verify current settings (if you have access to auth schema)
-- SELECT * FROM auth.config WHERE key = 'email_confirmation_enabled';

-- IMPORTANT: Make sure the profile auto-create trigger is set up
-- Run: supabase_profiles_auto_create_trigger.sql
-- This ensures profiles are created even if email confirmation is enabled



