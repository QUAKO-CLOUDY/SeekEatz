ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free'
  CHECK (subscription_tier IN ('free', 'monthly', 'yearly'));

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive'
  CHECK (subscription_status IN ('inactive', 'trialing', 'active', 'canceled', 'past_due'));

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS trial_source TEXT NULL
  CHECK (trial_source IN ('waitlist'));

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ NULL;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS waitlist_free_month_redeemed_at TIMESTAMPTZ NULL;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS waitlist_free_month_email TEXT NULL;

ALTER TABLE waitlist_signups
ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ NULL;

ALTER TABLE waitlist_signups
ADD COLUMN IF NOT EXISTS redeemed_by_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS waitlist_signups_redeemed_at_idx;
CREATE INDEX IF NOT EXISTS waitlist_signups_redeemed_at_idx
  ON waitlist_signups(redeemed_at);

ALTER TABLE usage_events
DROP CONSTRAINT IF EXISTS usage_events_event_type_check;

ALTER TABLE usage_events
ADD CONSTRAINT usage_events_event_type_check
CHECK (event_type IN ('chat_submit', 'chat_response', 'search_submit', 'metered_query', 'limit_hit'));
