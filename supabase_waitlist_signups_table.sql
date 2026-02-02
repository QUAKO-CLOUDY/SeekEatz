-- SQL script to create the waitlist_signups table
-- Run this in your Supabase Dashboard SQL Editor

-- Create the waitlist_signups table
CREATE TABLE IF NOT EXISTS waitlist_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT NULL,
  is_early_access BOOLEAN DEFAULT FALSE
);

-- Create index on created_at for faster queries
CREATE INDEX IF NOT EXISTS waitlist_signups_created_at_idx ON waitlist_signups(created_at);

-- Create index on email for faster lookups (already covered by UNIQUE constraint, but explicit is good)
CREATE INDEX IF NOT EXISTS waitlist_signups_email_idx ON waitlist_signups(email);

-- Verify the table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'waitlist_signups'
ORDER BY ordinal_position;

