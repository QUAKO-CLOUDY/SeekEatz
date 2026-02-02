# AI Meal Search System - MVP v1 Specification

## Overview

This document defines the hard rules and requirements for the MVP v1 meal search system. All meal search functionality must strictly adhere to these rules.

---

## Core Principles

### 1. DB-Only Truth: No Hallucinations

**Rule:** Never invent meals or restaurants. All meal cards must come from Supabase results only.

- **Implementation:** All meal results must be fetched from the `menu_items` table in Supabase
- **Validation:** Every meal card must have a valid `id` that exists in the database
- **Error Handling:** If no results are found, return an honest message and 0 cards (no placeholder or invented meals)
- **Strict Enforcement:** Reject any code paths that generate or suggest meals not present in database results

**Example:**
- ✅ Query: "healthy chicken bowl" → Returns only meals from Supabase that match
- ❌ Query: "healthy chicken bowl" → Must NOT return invented meals if database has 0 results

---

## Location & Distance Filtering

### 2. Location Filtering Disabled for MVP

**Rule:** Ignore distance and do not request location permission. Any "near me" language returns a friendly "coming soon" message but still performs a normal search.

- **Location Permission:** Do not request or use browser location APIs
- **Distance Calculations:** Disabled - do not calculate or filter by distance
- **"Near Me" Queries:** 
  - Detect phrases like "near me", "nearby", "close to me", "in my area"
  - Return friendly message: "Location-based search is coming soon! Here are some great options:"
  - Still perform the search without location filtering
- **Geographic Filters:** Ignore any location-based constraints in queries

**Example:**
- Query: "burgers near me" → Message: "Location-based search is coming soon! Here are some great options:" + normal burger search results
- Query: "pizza in San Francisco" → Treat as "pizza" (ignore location part, no filtering)

---

## Dish Type Filtering

### 3. Strict DishType Filtering

**Rule:** DishType filtering is strict when explicitly requested (burger/bowl/sandwich/burrito/etc.) and is determined primarily from the meal name, not category.

- **Detection:** Extract dish type from query using keyword matching (e.g., "burger", "bowl", "sandwich", "burrito")
- **Filtering Logic:** When dish type is detected:
  - Filter results to only include meals where the **name** contains the dish type keyword
  - Do NOT rely on category field for dish type determination
  - Use word boundary matching to avoid partial matches
- **Strict Application:** If dish type is explicitly requested and 0 results match, return honest message

**Supported Dish Types:**
- burgers, sandwiches, bowls, salads, wraps, tacos, burritos, pizza, sushi, breakfast

**Examples:**
- Query: "burritos" → Includes "Breakfast Burrito", "Chicken Burrito", "Bean Burrito" (name contains "burrito")
- Query: "burgers" → Includes "Cheeseburger", "Bacon Burger", "Impossible Burger" (name contains "burger")
- Query: "bowls" → Includes "Power Bowl", "Grain Bowl", "Protein Bowl" (name contains "bowl")
- Query: "breakfast burritos" → Includes "Breakfast Burrito" (name contains "burrito" AND "breakfast")

**Important:** Breakfast burritos should be included when searching for "burritos" because the name contains "burrito", even if it also contains "breakfast".

---

## Meal Time Filtering

### 4. No Time Assumptions (24/7 Availability)

**Rule:** Meal time is not assumed (everything is 24/7). Only apply breakfast filtering if user explicitly says "breakfast".

- **Default Behavior:** All meals are available 24/7 - no time-based filtering
- **Breakfast Filtering:** Only apply if query explicitly contains "breakfast" keyword
- **No Time Inference:** Do not infer meal times from dish types (e.g., "pancakes" does not imply breakfast filtering unless "breakfast" is mentioned)
- **Explicit Only:** Time-based filtering requires explicit user request

**Examples:**
- Query: "pancakes" → Returns all pancakes (no breakfast filter applied)
- Query: "breakfast pancakes" → Returns pancakes (breakfast keyword detected, but filtering is name-based, not time-based)
- Query: "breakfast" → Returns meals with "breakfast" in name
- Query: "lunch options" → Returns all options (no time filtering, "lunch" is treated as descriptive text)

---

## Macro Filtering

### 5. Explicit Macro Filters Only

**Rule:** Macro filters apply only if explicitly requested.

- **Explicit Request Required:** Only apply calorie, protein, carbs, or fat filters if user explicitly mentions them
- **Supported Patterns:**
  - Calories: "under 700 calories", "below 500 cal", "less than 600 calories", "max 800 calories"
  - Protein: "at least 30g protein", "over 40g protein", "minimum 25 protein", "high protein"
  - Carbs: "under 50g carbs", "below 30g carbs", "max 40 carbs", "low carb"
  - Fat: "under 20g fat", "below 15g fat", "max 25 fat", "low fat"
- **No Assumptions:** Do not infer macro constraints from general terms like "healthy" or "light"
- **Strict Application:** When macro filters are applied, use exact numeric comparisons from `macros` JSONB column

