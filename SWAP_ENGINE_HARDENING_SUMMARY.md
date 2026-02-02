# Swap Engine Hardening Summary

## Overview
Hardened `/app/api/swaps/route.ts` and `swap-rule-engine.ts` so that swap recommendations are ONLY based on single-ingredient (modifier) rows that exist in `menu_items` for the same restaurant.

## Root Cause
- `generateSwapModifications` returned swaps with hardcoded deltas that weren't guaranteed to exist as DB items
- Deltas were "made up" rather than computed from real DB macros
- No validation that modifier items actually existed

## Files Created

### 1. `utils/modifier-candidates.ts` (NEW)
**Purpose**: Fetches modifier candidates from DB for a specific restaurant

**Key Function**:
- `getModifierCandidates(supabase, restaurant_name)`: Returns array of `ModifierCandidate[]`
  - Filters by same restaurant only
  - Calories must be in modifier range: 0 < calories <= 400
  - Excludes "full meals" heuristically (calories >= 450 AND all macros non-trivial)
  - Prefers category keywords: modifier, ingredient, add, topping, protein, side, sauce, extra
  - Returns normalized objects with `{ id, name, category, macros: Macros }`

**Filtering Logic**:
- Must have valid macros (normalized using `normalizeMacros`)
- Calories: 0 < calories <= 400
- Exclude if calories >= 450 AND (protein >= 15 OR carbs >= 20 OR fats >= 10) → likely a meal
- Include if has preferred category keyword OR calories < 200

### 2. `SWAP_ENGINE_HARDENING_SUMMARY.md` (NEW)
This documentation file

## Files Modified

### 1. `utils/swap-rule-engine.ts`

**Changes**:

**Line ~8-9**: Added imports
```typescript
import { normalizeMacros, type Macros } from '@/lib/macro-utils';
import type { ModifierCandidate } from './modifier-candidates';
```

**Lines ~14-29**: Updated `SwapModification` interface
- `estimatedDelta` is now required (not optional)
- `modifierItemIds` is now required (not optional)
- Added `higherProtein` and `lowerCalories` to `swapType` enum

**Lines ~84**: Removed all old dish-type-specific functions (generateBurgerModifications, etc.)

**Lines ~86-150**: Added `generateHigherProteinSwap()`
- Finds protein add-on candidates matching pattern: `/patty|chicken|steak|turkey|ham|egg|tofu|shrimp|protein|beef|pork/i`
- Scores by protein/calories ratio (protein efficiency)
- Caps calories add <= 400
- Returns swap with:
  - `type: 'add'`
  - `swapType: 'higherProtein'`
  - `modifierItemIds: [candidate.id]`
  - `estimatedDelta` from candidate.macros

**Lines ~152-230**: Added `generateLowerCaloriesSwap()`
- Finds bun/tortilla/wrap candidates: `/bun|bread|roll|tortilla|wrap|bagel|croissant/i`
- Finds lettuce wrap candidates: `/lettuce wrap|lettuce|wrap lettuce|greens wrap/i`
- Prefers replace: bun -> lettuce wrap (requires both candidates)
  - Delta = lettuceWrap.macros - bun.macros
  - `modifierItemIds: [bun.id, lettuceWrap.id]`
- Fallback: remove bun (if bun candidate exists)
  - Delta = -bun.macros
  - `modifierItemIds: [bun.id]`
- Only proposes if candidates exist in DB

**Lines ~232-280**: Updated `generateSwapModifications()` to be async and DB-backed
- Signature: `async generateSwapModifications(mealName, mealMacros, goals, restaurantName, modifierCandidates)`
- Returns at most 2 modifications:
  1. Higher protein swap (if `higherProtein` or `minProtein` set)
  2. Lower calories/carbs swap (if `lowerCalories` or `calorieCap` exceeded)
- Goal ordering:
  - If `minProtein` or `higherProtein` → attempt protein swap first
  - Always attempt lowerCalories if `calorieCap` exceeded OR user wants lower calories
  - If both exist, return two
- Returns empty array if no modifier candidates available

**Logging**:
- Dev logs: restaurantName, modifierCandidatesCount, chosen candidates, final mods count

### 2. `app/api/swaps/route.ts`

**Changes**:

