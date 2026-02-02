-- SQL script to create the atomic join_waitlist function
-- Run this in your Supabase Dashboard SQL Editor
-- This function ensures atomic "first 50 get free month" logic

CREATE OR REPLACE FUNCTION public.join_waitlist(email_input TEXT)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_email TEXT;
  signup_record RECORD;
  signup_rank INTEGER;
  is_duplicate BOOLEAN := FALSE;
  is_free_month BOOLEAN := FALSE;
  before_timestamp TIMESTAMPTZ;
BEGIN
  -- Normalize email: trim + lowercase
  normalized_email := LOWER(TRIM(email_input));
  
  -- Validate email format (basic check)
  IF normalized_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'Invalid email address'
    );
  END IF;
  
  -- Store timestamp before insert to detect duplicates
  before_timestamp := NOW();
  
  -- Insert or get existing record atomically
  INSERT INTO waitlist_signups (email)
  VALUES (normalized_email)
  ON CONFLICT (email) DO UPDATE
    SET email = waitlist_signups.email  -- No-op update to return the row
  RETURNING * INTO signup_record;
  
  -- Check if this was a duplicate by comparing created_at
  -- If created_at is significantly before our before_timestamp, it's a duplicate
  -- (allowing 100ms buffer for transaction timing)
  IF signup_record.created_at < before_timestamp - INTERVAL '100 milliseconds' THEN
    is_duplicate := TRUE;
  END IF;
  
  -- Determine rank: position when ordering by created_at ASC, id ASC
  SELECT rank INTO signup_rank
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) as rank
    FROM waitlist_signups
  ) ranked
  WHERE id = signup_record.id;
  
  -- If rank <= 50, set is_free_month = true and promo_code
  IF signup_rank <= 50 THEN
    is_free_month := TRUE;
    
    -- Update the record to set is_free_month and promo_code
    UPDATE waitlist_signups
    SET is_free_month = TRUE,
        promo_code = 'FREEMONTH'
    WHERE id = signup_record.id;
  END IF;
  
  -- Return result
  RETURN json_build_object(
    'ok', true,
    'free_month', is_free_month,
    'duplicate', is_duplicate
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Return error on any exception
    RETURN json_build_object(
      'ok', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated and anon users
GRANT EXECUTE ON FUNCTION public.join_waitlist(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.join_waitlist(TEXT) TO authenticated;

-- Test the function (optional - comment out after testing)
-- SELECT public.join_waitlist('test@example.com');

