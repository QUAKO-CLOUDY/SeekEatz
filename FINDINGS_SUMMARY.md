# Codebase Scan Findings Summary

## 1. Calorie Target Storage

**Database Table:** `profiles` (Supabase)
- **Fields:**
  - `target_calories` / `calorie_goal` (need to verify exact mapping)
  - `target_protein_g` / `protein_goal`
  - `target_carbs_g` / `carb_limit`
  - `target_fats_g` / `fat_limit`

**Files:**
- Schema: `supabase_profiles_table.sql` (lines 34-38 show `calorie_goal`, `protein_goal`, etc.)
- Type Definition: `app/types.ts` (lines 6-9 use `target_calories`, `target_protein_g`, etc.)
- Storage: Also cached in localStorage as `userProfile` object

**Notes:**
- There may be a field name mismatch between database (`calorie_goal`) and TypeScript (`target_calories`)
- Need to verify which names are actually used in database queries

---

## 2. Meal Logging to Database

**Current Status:** ❌ **NOT PERSISTED TO DATABASE**

**Current Implementation:**
- **Location:** React state only (`app/components/MainApp.tsx` line 74)
- **Handler:** `handleLogMeal` function (lines 632-644)
- **Storage:** In-memory state, lost on page refresh

**LoggedMeal Structure:**
```typescript
{
  id: string,              // `log-${Date.now()}-${Math.random()}`
  meal: Meal,              // Full meal object (name, restaurant, calories, etc.)
  timestamp: string,       // ISO string: `new Date().toISOString()`
  date: string            // YYYY-MM-DD: `timestamp.split('T')[0]`
}
```

**Key Code Locations:**
- **Log Handler:** `app/components/MainApp.tsx:632`
- **Type Definition:** `app/components/LogScreen.tsx:21-26`

**Notes:**
- No database table currently used for logged meals
- No localStorage persistence
- Date field is derived from timestamp

---

## 3. Calories Remaining Computation

**Location:** `app/components/LogScreen.tsx`

**Computation (lines 84-107):**
```typescript
// Filter meals for selected date
const selectedMeals = loggedMeals.filter(log => log.date === selectedDate);

// Sum totals
const totals = selectedMeals.reduce((acc, log) => ({
  calories: acc.calories + log.meal.calories,
  protein: acc.protein + log.meal.protein,
  carbs: acc.carbs + log.meal.carbs,
  fats: acc.fats + log.meal.fats,
}), { calories: 0, protein: 0, carbs: 0, fats: 0 });

// Calculate remaining
const remaining = {
  calories: target_calories - totals.calories,
  protein: target_protein_g - totals.protein,
  carbs: target_carbs_g - totals.carbs,
  fats: target_fats_g - totals.fats,
};
```

**Display Location:**
- Center of circular progress rings (lines 299-309)
- Shows "Remaining" or "Over" with calorie count

**Update Behavior:**
- Reactive: Updates when `loggedMeals` or `selectedDate` changes
- Computed on every render (useMemo could optimize)

**Formula:**
```
remaining = target - totals (where totals = sum of all meals for selected date)
```

---

## 4. Smart Swaps Implementation

**API Route:** `app/api/swaps/route.ts`

**Endpoint:** `POST /api/swaps`

**Current Response Format (lines 116-135):**
```typescript
{
  modifications: Array<{
    id, label, expectedEffect, estimatedDelta,
    confidenceLabel, type, details, deltaMacros
  }>,
  alternatives: Array<{
    id, name, restaurant, calories, protein, carbs, fats
  }>
}
```

**UI Integration:**
- **Fetch Location:** `app/components/MealDetail.tsx` useEffect (lines 142-238)
- **Display:** Shown in log confirmation modal
- **Selection:** User can select multiple swaps, deltas are summed

**Current API Parameters:**
- `restaurant_name`, `meal_id`, `meal_name`, `meal_macros`
- `calorieCap`, `minProtein`, `maxCarbs`, `maxFat`
- `user_goals`

**Missing:**
- `todayConsumed` (today's already consumed calories)
- `caloriesRemaining` (target - todayConsumed)

---

## Key Gaps Identified

1. **LoggedMeals Not Persisted**
   - ❌ No localStorage persistence
   - ❌ No database storage
   - ⚠️ Data lost on page refresh

2. **Swaps Don't Know Today's Consumption**
   - ❌ API doesn't receive `todayConsumed`
   - ❌ Can't optimize swaps based on remaining calories

3. **Modified Meal Macros Not Passed to Log Handler**
   - ⚠️ `handleConfirmLog` calculates `finalMacros` but doesn't pass them
   - ⚠️ `onLogMeal()` called without modified meal data
   - ⚠️ Base meal is logged instead of meal with swaps applied

4. **No Immediate Update Verification**
   - ✅ Should work (reactive state), but needs testing

---

## Proposed Solution Summary

See `CALORIE_REMAINING_PLAN.md` for detailed implementation plan.

**Core Changes:**
1. Add localStorage persistence for `loggedMeals`
2. Pass `todayConsumed` and `caloriesRemaining` to swaps API
3. Pass modified meal (with swaps applied) to `handleLogMeal`
4. Verify immediate updates (should already work)

**No New Tables Needed:**
- Use existing `profiles` table for targets
- Use localStorage for loggedMeals (can migrate to DB later if needed)