**Examples:**
- Query: "healthy meals" → No macro filtering (general term, not explicit)
- Query: "meals under 500 calories" → Apply calorie filter: `calories <= 500`
- Query: "high protein burgers" → Apply protein filter (need to define threshold, e.g., `protein >= 30g`)
- Query: "low carb options" → Apply carb filter (need to define threshold, e.g., `carbs <= 30g`)

---

## Pagination

### 6. Deterministic Pagination

**Rule:** Return up to 5 meals per response, deterministic pagination via searchKey + offset.

- **Page Size:** Maximum 5 meals per response
- **Deterministic Results:** 
  - Generate a `searchKey` from normalized query + constraints + dish type + restaurant
  - Use `searchKey` + `offset` for pagination
  - Same `searchKey` + `offset` must always return the same results
- **Pagination Flow:**
  1. First request: `offset=0`, returns first 5 meals + `searchKey` + `hasMore` flag
  2. Subsequent requests: Use same `searchKey` with `offset=5`, `offset=10`, etc.
  3. Continue until `hasMore=false`
- **Stability:** Results must be stable and reproducible (no random shuffling between requests)

**Response Format:**
```json
{
  "meals": [...], // Up to 5 meals
  "hasMore": true,
  "nextOffset": 5,
  "searchKey": "base64-encoded-search-key"
}
```

---

## Zero Results Handling

### 7. Honest Zero Results

**Rule:** If 0 meals match, return an honest message and 0 cards (no hallucinations).

- **No Placeholders:** Never return invented or placeholder meals
- **Honest Messages:** Return clear, helpful messages when no results are found
- **Empty Array:** Always return `meals: []` when no matches
- **Context-Aware Messages:** Messages should reflect what was searched (e.g., "No burgers match your request yet.")

**Example Messages:**
- General: "No meals match your request yet."
- With dish type: "No burgers match your request yet."
- With constraints: "No meals under 500 calories match your request yet."

**Response Format (Zero Results):**
```json
{
  "meals": [],
  "hasMore": false,
  "nextOffset": 0,
  "searchKey": "...",
  "message": "No [dish type] match your request yet."
}
```

---

## Implementation Checklist

### Search Handler Requirements

- [ ] All results fetched from Supabase `menu_items` table only
- [ ] No location permission requests
- [ ] "Near me" queries return friendly message + normal search
- [ ] Dish type filtering uses name-based keyword matching
- [ ] Breakfast filtering only when "breakfast" explicitly mentioned
- [ ] Macro filters only when explicitly requested with numbers
- [ ] Deterministic `searchKey` generation from query + constraints
- [ ] Pagination via `searchKey` + `offset` (max 5 per page)
- [ ] Zero results return empty array + honest message
- [ ] No meal invention or hallucination

### Validation Rules

- [ ] Every meal has valid `id` from database
- [ ] Every meal has valid `macros` JSONB with calories, protein, carbs, fat
- [ ] Dish type filtering checks meal name (not category)
- [ ] Breakfast burritos included in "burritos" search (name contains "burrito")
- [ ] Pagination results are deterministic and stable

---

## Examples

### Example 1: Basic Search
**Query:** "burritos"

**Behavior:**
- Search for meals where name contains "burrito" (case-insensitive, word boundary)
- Includes: "Breakfast Burrito", "Chicken Burrito", "Bean Burrito"
- Returns up to 5 results
- If 0 results: `{ meals: [], message: "No burritos match your request yet." }`

### Example 2: Macro Filtering
**Query:** "burgers under 700 calories"

**Behavior:**
- Extract dish type: "burgers"
- Extract macro constraint: `calories <= 700`
- Filter meals where name contains "burger" AND calories <= 700
- Returns up to 5 results
- If 0 results: `{ meals: [], message: "No burgers match your request yet." }`

### Example 3: Location Query
**Query:** "pizza near me"

**Behavior:**
- Detect "near me" → Show message: "Location-based search is coming soon! Here are some great options:"
- Perform normal "pizza" search (ignore location)
- Filter meals where name contains "pizza"
- Returns up to 5 results

### Example 4: Breakfast Explicit
**Query:** "breakfast"

**Behavior:**
- Extract dish type: "breakfast"
- Filter meals where name contains "breakfast"
- Returns up to 5 results
- Includes: "Breakfast Burrito", "Breakfast Bowl", "Breakfast Sandwich"

### Example 5: Zero Results
**Query:** "vegan sushi under 200 calories"

**Behavior:**
- If 0 meals match all constraints
- Return: `{ meals: [], hasMore: false, message: "No meals match your request yet." }`
- Do NOT invent or suggest meals

---

## Notes

- This spec defines MVP v1 behavior only
- Future versions may add location filtering, time-based availability, and other features
- All changes must maintain backward compatibility with this spec
- Violations of these rules are considered bugs and must be fixed immediately

