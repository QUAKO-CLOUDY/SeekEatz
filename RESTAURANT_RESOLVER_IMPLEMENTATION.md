# Restaurant Resolver Implementation Summary

## Overview
Implemented strict restaurant-only behavior in `/app/api/chat` route. When a user explicitly names a restaurant, responses must ONLY include meals from that restaurant.

## Files Created

### 1. `lib/restaurant-resolver.ts`
**Purpose**: Restaurant name detection and resolution utility

**Key Functions**:
- `normalizeRestaurantName(name: string)`: Normalizes restaurant names for comparison
  - lowercase, trim, collapse whitespace, remove punctuation
- `getRestaurantCandidates()`: Fetches distinct restaurant names from `menu_items` table
  - Uses in-memory cache with 10-minute TTL
  - Returns sorted array of unique restaurant names
- `resolveRestaurantFromText(userText: string)`: Main resolver function
  - Detects restaurant mentions in user text
  - Returns `MATCH`, `NOT_FOUND`, or `AMBIGUOUS` with candidates
  - Matching strategy:
    1. Exact normalized match (highest confidence)
    2. Contains match (e.g., "Firehouse" -> "Firehouse Subs") if exactly one candidate
    3. Ambiguous if multiple candidates
    4. NOT_FOUND if no match

**Restaurant Detection Patterns**:
- Short messages (1-6 tokens) that look like names
- "from X", "at X", "in X" patterns
- "X menu", "X meals" patterns
- Exact message == restaurant name

### 2. `lib/__tests__/restaurant-resolver.test.ts`
**Purpose**: Unit tests for restaurant resolver

**Test Cases**:
- Normalization: "firehouse subs" -> "Firehouse Subs"
- Pattern matching: "from Firehouse Subs", "at Subway", "Subway menu"
- NOT_FOUND: unknown restaurant "blarghburger"
- NOT_FOUND: messages without restaurant mention

## Files Modified

### 1. `app/api/chat/route.ts`

**Changes**:

**Line ~8**: Added import
```typescript
import { resolveRestaurantFromText } from '@/lib/restaurant-resolver';
```

**Lines ~605-680**: Added restaurant resolution logic before meal search
- Resolves restaurant from user text using `resolveRestaurantFromText()`
- Handles three cases:
  1. **NOT_FOUND**: Returns apology message if user explicitly mentioned restaurant that doesn't exist
  2. **AMBIGUOUS**: Asks for disambiguation with candidate list
  3. **MATCH**: Proceeds with strict restaurant filtering

**Lines ~695-730**: Updated constraint merging
- If `restaurantMatch.status === 'MATCH'`, uses `canonicalName` (overrides LLM/parsed restaurant)
- Ensures strict restaurant-only behavior

**Lines ~769-800**: Added dev assertion and restaurant metadata
- Dev assertion: Verifies all returned meals are from the matched restaurant
- Adds `restaurant` field to response metadata for UI display

**Key Behavior**:
- Restaurant resolution happens BEFORE any search
- If restaurant is NOT_FOUND and user explicitly mentioned it, returns apology immediately (no meals)
- If restaurant is MATCH, enforces strict filtering (all meals must be from that restaurant)
- Never mixes restaurants when restaurant is explicitly requested

### 2. `app/api/search/handler.ts`

**Changes**:

**Line ~1455**: Changed restaurant filter from ILIKE to exact match
```typescript
// BEFORE: query.ilike('restaurant_name', `%${restaurantFilter}%`)
// AFTER: query.eq('restaurant_name', restaurantFilter) // Exact match
```

**Lines ~1860-1875**: Added dev assertion for restaurant constraint
- After converting to final meal format, verifies all meals match `restaurantFilter`
- Throws error in development if any meal violates constraint

## Acceptance Tests

✅ **Input: "firehouse subs"** → Only Firehouse Subs meals
- Resolver matches "firehouse subs" to "Firehouse Subs" (exact normalized match)
- All returned meals have `restaurant_name === "Firehouse Subs"`

✅ **Input: "show me firehouse subs under 700 calories"** → Only Firehouse Subs meals + macro strict
- Resolver matches restaurant
- Macro filtering still applies (calories <= 700)
- All meals are from Firehouse Subs AND meet calorie constraint

✅ **Input: "blarghburger" (not in DB)** → Apology message, no meals
- Resolver returns NOT_FOUND
- Chat API returns: "Sorry — we don't have blarghburger in our database yet. Want me to show similar options from restaurants we do have?"
- No meals returned

✅ **Input: "subway"** → Only Subway meals
- Resolver matches "subway" to "Subway" (exact normalized match)
- All returned meals have `restaurant_name === "Subway"`

## Diagnostics

**Logging Added**:
- `[api/chat] Restaurant resolution`: Logs status, canonicalName, matchType, candidates
- `[restaurantResolver] Exact match found`: Logs extracted and canonical names
- `[restaurantResolver] Contains match found`: Logs match type
- `[restaurantResolver] Ambiguous match`: Logs candidates
- `[restaurantResolver] No match found`: Logs extracted name
- `[api/chat] Restaurant constraint verified`: Confirms all meals match restaurant
- `[searchHandler] Restaurant constraint verified`: Confirms all meals match restaurant

**Dev Assertions**:
- In `app/api/chat/route.ts`: Verifies all meals match `restaurantMatch.canonicalName`
- In `app/api/search/handler.ts`: Verifies all meals match `restaurantFilter`
- Both throw errors in development if violations detected

## Key Design Decisions

1. **Cache with TTL**: Restaurant list cached for 10 minutes to avoid repeated DB queries
2. **Normalization**: Removes punctuation for matching but preserves original for display
3. **Exact Match Priority**: Exact normalized match takes precedence over contains match
4. **Strict Filtering**: When restaurant is MATCH, uses exact DB query (`eq` not `ilike`)
5. **Early Return**: NOT_FOUND returns apology immediately, no search performed
6. **Dev Assertions**: Catches violations early in development

## Future Improvements

1. **Fuzzy Matching**: Could add Levenshtein distance for typos (e.g., "Firehose" -> "Firehouse")
2. **Abbreviation Support**: "MCD" -> "McDonald's", "BK" -> "Burger King"
3. **Location Context**: If user says "the Subway near me", could use location to disambiguate
4. **Restaurant Suggestions**: When NOT_FOUND, could suggest similar restaurant names

