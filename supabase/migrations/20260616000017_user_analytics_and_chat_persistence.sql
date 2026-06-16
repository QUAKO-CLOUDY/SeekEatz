-- User analytics: search telemetry, funnel events, chat persistence fixes, daily funnel view.
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS throughout.

-- ---------------------------------------------------------------------------
-- search_requests: every search with query text, latency, success, result count
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS search_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('chat', 'home_search', 'api_search')),
  query_text TEXT NOT NULL,
  query_hash TEXT NOT NULL,
  intent TEXT,
  strategy TEXT,
  restaurant_id TEXT,
  restaurant_name TEXT,
  constraints JSONB,
  applied_filters JSONB,
  results_returned INT NOT NULL DEFAULT 0,
  has_more BOOLEAN NOT NULL DEFAULT FALSE,
  next_offset INT,
  duration_ms INT NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_requests_created_at ON search_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_requests_user_id ON search_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_search_requests_success ON search_requests(success);
CREATE INDEX IF NOT EXISTS idx_search_requests_query_hash ON search_requests(query_hash);
CREATE INDEX IF NOT EXISTS idx_search_requests_source ON search_requests(source);

ALTER TABLE search_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "search_requests_service_all" ON search_requests;
CREATE POLICY "search_requests_service_all"
  ON search_requests FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "search_requests_authenticated_insert" ON search_requests;
CREATE POLICY "search_requests_authenticated_insert"
  ON search_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "search_requests_anon_insert" ON search_requests;
CREATE POLICY "search_requests_anon_insert"
  ON search_requests FOR INSERT
  WITH CHECK (user_id IS NULL);

-- ---------------------------------------------------------------------------
-- user_funnel_events: account_created, first_search_with_constraints, first_meal_logged
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('account_created', 'first_search_with_constraints', 'first_meal_logged')
  ),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_user_funnel_events_created_at ON user_funnel_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_funnel_events_event_type ON user_funnel_events(event_type);
CREATE INDEX IF NOT EXISTS idx_user_funnel_events_user_id ON user_funnel_events(user_id);

ALTER TABLE user_funnel_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_funnel_events_service_all" ON user_funnel_events;
CREATE POLICY "user_funnel_events_service_all"
  ON user_funnel_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "user_funnel_events_authenticated_insert" ON user_funnel_events;
CREATE POLICY "user_funnel_events_authenticated_insert"
  ON user_funnel_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Record account_created when a profile row is created (via existing auth trigger).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_funnel_events (user_id, event_type, metadata)
  VALUES (
    NEW.id,
    'account_created',
    jsonb_build_object('source', 'auth_signup')
  )
  ON CONFLICT (user_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Backfill account_created for existing profiles (does not modify profiles rows).
INSERT INTO public.user_funnel_events (user_id, event_type, metadata)
SELECT id, 'account_created', jsonb_build_object('source', 'backfill')
FROM public.profiles
ON CONFLICT (user_id, event_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- chat_sessions + messages: ensure schema and RLS for client persistence
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own chat sessions" ON chat_sessions;
CREATE POLICY "Users can view their own chat sessions"
  ON chat_sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own chat sessions" ON chat_sessions;
CREATE POLICY "Users can insert their own chat sessions"
  ON chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own chat sessions" ON chat_sessions;
CREATE POLICY "Users can update their own chat sessions"
  ON chat_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- messages table may pre-exist with a minimal schema; add missing columns.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN session_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'meal_data'
  ) THEN
    ALTER TABLE messages ADD COLUMN meal_data JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'meal_search_context'
  ) THEN
    ALTER TABLE messages ADD COLUMN meal_search_context JSONB;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view messages in their own conversations" ON messages;
DROP POLICY IF EXISTS "Users can view messages in their own chat sessions" ON messages;
CREATE POLICY "Users can view messages in their own chat sessions"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.session_id = messages.session_id
        AND chat_sessions.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert messages in their own conversations" ON messages;
DROP POLICY IF EXISTS "Users can insert messages in their own chat sessions" ON messages;
CREATE POLICY "Users can insert messages in their own chat sessions"
  ON messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.session_id = messages.session_id
        AND chat_sessions.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update messages in their own conversations" ON messages;
DROP POLICY IF EXISTS "Users can update messages in their own chat sessions" ON messages;
CREATE POLICY "Users can update messages in their own chat sessions"
  ON messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.session_id = messages.session_id
        AND chat_sessions.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION update_chat_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_chat_sessions_updated_at_trigger ON chat_sessions;
CREATE TRIGGER update_chat_sessions_updated_at_trigger
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_sessions_updated_at();

-- ---------------------------------------------------------------------------
-- Daily funnel drop-off view (service role / SQL editor only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.daily_funnel_metrics AS
WITH daily_accounts AS (
  SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS accounts_created
  FROM user_funnel_events
  WHERE event_type = 'account_created'
  GROUP BY 1
),
daily_first_search AS (
  SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS first_search_with_constraints
  FROM user_funnel_events
  WHERE event_type = 'first_search_with_constraints'
  GROUP BY 1
),
daily_first_meal AS (
  SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS first_meal_logged
  FROM user_funnel_events
  WHERE event_type = 'first_meal_logged'
  GROUP BY 1
),
days AS (
  SELECT day FROM daily_accounts
  UNION
  SELECT day FROM daily_first_search
  UNION
  SELECT day FROM daily_first_meal
)
SELECT
  d.day,
  COALESCE(a.accounts_created, 0) AS accounts_created,
  COALESCE(s.first_search_with_constraints, 0) AS first_search_with_constraints,
  COALESCE(m.first_meal_logged, 0) AS first_meal_logged,
  COALESCE(a.accounts_created, 0) - COALESCE(s.first_search_with_constraints, 0) AS dropoff_account_to_search,
  COALESCE(s.first_search_with_constraints, 0) - COALESCE(m.first_meal_logged, 0) AS dropoff_search_to_meal,
  ROUND(
    100.0 * COALESCE(s.first_search_with_constraints, 0) / NULLIF(COALESCE(a.accounts_created, 0), 0),
    1
  ) AS pct_account_to_search,
  ROUND(
    100.0 * COALESCE(m.first_meal_logged, 0) / NULLIF(COALESCE(s.first_search_with_constraints, 0), 0),
    1
  ) AS pct_search_to_meal
FROM days d
LEFT JOIN daily_accounts a ON a.day = d.day
LEFT JOIN daily_first_search s ON s.day = d.day
LEFT JOIN daily_first_meal m ON m.day = d.day
ORDER BY d.day DESC;
