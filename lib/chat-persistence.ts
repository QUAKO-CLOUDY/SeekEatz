/**
 * Server-side chat history in Supabase (chat_sessions + messages).
 * Default off: users get a fresh chat each visit; analytics are unaffected.
 * Set NEXT_PUBLIC_ENABLE_CHAT_PERSISTENCE=true to turn history back on.
 */
export const CHAT_PERSISTENCE_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_CHAT_PERSISTENCE === 'true';
