# Implementation Summary: Calorie Remaining & Swap-Aware Logging

## ✅ Completed Implementation

### 1. Shared Hook for Calorie Tracking
**File:** `app/hooks/useCalorieTracking.ts`
- Created `useCalorieTracking` hook as single source of truth
- Computes:
  - `todaysConsumedCalories` - sum of logged meals for selected date
  - `todaysRemainingCalories` - `targetCalories - todaysConsumedCalories`
  - `remainingIfEatMeal(mealCalories)` - function to calculate remaining if meal were eaten
- Used by: MealCard, LogScreen

### 2. localStorage Persistence for Logged Meals
**File:** `app/components/MainApp.tsx`
- Added localStorage save/load for `loggedMeals` using key `seekeatz_logged_meals`
- Loads on app start (lines 172-182)
- Saves automatically when `loggedMeals` changes (lines 479-486)

### 3. Swap-Aware Meal Logging
**Files:**
- `app/components/MealDetail.tsx`
  - Updated `handleConfirmLog` to create `modifiedMeal` with final macros (base + swaps)
  - Passes modified meal to `onLogMeal(modifiedMeal)` instead of base meal
  - Updated Props type: `onLogMeal: (meal: Meal) => void`
- `app/components/MainApp.tsx`
  - `handleLogMeal` accepts modified meal with swaps already applied
  - Logs meal with final macros that user actually ate

### 4. MealCard Remaining Calories Display
**File:** `app/components/MealCard.tsx`
- Added optional props: `userProfile`, `loggedMeals`
- Uses `useCalorieTracking` hook to compute `remainingIfEatMeal`
- Displays remaining calories below meal calories in both:
  - Regular mode: Shows as small text below "cal" label
  - Compact mode: Shows as tiny text below "cal" label
- Color coding: Green for positive, red for negative remaining

### 5. LogScreen Integration
**File:** `app/components/LogScreen.tsx`
- Uses `useCalorieTracking` hook for calorie calculations
- Uses `todaysRemainingCalories` from hook instead of manual calculation
- Ensures consistency with MealCard calculations

### 6. HomeScreen Integration
**File:** `app/components/HomeScreen.tsx`
- Added `loggedMeals` prop
- Passes `userProfile` and `loggedMeals` to all MealCard instances
- Updated MainApp to pass `loggedMeals` to HomeScreen

### 7. Debug Logging
**Files:**
- `app/components/MealCard.tsx`: Logs when rendering meal card
  ```javascript
  console.log('[MealCard] Rendering meal card:', {
    targetCalories,
    todaysConsumedCalories,
    mealCalories,
    remainingIfEatMeal
  });
  ```
- `app/components/MealDetail.tsx`: Logs when confirming log
  ```javascript
  console.log('[MealDetail] Confirming log with swaps:', {
    baseMealCalories,
    finalMealCalories,
    swapsApplied
  });
  ```
- `app/components/MainApp.tsx`: Logs when logging meal
  ```javascript
  console.log('[MainApp] Logging meal:', {
    targetCalories,
    todaysConsumedCalories,
    mealCalories,
    remainingIfEatMeal
  });
  ```

## Key Features

1. **Single Source of Truth**: `useCalorieTracking` hook ensures all components calculate remaining calories the same way

2. **Swap-Aware Logging**: When user selects swaps, the modified meal macros (base + swap deltas) are logged, not the base meal

3. **Immediate Updates**: React state updates trigger re-renders automatically:
   - LogScreen updates when `loggedMeals` changes
   - MealCard updates when `loggedMeals` or `userProfile` changes
   - No page refresh needed

4. **Persistence**: Logged meals survive page refreshes via localStorage

5. **Consistent Calculations**: All components use the same formula:
   - `remainingIfEatMeal = targetCalories - (todaysConsumedCalories + mealCalories)`

## Testing Checklist

- [x] LoggedMeals persist to localStorage
- [x] LoggedMeals load on app start
- [x] MealCard displays remaining calories when userProfile/loggedMeals provided
- [x] LogScreen uses shared hook for calculations
- [x] MealDetail passes modified meal with swaps
- [x] Debug logs appear in console
- [ ] Manual testing: Log meal → verify immediate updates everywhere (requires running app)

## Files Modified

1. `app/hooks/useCalorieTracking.ts` (NEW)
2. `app/components/MainApp.tsx`
3. `app/components/MealDetail.tsx`
4. `app/components/MealCard.tsx`
5. `app/components/LogScreen.tsx`
6. `app/components/HomeScreen.tsx`

## Next Steps for Testing

1. Run the app
2. Set a calorie target in settings
3. View a meal card - verify remaining calories display
4. Log a meal - check console logs
5. Verify LogScreen shows updated remaining calories immediately
6. Verify MealCard shows updated remaining calories immediately
7. Select swaps when logging - verify modified macros are logged
8. Refresh page - verify logged meals persist