**Line ~4**: Added import
```typescript
import { getModifierCandidates } from '@/utils/modifier-candidates';
```

**Lines ~36-46**: Fetch modifier candidates before generating swaps
```typescript
const modifierCandidates = await getModifierCandidates(supabase, restaurant_name);
```

**Lines ~63-70**: Updated to call async `generateSwapModifications`
```typescript
const modifications = await generateSwapModifications(
  meal_name,
  meal_macros || {},
  macroGoals,
  restaurant_name,
  modifierCandidates
);
```

**Lines ~72-106**: Added validation (dev-only assertion)
- Validates all modifications have `modifierItemIds`
- Validates all `modifierItemIds` exist in candidate list
- Validates `deltaMacros` are all numbers (no NaN)
- Throws error in dev if validation fails

**Lines ~175-203**: Updated response mapping
- `estimatedDelta` is required (no optional chaining)
- `modifierItemIds` is required (no fallback to empty array)
- Added final validation filter (production-safe)
- Filters out invalid modifications before returning

## Key Features

### 1. DB-Backed Only
- All swaps reference real `menu_items` rows via `modifierItemIds`
- Deltas computed from actual DB macros (not hardcoded)
- Validates all `modifierItemIds` exist in candidate list

### 2. Two Primary Swap Generators
- **Higher Protein**: Finds best protein add-on by protein/calories ratio
- **Lower Calories/Carbs**: Prefers bun -> lettuce wrap replace, fallback to bun remove

### 3. Strict Validation
- Route-level validation ensures all swaps are DB-backed
- Dev assertions catch regressions early
- Production-safe filtering removes invalid swaps

### 4. Goal Ordering
- Protein swaps prioritized if `minProtein` or `higherProtein` set
- Lower calories swaps always attempted if `calorieCap` exceeded
- Returns at most 2 swaps (one protein, one calorie reduction)

## Acceptance Tests

✅ **Burger meal at restaurant with "patty" modifier row**
- Returns modification: "Add extra patty"
- `modifierItemIds` contains patty modifier ID
- `estimatedDelta.protein` = patty.macros.protein (from DB)
- `estimatedDelta.calories` = patty.macros.calories (from DB)

✅ **Meal with bun row + lettuce wrap row**
- Returns modification: "Swap bun for lettuce wrap"
- `modifierItemIds` contains [bun.id, lettuceWrap.id]
- `estimatedDelta` = lettuceWrap.macros - bun.macros (from DB)

✅ **Unknown restaurant modifiers**
- Returns empty modifications array
- Alternatives may trigger if enabled (fallback)

✅ **Never returns swaps referencing ingredients not in DB**
- All `modifierItemIds` validated against candidate list
- Dev assertion throws if invalid IDs found

## Diagnostics

**Logging Added**:
- `[modifierCandidates] Found N modifier candidates for {restaurant_name}`
- `[swaps] Modifier candidates`: restaurant_name, count, sampleNames
- `[swap-rule-engine] Generated swaps`: restaurantName, modifierCandidatesCount, proteinSwap, calorieSwap, finalModsCount
- `[swaps] Modification missing modifierItemIds`: warns if validation fails
- `[swaps] Modification has invalid modifierItemIds`: warns if IDs don't exist
- `[swaps] Modification has NaN in deltaMacros`: warns if delta invalid

**Dev Assertions**:
- Route validates all modifications have valid `modifierItemIds` and non-NaN deltas
- Throws error in dev if any modification fails validation

## Type Safety

- `estimatedDelta` is required (not optional) in `SwapModification`
- `modifierItemIds` is required (not optional) in `SwapModification`
- `deltaMacros` uses consistent shape: `{ calories, protein, carbs, fats }`
- All macros normalized using `normalizeMacros` utility

## Files Changed Summary

1. **NEW**: `utils/modifier-candidates.ts` - Modifier candidate fetcher
2. **MODIFIED**: `utils/swap-rule-engine.ts` - Made async, DB-backed, removed hardcoded swaps
3. **MODIFIED**: `app/api/swaps/route.ts` - Fetches candidates, validates swaps, updated response format
4. **NEW**: `SWAP_ENGINE_HARDENING_SUMMARY.md` - This documentation



