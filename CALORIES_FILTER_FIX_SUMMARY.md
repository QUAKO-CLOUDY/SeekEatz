# Calories Directional Filter + Pagination Fix

## Issue
- "below X calories" worked correctly
- "above X calories" still returned meals below X (bug)
- Stale pagination: old searchKey persisted when filters changed

## Root Causes
1. Client never set `minCalories` when direction="above" (only set `calorieCap` for "below")
2. searchKey was treated as single source of truth, ignoring new constraints when filters changed
3. Pagination state wasn't cleared when filters changed

## Files Changed

### 1. `app/components/HomeScreen.tsx`

**Line ~496-511**: Fixed calories constraint building
```typescript
// BEFORE: Only handled "below"
if (macroDirections.calories === "below") {
  constraints.calorieCap = macroValues.calories;
}

// AFTER: Handles both "above" and "below"
if (macroDirections.calories === "below") {
  constraints.maxCalories = macroValues.calories;
  constraints.calorieCap = macroValues.calories; // Legacy support
  constraints.minCalories = undefined;
} else if (macroDirections.calories === "above") {
  constraints.minCalories = macroValues.calories;
  constraints.maxCalories = undefined;
  constraints.calorieCap = undefined;
}
```

**Line ~468-472**: Clear pagination state on new search
```typescript
// Added: Clear pagination state when filters change
setLastSearchParams(null);
if (typeof window !== 'undefined') {
  localStorage.removeItem('seekeatz_last_search_params');
}
```

**Line ~560-563**: Clear meals and don't send searchKey for new searches
```typescript
// Clear existing meals before new search (prevents stale results)
setRecommendedMeals([]);

const mealsResult = await searchMeals(query, activeDistance, false, constraints, undefined); // No searchKey for new search
```

**Line ~380-400**: Updated `searchMeals` signature and return type
```typescript
// Added searchKey parameter and updated return type
const searchMeals = async (
  query: string, 
  distance?: number, 
  append = false,
  constraints?: { ... },
  searchKey?: string // Optional searchKey for pagination
): Promise<Meal[] | { meals: Meal[]; searchKey?: string; hasMore?: boolean }>
```

**Line ~405-440**: Updated API call to include minCalories/maxCalories and conditionally send searchKey
```typescript
body: JSON.stringify({ 
  query, 
  radius_miles: distance,
  calorieCap: constraints?.calorieCap, // Legacy support
  minCalories: constraints?.minCalories, // NEW
  maxCalories: constraints?.maxCalories, // NEW
  // ... other constraints
  ...(searchKey ? { searchKey, isPagination: true } : {}), // Only for pagination
})
```

**Line ~209-214**: Updated lastSearchParams type to include searchKey
```typescript
const [lastSearchParams, setLastSearchParams] = useState<{
  macroValues: Record<MacroType, number>;
  macroDirections?: Record<MacroType, Direction>;
  selectedCuisine: string | null;
  distance?: number;
  searchKey?: string; // NEW: For pagination
} | null>
```

**Line ~563-584**: Store searchKey from API response
```typescript
const mealsResult = await searchMeals(...);
const meals = Array.isArray(mealsResult) ? mealsResult : mealsResult.meals || [];
const searchKey = Array.isArray(mealsResult) ? undefined : mealsResult.searchKey;

// Save search parameters including searchKey
const searchParams = {
  macroValues: { ...macroValues },
  macroDirections: { ...macroDirections },
  selectedCuisine,
  distance: activeDistance,
  searchKey, // NEW: Store for pagination
};
```

**Line ~658-667**: Fixed handleFindMoreMeals calories constraints (same fix as handleFindMeals)

**Line ~688-693**: Updated handleFindMoreMeals to handle new return type and use searchKey for pagination

### 2. `app/api/search/handler.ts`

**Line ~1169-1200**: Fixed searchKey priority - only use for pagination, params override for new searches
```typescript
// BEFORE: Always used searchKey if present
if (params.searchKey) { ... }

// AFTER: Only use searchKey for pagination requests
if (params.searchKey && params.isPagination) {
  // Use searchKey for pagination
} else {
  // New search - ignore searchKey, use params
  if (params.searchKey && !params.isPagination) {
    console.log('[searchHandler] New search detected - ignoring searchKey, using params');
  }
}
```

**Line ~1297-1307**: Enhanced logging to show minCalories/maxCalories
```typescript
console.log('[searchHandler] Effective constraints (will be enforced):', {
  calories: effectiveMinCalories !== undefined || effectiveMaxCalories !== undefined 
    ? `${effectiveMinCalories ?? 'min'} - ${effectiveMaxCalories ?? 'max'}`
    : 'none',
  // ... other macros
  fullConstraints: effectiveConstraints
});
```

**Line ~1171-1186**: Enhanced searchKey decoding log to show minCalories/maxCalories
```typescript
console.log('[searchHandler] Pagination request - decoded searchKey:', {
  searchKey: params.searchKey,
  reconstructedQuery,
  reconstructedDishType,
  reconstructedConstraints: {
    minCalories: reconstructedParams.minCalories, // NEW
    maxCalories: reconstructedParams.maxCalories, // NEW
    // ... other constraints
  }
});
```

**Line ~1806-1845**: Enhanced dev assertion to specifically check calories constraints
```typescript
// Additional specific assertion for calories constraints
if (effectiveMinCalories !== undefined || effectiveMaxCalories !== undefined) {
  const violations = macroFilteredItems.filter((item: any) => {
    const itemCalories = typeof item.calories === 'number' ? item.calories : parseFloat(item.calories) || 0;
    if (effectiveMinCalories !== undefined && itemCalories < effectiveMinCalories) return true;
    if (effectiveMaxCalories !== undefined && itemCalories > effectiveMaxCalories) return true;
    return false;
  });
  
  if (violations.length > 0) {
    throw new Error(`CRITICAL: ${violations.length} meal(s) violate calories constraints!`);
  }
}
```

**Line ~1230-1243**: Already had effectiveMaxCalories computation (no change needed, but verified it works correctly)

**Line ~1748-1749**: Already had both min/max filtering (no change needed, but verified it enforces both)

### 3. `app/api/search/build-params.ts`

**Line ~14-20**: Already supports minCalories/maxCalories (no changes needed)

**Line ~78-95**: Already maps minCalories/maxCalories correctly (no changes needed)

## Testing Checklist

✅ **Calories above 1000** → All results have calories >= 1000
✅ **Calories below 700** → All results have calories <= 700  
✅ **Flipping above/below** → Immediately changes results without refresh
✅ **Changing filters** → Resets searchKey so old constraints can't persist
✅ **Pagination** → Uses searchKey only when isPagination=true
✅ **New search** → Ignores old searchKey, uses new constraints

## Key Changes Summary

1. **Client**: Now sets `minCalories` when direction="above", `maxCalories` when direction="below"
2. **Client**: Clears pagination state (searchKey, lastSearchParams) when filters change
3. **Client**: Only sends searchKey when `isPagination=true` (for "Find More Meals")
4. **Server**: Only uses searchKey for pagination requests, params override for new searches
5. **Server**: Enhanced logging shows minCalories/maxCalories explicitly
6. **Server**: Dev assertion specifically checks calories constraints violations

