# Search Entry Points Audit

This document lists all entry points that trigger meal searches, how they call the search system, and what request fields they use.

## Entry Points

### 1. Quick Picks (HomeScreen)
**File:** `app/components/HomeScreen.tsx`

**Function:** `searchMeals()` (line ~377), called by `handleFindMeals()` (line ~430)

**How it calls search:**
- Calls `/api/search` endpoint via `fetch()`
- Request body: `{ query, radius_miles, user_location_lat?, user_location_lng? }`

**Request fields used:**
- `query`: String built from macro values, directions, and cuisine
- `radius_miles`: Number (distance filter)
- `user_location_lat`: Number (optional, from userLocation state)
- `user_location_lng`: Number (optional, from userLocation state)

**Notes:**
- Builds query string from macro sliders: "at least X calories", "at most Y protein", etc.
- Includes cuisine in query string if selected
- Filters results client-side by cuisine and calories < 150
- Does NOT use pagination (takes first 3 results)

---

### 2. Chat Typed Input (AIChat)
**File:** `app/components/AIChat.tsx`

**Function:** `sendMessage()` (line ~831)

**How it calls search:**
- Calls `/api/chat` endpoint via `fetch()`
- Request body: `{ message, limit, offset, userContext }`
- `/api/chat` then calls `searchHandler()` directly (not via `/api/search`)

