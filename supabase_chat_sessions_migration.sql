-- SQL migration to replace conversations with chat_sessions
-- Run this in your Supabase Dashboard SQL Editor

-- Create chat_sessions table (replaces conversations)
CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Update messages table to use session_id instead of conversation_id
-- First, add session_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN session_id TEXT;
  END IF;
END $$;

-- Create index on session_id for faster queries
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);

-- Migrate existing data if conversation_id exists
DO $$
DECLARE
  conv_record RECORD;
BEGIN
  -- If conversation_id column exists, migrate data
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'conversation_id'
  ) THEN
    -- Create chat_sessions from existing conversations
    INSERT INTO chat_sessions (session_id, user_id, created_at, updated_at)
    SELECT 
      gen_random_uuid()::TEXT as session_id,
      user_id,
      created_at,
      updated_at
    FROM conversations
    ON CONFLICT (session_id) DO NOTHING;
    
    -- Update messages to use session_id from chat_sessions
    UPDATE messages m
    SET session_id = cs.session_id
    FROM chat_sessions cs
    JOIN conversations c ON c.user_id = cs.user_id
    WHERE m.conversation_id = c.id;
  END IF;
END $$;

-- Drop conversation_id column and foreign key if they exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'conversation_id'
  ) THEN
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey;
    ALTER TABLE messages DROP COLUMN conversation_id;
  END IF;
END $$;

-- Drop conversations table if it exists (after migration)
DROP TABLE IF EXISTS conversations CASCADE;

-- Enable RLS
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_sessions
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
  USING (auth.uid() = user_id);

-- Update RLS policies for messages to use session_id
DROP POLICY IF EXISTS "Users can view messages in their own conversations" ON messages;
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
CREATE POLICY "Users can update messages in their own chat sessions"
  ON messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.session_id = messages.session_id
      AND chat_sessions.user_id = auth.uid()
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_chat_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS update_chat_sessions_updated_at_trigger ON chat_sessions;
CREATE TRIGGER update_chat_sessions_updated_at_trigger
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_sessions_updated_at();

