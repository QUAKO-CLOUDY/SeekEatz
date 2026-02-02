# Chat Sessions Refactor Summary

## Overview
Refactored chat persistence system to use `chat_sessions(session_id, user_id)` + `messages(session_id, ...)` schema instead of `conversations(conversation_id, user_id)` + `messages(conversation_id, ...)`.

## Key Changes

### Database Schema
- **New table**: `chat_sessions` with `session_id` (TEXT PRIMARY KEY) and `user_id` (UUID)
- **Updated**: `messages` table now uses `session_id` instead of `conversation_id`
- **Migration**: `supabase_chat_sessions_migration.sql` handles migration from old schema

### Session Management
- **Session ID**: Stable UUID per browser tab stored in `sessionStorage` at key `seekeatz_guest_session_id`
- **Generation**: Uses `crypto.randomUUID()` with fallback to UUID v4 generation
- **Rotation**: Session ID rotates on sign out or inactivity reset (but NOT on tab close - that's handled by sessionStorage)

### Guest Session (`lib/guest-session.ts`)
- **Keys used**:
  - `seekeatz_guest_session_id` - Current session UUID
  - `guest_trial_count` - Trial usage count (0-3, persists across inactivity)
  - `seekeatz_chat_lastActivityAt` - Last activity timestamp
  - `seekeatz_chat_messages` - Guest chat messages array
- **Functions**:
  - `getGuestSessionId()` - Get/create stable session ID
  - `rotateGuestSessionId()` - Create new session ID
  - `touchGuestActivity()` - Update activity timestamp
  - `clearGuestSession()` - Clear chat data (NOT trial count)
  - `clearGuestSessionFull()` - Clear everything including trial count
  - `getGuestChatForMigration()` - Get session ID + messages for signup

### Usage Gating (`lib/usage-gate.ts`)
- **Single source of truth**: All guest usage tracking via `guest-session.ts`
- **No legacy keys**: Removed all references to `FREE_CHAT_COUNT_KEY`, `FREE_CHAT_COUNT_KEY_LOCAL`, `MAX_FREE_CHATS`
- **Functions**: `canUseFeature()`, `incrementUsage()`, `hasReachedLimit()`

### AIChat Component (`app/components/AIChat.tsx`)
- **Removed**: All `conversations` table logic, `getOrCreateConversation()`, `conversation_id` usage
- **Added**: `ensureChatSessionOwned()` - Upserts `chat_sessions` to claim session for authenticated user
- **Session ID**: Stored in component state, initialized from `getGuestSessionId()`
- **Message Loading**: Loads from Supabase using `session_id` for authenticated users
- **Message Logging**: Inserts into `messages` with `session_id` instead of `conversation_id`
- **State**: Renamed `hasReachedLimit` state to `isLimitReached` to avoid conflict with imported function
- **Activity Tracking**: All user interactions call `touchGuestActivity()`
- **Inactivity**: Checks every 30s, clears chat after 30 min (but NOT trial count)
- **Sign Out**: Clears chat and rotates session ID (but NOT trial count)

### Signup Page (`app/auth/signup/page.tsx`)
- **Updated**: Uses `getGuestChatForMigration()` to get session ID + messages
- **Migration**: Upserts `chat_sessions` to claim the session, then inserts messages with `session_id`
- **Works for**: Both chat gate signup and normal signup flows

## Storage Keys Summary

### sessionStorage (per-tab, clears on tab close)
- `seekeatz_guest_session_id` - Current session UUID
- `guest_trial_count` - Trial usage count (0-3)
- `seekeatz_chat_lastActivityAt` - Last activity timestamp
- `seekeatz_chat_messages` - Guest chat messages (JSON array)
- `seekeatz_chat_scroll_position` - Scroll position
- `seekeatz_visible_meals_count` - Visible meals count per message

### localStorage (persists across tabs)
- None used for chat/trial tracking (all in sessionStorage)

## Behavior

### Guest Users
1. Session ID created on first visit (stable per tab)
2. Messages stored in sessionStorage
3. Trial count tracked separately (persists across inactivity)
4. After 3 uses: Input disabled, gate message shown
5. Inactivity (30 min): Chat cleared, session ID rotated, trial count preserved
6. Tab close: All sessionStorage cleared (natural browser behavior)

### Authenticated Users
1. On sign in: Current session is "claimed" via `ensureChatSessionOwned()`
2. Guest messages migrated to Supabase
3. Future messages logged to Supabase with `session_id`
4. Messages loaded from Supabase on mount
5. Unlimited access (no gating)

### Sign Out
1. Chat messages cleared
2. Session ID rotated (new session)
3. Trial count preserved (guest can continue with remaining uses)

## Files Changed
- `lib/guest-session.ts` - Updated session management
- `lib/usage-gate.ts` - No changes (already correct)
- `app/components/AIChat.tsx` - Major refactor to use session_id
- `app/auth/signup/page.tsx` - Updated to use new schema
- `supabase_chat_sessions_migration.sql` - New migration file

## Testing Checklist
- [ ] Guest chat persists across refresh (same tab)
- [ ] Guest chat clears after 30 min inactivity
- [ ] Trial count persists across inactivity
- [ ] Session ID rotates on sign out
- [ ] Sign up migrates guest chat to Supabase
- [ ] Authenticated users load messages from Supabase
- [ ] Gate message shows after 3 uses
- [ ] Input disabled when limit reached
- [ ] No duplicate gating logic

