# Restaurant Intent Detection Fix V2 Summary

## Overview
Fixed restaurant intent detection so generic dish queries like "burger" don't trigger "restaurant not found" messages. Restaurant intent now only triggers when explicit markers exist OR when a known restaurant is matched with high confidence.

## Root Cause
- `detectRestaurantIntent()` was returning `true` for generic dish queries like "burger"
- Short messages without explicit markers were being treated as restaurant intent
- No dish guard to prevent dish terms from triggering restaurant intent

## Files Modified

### 1. `lib/restaurant-resolver.ts`

**Changes**:

**Lines ~20-30**: Expanded generic food term guard list
- Added: `acai`, `acai bowl`, `smoothie`, `smoothie bowl`, `ramen`, `sushi`, `sashimi`, `poke`, `poke bowl`
- Added `MACRO_TERMS` set for macro-related terms

**Lines ~32-138**: Completely rewrote `detectRestaurantIntent()` function
- **Now async**: Returns `Promise<{ intent: boolean; reason: string }>`
- **Rule A**: Explicit markers always trigger restaurant intent
  - Patterns: `/\b(from|at|in)\s+[a-z0-9\s&'-]+/i` or `/\b[a-z0-9\s&'-]+\s+(menu|restaurant|order|near me)\b/i`
- **DISH GUARD**: If message is only dish terms (or dish terms + macro terms), return false
  - Checks if all normalized words are in `GENERIC_FOOD_TERMS` or `MACRO_TERMS`
  - If has dish noun but no explicit marker, return false
- **Rule B**: For short messages (<=28 chars), check if it matches a known restaurant
  - Exact match → return true with reason 'matchedRestaurant'
  - Contains match → return true with reason 'matchedRestaurant'
  - Fuzzy match (score >= 0.5) → return true with reason 'matchedRestaurant'
  - Otherwise → return false with reason 'none'

**Lines ~142-146**: Updated `RestaurantMatchResult` type
- Added `NO_RESTAURANT` status for when no restaurant intent is detected

**Lines ~388-450**: Updated `resolveRestaurantFromText()` function
- Accepts `restaurantIntent?: boolean | { intent: boolean; reason: string }`
- If `restaurantIntent` is false or `NO_RESTAURANT`, returns `{ status: 'NO_RESTAURANT' }`
- Only extracts candidate phrase from marker patterns (calls `extractRestaurantCandidateFromMarkers()`)

**Lines ~292-335**: Renamed and simplified `extractRestaurantCandidate()` → `extractRestaurantCandidateFromMarkers()`
- Only extracts from explicit marker patterns
- Removed generic short message extraction (now handled in `detectRestaurantIntent()`)

**Lines ~354-386**: Made `computeFuzzyScore()` exported
- Used by both `detectRestaurantIntent()` and `resolveRestaurantFromText()`

### 2. `app/api/chat/route.ts`

**Changes**:

**Lines ~609-627**: Updated restaurant intent detection
- Calls `await detectRestaurantIntent(message)` (now async)
- Gets `intentResult` with `intent` and `reason` fields
- Passes `intentResult` to `resolveRestaurantFromText()`

**Lines ~629-632**: Added `NO_RESTAURANT` handling
- If `restaurantMatch.status === 'NO_RESTAURANT'`, proceed with normal dish search
- No restaurant constraint applied

**Lines ~634-668**: Updated `NOT_FOUND` handling
- Only shows apology message if `restaurantIntent` is true
- Dev assertion ensures NOT_FOUND only happens when restaurantIntent is true

**Lines ~785-789**: Updated constraint merging
- If `restaurantMatch.status === 'NO_RESTAURANT'`, don't set restaurant constraint
- Proceed with normal dish search

### 3. `lib/__tests__/restaurant-resolver.test.ts` (NEW)

**Test Cases**:
- "burger" => restaurantIntent false (dishGuard)
- "I want a burger" => false (dishGuard)
- "from jimmy johns" => true (marker)
- "jimmy johns" => true (matchedRestaurant) - only if matches known restaurant
- "acai bowl" => false (dishGuard)
- "sub from jimmy johns" => true (marker)
- "burger under 500 calories" => false (dishGuard)
- "jimmy johns menu" => true (marker)
- "madeupplace" => false (none) - unknown restaurant, no match

## Key Features

### 1. Dish Guard
- Prevents generic dish terms from triggering restaurant intent
- Checks if all normalized words are dish terms or macro terms
- Returns false unless explicit markers are present

### 2. Explicit Markers
- "from X", "at X", "in X" → always triggers restaurant intent
- "X menu", "X restaurant", "X order", "X near me" → always triggers restaurant intent

### 3. Restaurant Matching for Short Messages
- For messages <=28 chars, checks if it matches a known restaurant
- Exact match → restaurant intent true
- Contains match → restaurant intent true
- Fuzzy match (score >= 0.5) → restaurant intent true
- Otherwise → restaurant intent false

### 4. NO_RESTAURANT Status
- New status returned when no restaurant intent is detected
- Treated as normal dish search (no restaurant constraint)
- Never shows "we don't have it" message

## Acceptance Tests

✅ **"burger"** → Never returns restaurant NOT_FOUND message
- `restaurantIntent = false` (dishGuard)
- `restaurantMatch.status = NO_RESTAURANT`
- Proceeds with normal dish search

✅ **"I want a sub from jimmy johns"** → Matches Jimmy John's even with apostrophe/misspelling
- `restaurantIntent = true` (marker: "from")
- `restaurantMatch.status = MATCH`
- Enforces restaurant-only query

✅ **Unknown restaurant with explicit marker** → Returns apology
- `restaurantIntent = true` (marker)
- `restaurantMatch.status = NOT_FOUND`
- Shows "Sorry — we don't have X in our database yet."

✅ **"acai bowl"** → Never triggers restaurant intent
- `restaurantIntent = false` (dishGuard)
- `restaurantMatch.status = NO_RESTAURANT`
- Proceeds with normal dish search

## Diagnostics

**Logging Added**:
- `[restaurantResolver] Diagnostics`: userText, restaurantIntent, intentReason
- `[restaurantResolver] No restaurant intent detected - returning NO_RESTAURANT`
- `[restaurantResolver] Extracted candidate phrase`: candidatePhrase
- `[api/chat] Restaurant resolution`: restaurantIntent, intentReason, status, canonicalName, matchType, candidates

**Dev Assertions**:
- Ensures NOT_FOUND only happens when restaurantIntent is true
- Logs intent reason for debugging

## Files Changed Summary

1. **MODIFIED**: `lib/restaurant-resolver.ts` - Rewrote `detectRestaurantIntent()`, added `NO_RESTAURANT` status, updated `resolveRestaurantFromText()`
2. **MODIFIED**: `app/api/chat/route.ts` - Updated to handle async `detectRestaurantIntent()`, handle `NO_RESTAURANT` status
3. **NEW**: `lib/__tests__/restaurant-resolver.test.ts` - Unit tests for restaurant intent detection
4. **NEW**: `RESTAURANT_INTENT_FIX_V2_SUMMARY.md` - This documentation



