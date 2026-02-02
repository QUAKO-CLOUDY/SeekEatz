-- Create usage_events table for logging usage analytics
CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('chat_submit', 'chat_response', 'limit_hit')),
  metadata JSONB, -- Optional: store additional event data
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_event_type ON usage_events(event_type);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at);

-- Enable RLS (Row Level Security)
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own usage events
CREATE POLICY "Users can view their own usage events"
  ON usage_events FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own usage events
CREATE POLICY "Users can insert their own usage events"
  ON usage_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

