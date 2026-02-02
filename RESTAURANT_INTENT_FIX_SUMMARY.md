# Restaurant Intent Detection Fix Summary

## Overview
Fixed restaurant detection to prevent generic dish queries like "burger" from incorrectly triggering "we don't have it in our database" messages. Restaurant constraint now applies ONLY when user explicitly indicates restaurant intent.

## Root Cause
- Restaurant detection was firing for all meal searches, treating dish words as restaurant intent
- `extractRestaurantCandidate` was too aggressive, treating short messages like "burger" as potential restaurant names
- NOT_FOUND branch was being used even when user did NOT request a restaurant

## Files Modified

### 1. `lib/restaurant-resolver.ts`

**Changes**:

**Lines ~20-30**: Added generic food term guard list
```typescript
const GENERIC_FOOD_TERMS = new Set([
  'burger', 'burgers', 'burrito', 'burritos', 'pizza', 'pizzas', 'tacos', 'taco',
  'salad', 'salads', 'sandwich', 'sandwiches', 'fries', 'fry', 'chicken', 'wings',
  // ... more terms
]);
```

**Lines ~32-90**: Added `detectRestaurantIntent(userText)` function
- Returns `true` only when user explicitly indicates restaurant intent
- Checks for explicit markers: "from X", "at X", "in X", "X menu", "X restaurant", "X order", "X near me"
- Guards against generic food terms (forces `restaurantIntent = false` if text is a dish term)
- For short messages (1-5 tokens), only treats as restaurant intent if:
  - No action verbs (find, show, get, want, etc.)
  - Doesn't match generic food terms
  - Looks like a brand name (will be validated against known restaurants)

**Lines ~124-205**: Updated `extractRestaurantCandidate()` function
- Added `hasRestaurantIntent` parameter
- Only extracts candidate if restaurant intent is detected
- Guards against generic food terms
- Pattern 3 (substring matching) and Pattern 4 (short message) only run if `hasRestaurantIntent` is true

**Lines ~262-290**: Updated `resolveRestaurantFromText()` function
- Added optional `restaurantIntent` parameter
- If `restaurantIntent` is false, returns `NOT_FOUND` immediately (doesn't try to match)
- Only attempts matching when restaurant intent is detected

**Lines ~345-400**: Updated fuzzy matching thresholds
- Increased threshold from 40% to 50% similarity minimum
- Increased score difference requirement from 0.08 to 0.1 (stricter)
- Only returns MATCH on high confidence

### 2. `app/api/chat/route.ts`

**Changes**:

**Lines ~609-620**: Added restaurant intent detection
```typescript
const { detectRestaurantIntent } = await import('@/lib/restaurant-resolver');
const restaurantIntent = detectRestaurantIntent(message);
const restaurantMatch = await resolveRestaurantFromText(message, restaurantIntent);
```

**Lines ~622-660**: Updated NOT_FOUND handling
- Only shows "we don't have it" message if `restaurantIntent` is true
- Added dev assertion to ensure NOT_FOUND only happens when restaurantIntent is true
- If NOT_FOUND but no restaurant intent, proceeds with normal dish search (no error message)

**Lines ~663-674**: Updated AMBIGUOUS handling
- Only asks for disambiguation if `restaurantIntent` is true

**Lines ~676**: Added comment clarifying behavior
- If NOT_FOUND but no restaurant intent, proceed with normal dish search

## Key Features

### 1. Restaurant Intent Detection
- Explicit markers: "from X", "at X", "in X", "X menu", "X restaurant", "X order", "X near me"
- Generic food term guard prevents misclassification
- Short message detection only for brand names (validated against known restaurants)

### 2. High Confidence Matching
- Fuzzy match threshold increased from 40% to 50%
- Score difference requirement increased from 0.08 to 0.1
- Only returns MATCH on high confidence

### 3. Safe Fallback
- If NOT_FOUND but no restaurant intent → proceed with normal dish search
- Never shows "we don't have it" message unless restaurant intent is explicit

## Acceptance Tests

✅ **"burger"** → Returns burger meals (no NOT_FOUND)
- `restaurantIntent = false` (generic food term guard)
- `restaurantMatch.status = NOT_FOUND` but no error message shown
- Proceeds with normal dish search

✅ **"I want a burger"** → Normal dish results
- `restaurantIntent = false` (has action verb "want")
- Proceeds with normal dish search

✅ **"Jimmy johns"** → Restaurant-only results
- `restaurantIntent = true` (short message, no action verb, matches known restaurant)
- `restaurantMatch.status = MATCH`
- Enforces restaurant-only query

✅ **"sub from jimmy johns"** → Restaurant-only results
- `restaurantIntent = true` (explicit marker "from")
- `restaurantMatch.status = MATCH`
- Enforces restaurant-only query

✅ **"sub from jimmy jonhs"** (misspelling) → Restaurant-only results via fuzzy
- `restaurantIntent = true` (explicit marker "from")
- `restaurantMatch.status = MATCH` (fuzzy match with high confidence)
- Enforces restaurant-only query

✅ **"sub from madeupplace"** → NOT_FOUND message
- `restaurantIntent = true` (explicit marker "from")
- `restaurantMatch.status = NOT_FOUND`
- Shows "Sorry — we don't have madeupplace in our database yet."

## Diagnostics

**Logging Added**:
- `[restaurantResolver] Diagnostics`: userText, restaurantIntent, candidatePhrase, normalizedCandidates
- `[restaurantResolver] No restaurant intent detected - skipping match`: when intent is false
- `[restaurantResolver] Fuzzy match (high confidence)`: when fuzzy match succeeds
- `[api/chat] Restaurant resolution`: restaurantIntent, status, canonicalName, matchType, candidates
- `[api/chat] CRITICAL: NOT_FOUND returned but restaurantIntent is false!`: dev assertion violation

**Dev Assertions**:
- Ensures NOT_FOUND only happens when restaurantIntent is true
- Logs warning if NOT_FOUND returned but restaurantIntent is false

## Files Changed Summary

1. **MODIFIED**: `lib/restaurant-resolver.ts` - Added intent detection, generic food term guard, stricter matching
2. **MODIFIED**: `app/api/chat/route.ts` - Added intent detection, updated NOT_FOUND/AMBIGUOUS handling
3. **NEW**: `RESTAURANT_INTENT_FIX_SUMMARY.md` - This documentation