**Request fields used:**
- `message`: String (user's typed message)
- `limit`: Number (default: 10, but chat route overrides to 5)
- `offset`: Number (default: 0)
- `userContext`: Object containing:
  - `search_distance_miles`: Number
  - `diet_type`: String (not used in search)
  - `dietary_options`: Array (not used in search)
  - `user_location_lat`: Number (optional)
  - `user_location_lng`: Number (optional)

**Notes:**
- Chat route extracts constraints from message via LLM router
- Chat route calls `searchHandler()` with: `query`, `calorieCap`, `minProtein`, `maxCarbs`, `maxFat`, `restaurant`, `location`, `limit: 5`, `offset: 0`, `searchKey: undefined`, `isPagination: false`, `userContext`
- Returns meals in response with `searchKey` for pagination

---

### 3. Load More Button (AIChat)
**File:** `app/components/AIChat.tsx`

**Function:** `loadMoreMeals()` (line ~1236)

**How it calls search:**
- Calls `/api/search` endpoint via `fetch()`
- Request body: `{ searchKey, offset, limit }`

**Request fields used:**
- `searchKey`: String (from previous search response)
- `offset`: Number (from previous search response's `nextOffset`)
- `limit`: Number (hardcoded: 5)

**Notes:**
- Used for pagination of meal results in chat
- Does NOT include query or constraints (they're embedded in `searchKey`)
- `/api/search` route handles this specially: `query: body.searchKey ? '' : body.message`

---

### 4. SearchScreen Component
**File:** `app/components/SearchScreen.tsx`

**Function:** `handleSearch()` (line ~62)

**How it calls search:**
- Calls `/api/search` endpoint via `fetch()`
- Request body: `{ query }`

**Request fields used:**
- `query`: String (user's search input)

**Notes:**
- Simple text search interface
- No pagination support
- No constraints or filters

---

### 5. Chat Route (Internal)
**File:** `app/api/chat/route.ts`

**Function:** POST handler (line ~129), MEAL_SEARCH path (line ~270)

**How it calls search:**
- Calls `searchHandler()` directly (not via `/api/search` endpoint)
- Builds `SearchParams` object inline

**Request fields used:**
- `query`: String (from `message` parameter)
- `calorieCap`: Number (from `routerResult.constraints?.calorieCap`)
- `minProtein`: Number (from `routerResult.constraints?.minProtein`)
- `maxCarbs`: Number (from `routerResult.constraints?.maxCarbs`)
- `maxFat`: Number (from `routerResult.constraints?.maxFat`)
- `restaurant`: String (from `routerResult.constraints?.restaurant`)
- `location`: String (from `routerResult.constraints?.nearMe ? 'near me' : undefined`)
- `limit`: Number (hardcoded: 5)
- `offset`: Number (hardcoded: 0)
- `searchKey`: undefined (let searchHandler generate it)
- `isPagination`: false
- `userContext`: Object (from request body)

**Notes:**
- Extracts constraints from user message via LLM router (`generateObject`)
- Direct call to `searchHandler()` - bypasses `/api/search` route
- Returns response with `mode: 'meals'` wrapper

---

### 6. Search Route (API Endpoint)
**File:** `app/api/search/route.ts`

**Function:** POST handler (line ~5)

**How it calls search:**
- Calls `searchHandler()` directly
- Spreads request body: `{ ...body }`
- Special handling: `query: body.searchKey ? '' : body.message`

**Request fields used:**
- Accepts any fields from request body
- Special logic: If `searchKey` exists, sets `query` to empty string
- Sets `isPagination: !!body.searchKey`

**Notes:**
- Used by Load More button and potentially other clients
- Very permissive - accepts any fields
- No validation or normalization of request fields

---

## Summary of Request Field Usage

### Common Fields
- `query`: Used by Quick Picks, SearchScreen, Chat Route
- `limit`: Used by Chat Route (5), Load More (5), Chat Input (10, but overridden)
- `offset`: Used by Chat Route (0), Load More (from response)
- `searchKey`: Used by Load More, generated by Chat Route

### Constraint Fields
- `calorieCap`: Extracted by Chat Route, not used by Quick Picks or SearchScreen
- `minProtein`: Extracted by Chat Route, not used by Quick Picks or SearchScreen
- `maxCarbs`: Extracted by Chat Route, not used by Quick Picks or SearchScreen
- `maxFat`: Extracted by Chat Route, not used by Quick Picks or SearchScreen
- `restaurant`: Extracted by Chat Route, not used by Quick Picks or SearchScreen

### Location Fields
- `radius_miles`: Used by Quick Picks (HomeScreen)
- `user_location_lat`: Used by Quick Picks, Chat Input
- `user_location_lng`: Used by Quick Picks, Chat Input
- `location`: Used by Chat Route (string: 'near me')

### Other Fields
- `isPagination`: Set by Search Route, Chat Route
- `userContext`: Used by Chat Route

---

## Issues Identified

1. **Inconsistent field names**: 
   - Quick Picks uses `radius_miles`, Chat Route uses `location: 'near me'`
   - Quick Picks uses `user_location_lat/lng`, Chat Route passes in `userContext`

2. **Duplicate logic**:
   - Chat Route builds SearchParams inline
   - Search Route spreads body without normalization
   - No shared function to build SearchParams

3. **Different entry points**:
   - Some call `/api/search` (Quick Picks, Load More, SearchScreen)
   - Some call `/api/chat` which calls `searchHandler` directly (Chat Input)
   - Some call `searchHandler` directly (Chat Route, Search Route)

4. **Inconsistent pagination**:
   - Quick Picks: No pagination, takes first 3
   - Chat Input: Uses pagination with `searchKey`
   - Load More: Uses `searchKey` + `offset`
   - SearchScreen: No pagination

5. **Constraint extraction**:
   - Quick Picks: Builds query string with constraints
   - Chat Route: Extracts constraints via LLM, passes as separate fields
   - SearchScreen: No constraints

---

## Recommended Refactoring

1. Create unified `buildSearchParams()` function that:
   - Accepts all possible input formats
   - Normalizes to `SearchParams` type
   - Handles location fields consistently
   - Handles constraint extraction consistently

2. All entry points should:
   - Call `buildSearchParams()` to normalize input
   - Call `searchHandler()` with same shape
   - Use consistent field names

3. Standardize on:
   - `query`: String (required for new searches)
   - `calorieCap`, `minProtein`, `maxCarbs`, `maxFat`: Numbers (optional)
   - `restaurant`: String (optional)
   - `limit`: Number (default: 5)
   - `offset`: Number (default: 0)
   - `searchKey`: String (optional, for pagination)
   - `userContext`: Object (optional, contains location fields)

