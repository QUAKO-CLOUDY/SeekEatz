# Home Feed Bug Fix Summary

## Root Causes

1. **Macro Display Showing 0**: 
   - HomeScreen's `convertToMeal` function was reading from wrong fields (`item.protein_g`, `item.carbs_g`) but API returns normalized fields (`item.protein`, `item.carbs`, `item.fats`)
   - No macro normalization utility existed to handle different input formats consistently

2. **Filter Constraints Not Enforced**:
   - HomeScreen was building text queries like "at most 600 calories" but NOT passing explicit numeric constraints to the API
   - `searchHandler` only supported max constraints (calorieCap, maxCarbs, maxFat) but not min constraints or above/below direction support
   - Filtering was relying on text query parsing which is unreliable

3. **Inconsistent Macro Shape**:
   - Different parts of codebase expected different field names (fat vs fats, protein vs protein_g)
   - No shared type definition or normalization function

## Files Changed

### New Files
- `lib/macro-utils.ts` - Shared macro normalization utility with types, validation, and constraint checking
- `lib/__tests__/macro-utils.test.ts` - Unit tests for macro normalization
- `HOME_FEED_FIX_SUMMARY.md` - This summary document

### Modified Files
- `app/types.ts` - Added `Macros` type import and optional `macros` field to `Meal` type
- `app/components/HomeScreen.tsx`:
  - Updated `convertToMeal` to use `normalizeMacros` and read from correct API fields
  - Modified `searchMeals` to accept and pass explicit numeric constraints
  - Updated `handleFindMeals` and `handleFindMoreMeals` to convert above/below directions to min/max constraints
- `app/api/search/handler.ts`:
  - Extended `SearchParams` interface to support min/max for all macros
  - Updated constraint normalization to handle min/max for calories, protein, carbs, fats
  - Modified macro filtering logic to enforce both min (>=) and max (<=) constraints
  - Added runtime assertions in development mode to catch constraint violations
  - Updated searchKey encoding/decoding to support new min/max structure
- `app/api/search/build-params.ts`:
  - Extended `SearchInput` interface to support min/max constraints
  - Updated `buildSearchParams` to map input constraints correctly

## How Filtering Works Now

### Server-Side Filtering (Preferred)
1. **HomeScreen** converts user's above/below directions to explicit min/max constraints:
   - "below 600 calories" → `maxCalories: 600`
   - "above 30g protein" → `minProtein: 30`
   - "below 50g carbs" → `maxCarbs: 50`
   - "below 20g fats" → `maxFats: 20`

2. **API Route** (`/api/search`) receives explicit constraints in request body:
   ```json
   {
     "query": "at most 600 calories at most 30g protein...",
     "maxCalories": 600,
     "maxProtein": 30,
     "maxCarbs": 50,
     "maxFats": 20
   }
   ```

3. **searchHandler** applies strict filtering:
   - Normalizes all items from DB (discards items with missing/invalid macros)
   - Filters items using numeric comparisons:
     - `item.calories <= maxCalories` (if maxCalories defined)
     - `item.calories >= minCalories` (if minCalories defined)
     - Same for protein, carbs, fats
   - NO tolerance/rounding (strict enforcement)
   - Runtime assertion in development mode validates all returned items satisfy constraints

4. **Client-Side** receives pre-filtered meals that are guaranteed to satisfy constraints

### Client-Side Fallback
- Cuisine filtering is still done client-side (text matching)
- Additional filtering for very low calorie items (< 150 cal) to exclude ingredients

## How Macro Normalization Works Now

### Single Source of Truth
- `lib/macro-utils.ts` provides `normalizeMacros()` function
- Handles multiple input formats:
  - JSON objects from DB (`macros` JSONB column)
  - Stringified JSON
  - Different key names (fat vs fats, protein_g vs protein)
  - Missing keys (returns null if required fields missing)

### Normalized Shape
All macros are consistently represented as:
```typescript
{
  calories: number;  // Required, must be > 0
  protein: number;   // Required, must be >= 0
  carbs: number;     // Required, must be >= 0
  fats: number;      // Required, must be >= 0 (prefer "fats" plural)
}
```

### Usage
- **API**: `normalizeMeal()` in `searchHandler` uses `normalizeMacros()` internally
- **Client**: `convertToMeal()` in `HomeScreen` uses `normalizeMacros()` to handle API response
- **Validation**: `satisfiesMacroConstraints()` checks if meal meets filter requirements
- **Assertions**: `assertMealsSatisfyConstraints()` throws in development if constraints violated

## Testing

### Unit Tests
- `lib/__tests__/macro-utils.test.ts` covers:
  - Normalization of valid/invalid inputs
  - Handling of different key names (fat vs fats)
  - Rejection of invalid data (0 calories, missing macros)
  - Constraint satisfaction logic

### Runtime Assertions
- In development mode, `searchHandler` validates all returned meals satisfy constraints
- Throws error if any meal violates constraints (catches regressions early)

## Acceptance Criteria Met

✅ **Home feed never shows meals outside selected min/max constraints**
- Server-side filtering enforces constraints strictly
- Runtime assertions validate in development

✅ **Meal cards show real protein/carbs values (not 0)**
- `convertToMeal` now reads from correct API fields
- `normalizeMacros` handles different input formats

✅ **Macros consistently represented as {calories, protein, carbs, fats}**
- Shared `Macros` type defined
- `normalizeMacros` ensures consistent shape
- All code paths use normalized format

✅ **No changes to ingestion pipeline**
- Only read paths modified, no DB schema changes
- Existing `menu_items.macros` JSONB column used as-is

## Future Improvements

1. **Extract constraints from text query**: Could parse "at most 600 calories" from query string to extract constraints automatically
2. **Client-side validation**: Add constraint checking in HomeScreen before displaying meals (defense in depth)
3. **Better error messages**: If no meals match constraints, suggest relaxing filters
4. **Performance**: Consider adding DB indexes on macros JSONB fields for faster filtering

