# Guest Trial Implementation Summary

## Overview
Implemented a complete end-to-end guest trial system with 3 free uses (chat + search combined), sessionStorage-based persistence, inactivity timeout, and seamless migration to authenticated accounts.

## Files Changed

### New Files Created

1. **`lib/guest-session.ts`**
   - Central utility for managing guest session data in sessionStorage
   - Handles guest_session_id, trial_count, last_activity_ts, and chat_messages
   - Implements 30-minute inactivity timeout
   - Provides migration function for signup flow

2. **`lib/usage-gate.ts`**
   - Central utility for checking and incrementing trial usage
   - Supports 'chat' and 'search' features
   - Returns true for authenticated users (unlimited), false for guests at limit

3. **`supabase_conversations_messages_tables.sql`**
   - SQL migration for conversations and messages tables
   - Includes RLS policies for user data isolation
   - Supports meal_data and meal_search_context as JSONB

### Modified Files

1. **`app/components/AIChat.tsx`**
   - Integrated GuestSession and UsageGate utilities
   - Added usage gating BEFORE sending messages (not after)
   - Shows gate message: "You have ran out of your 3 free trial uses, please create an account to continue using the app for free."
   - CTA button: "Create account to continue"
   - Loads messages from Supabase for authenticated users
   - Migrates guest messages to Supabase on signup
   - Disables input and send button when limit reached

2. **`app/components/HomeScreen.tsx`**
   - Added usage gating to `handleFindMeals` function
   - Checks usage BEFORE making search API call
   - Redirects to `/chat` if limit reached
   - Increments usage count on successful search

3. **`app/components/OnboardingFlow.tsx`**
   - Updated to redirect to `/chat` after location step (instead of window.location.href)
   - Uses router.push for proper Next.js navigation

4. **`app/auth/signup/page.tsx`**
   - Added guest chat migration logic
   - Migrates guest messages from sessionStorage to Supabase conversations/messages tables
   - Works for both chat gate signup and normal signup flows
   - Preserves chat history after account creation

## Implementation Details

### Guest Session Management
- **Storage**: sessionStorage (clears on tab close)
- **Inactivity Timeout**: 30 minutes
- **Data Stored**:
  - `guest_session_id`: Unique ID for the session
  - `guest_trial_count`: 0-3 usage count
  - `guest_last_activity_ts`: Last activity timestamp
  - `guest_chat_messages`: Array of chat messages

### Usage Gating Logic
- **Guests**: 3 total uses (chat + search combined)
- **Authenticated Users**: Unlimited access
- **Check Timing**: BEFORE making API calls
- **Lock Behavior**: 
  - Chat: Disables input, shows gate message with CTA
  - Search: Redirects to chat page

### Chat Persistence
- **Guests**: sessionStorage (via GuestSession utility)
- **Authenticated**: Supabase (conversations + messages tables)
- **Migration**: Automatic on signup
- **Reset Conditions**: Tab close, 30 min inactivity, sign out

### Database Schema

#### conversations table
- `id` (UUID, PK)
- `user_id` (UUID, FK → auth.users)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

#### messages table
- `id` (UUID, PK)
- `conversation_id` (UUID, FK → conversations)
- `role` (TEXT: 'user' | 'assistant')
- `content` (TEXT)
- `created_at` (TIMESTAMPTZ)
- `meal_data` (JSONB, optional)
- `meal_search_context` (JSONB, optional)

## User Flow

1. **New User** → `/get-started` (welcome screen)
2. **Onboarding** → `/onboarding` → location step → `/chat`
3. **Guest Usage**:
   - Can use chat/search 3 times total
   - Messages persist in sessionStorage
   - After 3 uses: input disabled, gate message shown, CTA button appears
4. **Signup**:
   - Click "Create account to continue" → `/auth/signup`
   - After signup: guest chat migrated to Supabase
   - Redirected to `/chat` with full access
   - Previous messages preserved and displayed

## Key Features

✅ 3 free trial uses (chat + search combined)  
✅ sessionStorage persistence (survives refresh, clears on tab close)  
✅ 30-minute inactivity timeout  
✅ Usage gating BEFORE API calls  
✅ Gate message with CTA button  
✅ Seamless migration to authenticated accounts  
✅ Chat history preserved after signup  
✅ RLS policies for data security  

## SQL Migration

Run `supabase_conversations_messages_tables.sql` in your Supabase SQL Editor to create the required tables and policies.

## Testing Checklist

- [ ] Guest can use chat 3 times
- [ ] Guest can use search 3 times (combined with chat)
- [ ] Gate message appears after 3 uses
- [ ] Input is disabled when limit reached
- [ ] CTA button routes to signup
- [ ] Chat persists across refresh (same tab)
- [ ] Chat clears after 30 min inactivity
- [ ] Chat clears on tab close
- [ ] Signup migrates guest chat to Supabase
- [ ] Authenticated users have unlimited access
- [ ] Messages load from Supabase for authenticated users

