# Plan: Wire Calorie Remaining with Smart Swaps Integration

## Current State Analysis

### 1. Calorie Target Storage
**Location:** `profiles` table (Supabase)
- **Fields:**
  - `target_calories` (or `calorie_goal` - verify mapping in codebase)
  - `target_protein_g` (or `protein_goal`)
  - `target_carbs_g` (or `carb_limit`)
  - `target_fats_g` (or `fat_limit`)
- **Also stored in:** localStorage as `userProfile` object
- **Type Definition:** `UserProfile` in `app/types.ts` (lines 3-15)

### 2. Meal Logging
**Current Implementation:**
- **Storage:** React state ONLY (`loggedMeals` in `MainApp.tsx` line 74)
- **NOT persisted** to database or localStorage
- **Handler:** `handleLogMeal` in `app/components/MainApp.tsx` (line 632-644)
- **Structure:**
  ```typescript
  {
    id: string,           // Generated: `log-${Date.now()}-${Math.random()}`
    meal: Meal,           // Full meal object
    timestamp: string,    // ISO string
    date: string          // YYYY-MM-DD format
  }
  ```
- **Date Field:** Extracted from `timestamp` using `.split('T')[0]`

### 3. Calories Remaining Computation
**Location:** `app/components/LogScreen.tsx`
- **Lines 84-92:** `totals` computed from `selectedMeals` (filtered by `selectedDate`)
- **Lines 102-107:** `remaining` computed as:
  ```typescript
  remaining.calories = target_calories - totals.calories
  ```
- **Display:** Lines 303-304 (center of circular progress rings)
- **Updates:** Only when `loggedMeals` or `selectedDate` changes (React reactive)

### 4. Smart Swaps Implementation
**API Route:** `app/api/swaps/route.ts`
- **Endpoint:** `POST /api/swaps`
- **Returns:** 
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
- **Fetch Location:** `app/components/MealDetail.tsx` useEffect (lines 142-238)
- **UI Render:** MealDetail component shows swaps in log modal

---

## Proposed Implementation Plan

### Phase 1: Ensure LoggedMeals Persistence (LocalStorage)
**Goal:** Persist loggedMeals to localStorage so they survive page refreshes

**Files to Modify:**
1. `app/components/MainApp.tsx`

**Changes:**
- Add useEffect to save `loggedMeals` to localStorage when it changes (similar to line 470-477 for userProfile)
- Add code in existing useEffect (line 103-172) to load `loggedMeals` from localStorage on mount
- Use key: `seekeatz_logged_meals`

**Implementation:**
```typescript
// Load loggedMeals from localStorage (add to existing useEffect around line 170)
try {
  const saved = localStorage.getItem('seekeatz_logged_meals');
  if (saved) {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) {
      setLoggedMeals(parsed);
    }
  }
} catch (e) {
  console.error('Failed to parse loggedMeals:', e);
}

// Save loggedMeals to localStorage (add new useEffect after line 477)
useEffect(() => {
  if (!isMounted) return;
  try {
    localStorage.setItem('seekeatz_logged_meals', JSON.stringify(loggedMeals));
  } catch (e) {
    console.error('Failed to save loggedMeals:', e);
  }
}, [loggedMeals, isMounted]);
```

---

### Phase 2: Pass Today's Totals to Smart Swaps API
**Goal:** Send today's consumed calories to swaps API so it can compute remaining calories

**Files to Modify:**
1. `app/components/MealDetail.tsx`
2. `app/api/swaps/route.ts`

**Changes:**

**A. MealDetail.tsx (lines 142-238):**
- Add prop or context to access `loggedMeals`
- Compute `todayConsumed` calories before calling swaps API
- Pass `todayConsumed` and `caloriesRemaining` to API

**B. swaps/route.ts:**
- Accept `todayConsumed` and `caloriesRemaining` parameters
- Use these values to inform swap recommendations (optional enhancement)

**Implementation:**
```typescript
// In MealDetail.tsx fetchMealSwaps (around line 153)
const todayStr = new Date().toISOString().split('T')[0];
const todayMeals = loggedMeals.filter(log => log.date === todayStr);
const todayConsumed = todayMeals.reduce((sum, log) => sum + log.meal.calories, 0);
const caloriesRemaining = (userProfile?.target_calories || 0) - todayConsumed;

// Add to API call body (around line 157)
body: JSON.stringify({
  // ... existing fields ...
  todayConsumed,
  caloriesRemaining,
  targetCalories: userProfile?.target_calories
})
```

---

### Phase 3: Update handleLogMeal to Include Swap Modifications
**Goal:** When logging a meal with swaps, use the modified macros (base + swap deltas)

