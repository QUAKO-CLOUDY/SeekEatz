# Swap Compatibility Fix Summary

## Overview
Fixed swap recommendations to prevent incompatible ingredient suggestions (e.g., "add shrimp" to a burger). Swaps now use a compatibility matrix to ensure ingredients are appropriate for the dish type.

## Root Cause
- Swaps were suggesting any protein add-on without checking if it was compatible with the base meal
- No dish type classification or ingredient type tagging
- No compatibility filtering before scoring protein swaps

## Files Created

### 1. `utils/dish-compatibility.ts` (NEW)
**Purpose**: Dish type classification, ingredient type tagging, and compatibility matrix

**Key Functions**:

**`inferDishType(mealName: string): DishType`**
- Deterministic keyword-based classification
- Returns: `burger`, `sub`, `salad`, `bowl`, `taco`, `pizza`, `wrap`, `pasta`, `breakfast`, `generic`
- Examples:
  - burger: `/burger|cheeseburger|hamburger|slider|whopper|big mac/i`
  - sub: `/sub|sandwich|hoagie|hero|grinder/i`
  - salad: `/salad|caesar|cobb|garden salad/i`
  - etc.

**`inferIngredientType(name: string): { type: IngredientType; confidence: number }`**
- Deterministic keyword-based ingredient classification
- Returns type and confidence (0-1)
- Ingredient types: `patty`, `bacon`, `cheese`, `egg`, `chicken`, `steak`, `shrimp`, `tofu`, `ham`, `turkey`, `pork`, `beef`, `sauce`, `bun`, `lettuce_wrap`, `tortilla`, `bread`, `rice`, `beans`, `vegetable`, `unknown`
- Examples:
  - patty: `/patty|patties|beef patty|burger patty/i` (confidence: 0.9)
  - shrimp: `/shrimp|prawns|shrimps/i` (confidence: 0.95)
  - etc.

**`COMPATIBILITY_MATRIX: Record<DishType, Set<IngredientType>>`**
- Defines which ingredient types are allowed for each dish type
- Examples:
  - `burger`: patty, bacon, cheese, egg, sauce, bun, lettuce_wrap, vegetable
  - `salad`: chicken, steak, shrimp, tofu, egg, cheese, sauce, vegetable
  - `sub`: turkey, ham, chicken, steak, bacon, cheese, sauce, bread, lettuce_wrap, vegetable
  - `taco`: chicken, steak, pork, beef, shrimp, tofu, beans, cheese, sauce, tortilla, lettuce_wrap, vegetable
  - `generic`: cheese, sauce, vegetable (conservative)

**`isCompatible(dishType: DishType, ingredientType: IngredientType): boolean`**
- Checks if an ingredient type is compatible with a dish type

**`extractProteinKeywords(text: string): Set<string>`**
- Extracts protein keywords (beef, chicken, turkey, steak, ham, pork, shrimp, tofu, patty) from text

**`hasProteinTokenOverlap(mealName: string, modifierName: string): boolean`**
- Checks if meal name and modifier name share protein keywords
- Used as fallback compatibility check

## Files Modified

### 1. `utils/swap-rule-engine.ts`

**Changes**:

**Line ~8-10**: Added imports
```typescript
import {
  inferDishType,
  inferIngredientType,
  isCompatible,
  hasProteinTokenOverlap,
  type DishType,
} from './dish-compatibility';
```

**Lines ~90-154**: Updated `generateHigherProteinSwap()` function
- Added `mealName` parameter
- Step 1: Determines dish type using `inferDishType(mealName)`
- Step 2: Finds protein candidates (unchanged)
- Step 3: Applies compatibility filter:
  - For each candidate, infers ingredient type
  - Checks compatibility using `isCompatible(dishType, ingredientType)`
  - Fallback: token overlap check (if confidence >= 0.7 and shares protein keywords)
  - Special case: rejects shrimp/fish/tuna for burgers even with token overlap
- Step 4: Logs rejected candidates in dev
- Step 5: Uses only compatible candidates for scoring
- Dev assertion: throws error if burger swap includes shrimp/fish/tuna

**Lines ~240-280**: Updated `generateSwapModifications()` function
- Passes `mealName` to `generateHigherProteinSwap()`
- Logs dish type in dev diagnostics
- Dev assertion: checks all swaps for burger to ensure no shrimp/fish/tuna

## Key Features

### 1. Dish Type Classification
- Deterministic keyword-based classification
- No LLM required
- Handles common dish types: burger, sub, salad, bowl, taco, pizza, wrap, pasta, breakfast, generic

### 2. Ingredient Type Tagging
- Deterministic keyword-based tagging
- Returns type and confidence score
- Handles common ingredient types: patty, bacon, cheese, egg, chicken, steak, shrimp, tofu, ham, turkey, pork, beef, sauce, bun, lettuce_wrap, tortilla, bread, rice, beans, vegetable, unknown

### 3. Compatibility Matrix
- Defines allowed ingredient types for each dish type
- Prevents weird swaps (e.g., shrimp on burger)
- Conservative for generic dish type

### 4. Token Overlap Fallback
- If ingredient type not in compatibility matrix, checks token overlap
- Only allows if meal name and modifier share protein keywords
- Still rejects shrimp/fish/tuna for burgers

### 5. Dev Assertions
- Throws error if burger swap includes shrimp/fish/tuna
- Logs rejected candidates with reasons
- Logs dish type and compatibility info

## Acceptance Tests

✅ **Meal: "Cheeseburger"** → Protein swap suggests extra patty/bacon/cheese (if exists), never shrimp
- `dishType = 'burger'`
- Compatible ingredients: patty, bacon, cheese, egg, sauce
- Shrimp rejected (not in compatibility matrix)
- Dev assertion ensures no shrimp in swaps

✅ **Meal: "Shrimp salad"** → Shrimp can be suggested (if exists), chicken/steak also possible
- `dishType = 'salad'`
- Compatible ingredients: chicken, steak, shrimp, tofu, egg, cheese, sauce, vegetable
- Shrimp allowed (in compatibility matrix)

✅ **Meal: "Turkey sub"** → Suggests extra turkey/extra meat/cheese, not patty
- `dishType = 'sub'`
- Compatible ingredients: turkey, ham, chicken, steak, bacon, cheese, sauce, bread, lettuce_wrap, vegetable
- Patty rejected (not in compatibility matrix)

✅ **Swaps always reference DB modifierItemIds and use DB macros as delta**
- All swaps still DB-backed (unchanged)
- Deltas computed from DB macros (unchanged)

## Diagnostics

**Logging Added**:
- `[swap-rule-engine] Rejected protein candidates`: mealName, dishType, rejected candidates with reasons
- `[swap-rule-engine] Generated swaps`: mealName, dishType, restaurantName, modifierCandidatesCount, proteinSwap, calorieSwap, finalModsCount
- `[swap-rule-engine] CRITICAL: Burger swap includes shrimp/fish!`: error if burger swap includes shrimp

**Dev Assertions**:
- Throws error if burger swap includes shrimp/fish/tuna
- Logs rejected candidates with reasons
- Ensures compatibility filtering is working

## Files Changed Summary

1. **NEW**: `utils/dish-compatibility.ts` - Dish type classification, ingredient type tagging, compatibility matrix
2. **MODIFIED**: `utils/swap-rule-engine.ts` - Added compatibility filtering to protein swap generation
3. **NEW**: `SWAP_COMPATIBILITY_FIX_SUMMARY.md` - This documentation