**Files to Modify:**
1. `app/components/MealDetail.tsx` (handleConfirmLog, lines 352-409)
2. `app/components/MainApp.tsx` (handleLogMeal, line 632)

**Current Issue:**
- `handleConfirmLog` in MealDetail calculates `finalMacros` but doesn't pass them to `onLogMeal()`
- `handleLogMeal` in MainApp only receives the base `meal` object

**Solution:**
Option A (Recommended): Modify `onLogMeal` signature to accept optional modified meal
- Change `onLogMeal: () => void` to `onLogMeal: (meal?: Meal, modifications?: SwapModification[]) => void`
- Pass modified meal when swaps are selected

Option B: Modify meal object in-place before calling onLogMeal
- Create new meal object with updated macros
- Pass modified meal to onLogMeal

**Implementation (Option A):**
```typescript
// MealDetail.tsx - handleConfirmLog (around line 401)
const modifiedMeal: Meal = {
  ...meal,
  calories: finalMacros.calories,
  protein: finalMacros.protein,
  carbs: finalMacros.carbs,
  fats: finalMacros.fats
};

onLogMeal(modifiedMeal, selectedSwapsData);

// MainApp.tsx - handleLogMeal (line 632)
const handleLogMeal = (meal: Meal, modifications?: any[]) => {
  // meal already has modified macros if swaps were applied
  const loggedMeal: LoggedMeal = {
    id: `log-${Date.now()}-${Math.random()}`,
    meal, // Use the modified meal
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
  };
  // ... rest of function
};
```

---

### Phase 4: Immediate Update of Calories Remaining After Logging
**Goal:** Ensure remaining calories updates immediately after logging a meal

**Current Behavior:**
- Remaining calories in LogScreen are computed reactively (lines 102-107)
- Since `loggedMeals` state updates immediately (line 640), remaining should update automatically
- **Verification needed:** Ensure LogScreen re-renders when `loggedMeals` changes

**Potential Issue:**
- If LogScreen is not on current screen, it won't re-render
- Need to ensure when user navigates to LogScreen after logging, data is fresh

**Solution:**
- Current implementation should work (React state updates are reactive)
- Add useEffect in LogScreen to log when loggedMeals changes (for debugging)
- Ensure MainApp passes updated loggedMeals prop to LogScreen

**Verification:**
- After logging, remaining calories should update immediately in LogScreen
- Test by logging a meal and checking remaining calories display

---

### Phase 5: Ensure Swaps Output Format Matches Requirements
**Goal:** Verify swaps API returns `{modifications, alternatives}` format

**Current Status:**
- ✅ API already returns `{modifications, alternatives}` (swaps/route.ts lines 116-135)
- ✅ MealDetail.tsx already handles this format (lines 177-213)

**Verification:**
- Confirm format matches exactly what's needed
- Ensure `deltaMacros` is correctly computed for both modifications and alternatives

---

## Summary of Required Changes

### Files to Modify:

1. **app/components/MainApp.tsx**
   - Add localStorage persistence for loggedMeals (load & save)
   - Update `handleLogMeal` signature to accept optional modified meal
   - Ensure loggedMeals state updates trigger re-renders

2. **app/components/MealDetail.tsx**
   - Pass `loggedMeals` to component (via props or context)
   - Compute `todayConsumed` before calling swaps API
   - Pass modified meal to `onLogMeal` when swaps are selected
   - Update `handleConfirmLog` to pass modified meal data

3. **app/components/LogScreen.tsx**
   - No changes needed (already computes remaining correctly)
   - Optional: Add debug logging to verify updates

4. **app/api/swaps/route.ts**
   - Accept `todayConsumed` and `caloriesRemaining` parameters (optional enhancement)
   - Document these parameters in API

### Testing Checklist:

- [ ] LoggedMeals persist across page refreshes
- [ ] Today's consumed calories are computed correctly
- [ ] Remaining calories update immediately after logging
- [ ] Meals logged with swaps use modified macros
- [ ] Swaps API receives today's consumption data
- [ ] Calories remaining calculation: `target - (todayConsumed + mealCalories)` works correctly
- [ ] LogScreen displays correct remaining calories

---

## Implementation Order

1. **Phase 1** (LocalStorage persistence) - Foundation
2. **Phase 3** (Pass modified meal) - Core functionality
3. **Phase 2** (Pass today's totals to API) - Enhancement
4. **Phase 4** (Verify immediate updates) - Testing/verification
5. **Phase 5** (Verify swaps format) - Already correct, just verify

---

## Notes

- No new database tables needed - using existing `profiles` table and localStorage
- All calculations happen client-side (reactive React state)
- Swaps modifications are applied at log time (not stored separately)
- Future enhancement: Could persist loggedMeals to Supabase `logged_meals` table if needed

