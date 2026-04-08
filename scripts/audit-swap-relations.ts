import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type SwapAuditCase = {
  restaurantName: string;
  mealName: string;
  calorieCap?: number;
  minProtein?: number;
};

type MenuItemRow = {
  id: string | number;
  restaurant_name: string;
  name: string;
  macros: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    fats?: number;
  } | null;
};

type SwapModification = {
  label?: string;
  source?: 'db' | 'global' | 'llm';
  modifierItemIds?: Array<string | number>;
  quantityConfig?: {
    unitLabel?: string;
    min?: number;
    defaultQuantity?: number;
    max?: number;
  };
  deltaMacros?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fats?: number;
  };
  estimatedDelta?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fats?: number;
  };
};

type SwapResponse = {
  modifications?: SwapModification[];
  alternatives?: unknown[];
  source?: string;
  error?: string;
};

const SWAP_URL = process.env.SWAP_AUDIT_URL ?? 'http://localhost:3000/api/swaps';

const CASES: SwapAuditCase[] = [
  { restaurantName: 'Sweetgreen', mealName: 'Buffalo Chicken', calorieCap: 500, minProtein: 30 },
  { restaurantName: 'CAVA', mealName: 'Chicken + Rice', calorieCap: 600, minProtein: 40 },
  { restaurantName: "Taziki's Mediterranean Cafe", mealName: 'Caesar Salad', calorieCap: 500, minProtein: 30 },
  { restaurantName: 'Chopt Creative Salad Co.', mealName: 'Kale Caesar', calorieCap: 500, minProtein: 30 },
  { restaurantName: 'WaBa Grill', mealName: 'Chicken Bowl', calorieCap: 500, minProtein: 30 },
  { restaurantName: 'QDOBA Mexican Eats', mealName: 'Chicken Queso Bowl', calorieCap: 700, minProtein: 40 },
  { restaurantName: 'The Habit Burger & Grill', mealName: 'Charburger', calorieCap: 500, minProtein: 30 },
];

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeMealMacros(item: MenuItemRow) {
  const macros = item.macros ?? {};
  return {
    calories: Number(macros.calories ?? 0),
    protein: Number(macros.protein ?? 0),
    carbs: Number(macros.carbs ?? 0),
    fats: Number(macros.fats ?? macros.fat ?? 0),
  };
}

function hasValidDelta(modification: SwapModification): boolean {
  const delta = modification.deltaMacros ?? modification.estimatedDelta;
  if (!delta) {
    return false;
  }

  return ['calories', 'protein', 'carbs', 'fats'].every((key) =>
    Number.isFinite(Number(delta[key as keyof typeof delta]))
  );
}

async function main() {
  const supabase = createSupabaseClient();
  const failures: string[] = [];
  let dbModificationCount = 0;
  let llmModificationCount = 0;

  for (const testCase of CASES) {
    const { data: meal, error } = await supabase
      .from('menu_items')
      .select('id, restaurant_name, name, macros')
      .eq('restaurant_name', testCase.restaurantName)
      .eq('name', testCase.mealName)
      .maybeSingle();

    if (error || !meal) {
      failures.push(`MEAL "${testCase.restaurantName} :: ${testCase.mealName}" | DB lookup failed: ${error?.message ?? 'not found'}`);
      continue;
    }

    const typedMeal = meal as MenuItemRow;
    const response = await fetch(SWAP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_name: typedMeal.restaurant_name,
        meal_id: typedMeal.id,
        meal_name: typedMeal.name,
        meal_macros: normalizeMealMacros(typedMeal),
        calorieCap: testCase.calorieCap,
        minProtein: testCase.minProtein,
        user_goals: {},
      }),
    });

    const payload = (await response.json()) as SwapResponse;
    if (!response.ok) {
      failures.push(`MEAL "${testCase.restaurantName} :: ${testCase.mealName}" | HTTP ${response.status}: ${payload.error ?? 'unknown error'}`);
      continue;
    }

    const modifications = payload.modifications ?? [];
    const dbMods = modifications.filter((modification) => modification.source === 'db');
    const llmMods = modifications.filter((modification) => modification.source === 'llm');
    dbModificationCount += dbMods.length;
    llmModificationCount += llmMods.length;

    if (dbMods.length === 0) {
      failures.push(`MEAL "${testCase.restaurantName} :: ${testCase.mealName}" | expected at least 1 DB-backed swap`);
    }

    if (llmMods.length > 0) {
      failures.push(`MEAL "${testCase.restaurantName} :: ${testCase.mealName}" | expected 0 LLM swaps, got ${llmMods.length}`);
    }

    for (const mod of dbMods) {
      if (!mod.modifierItemIds?.length) {
        failures.push(`MEAL "${testCase.restaurantName} :: ${testCase.mealName}" | DB swap "${mod.label ?? 'unknown'}" missing modifierItemIds`);
      }

      if (!mod.quantityConfig) {
        failures.push(`MEAL "${testCase.restaurantName} :: ${testCase.mealName}" | DB swap "${mod.label ?? 'unknown'}" missing quantityConfig`);
      }

      if (!hasValidDelta(mod)) {
        failures.push(`MEAL "${testCase.restaurantName} :: ${testCase.mealName}" | DB swap "${mod.label ?? 'unknown'}" has invalid delta`);
      }
    }
  }

  console.log(`Swap meals audited: ${CASES.length}`);
  console.log(`DB-backed modifications: ${dbModificationCount}`);
  console.log(`LLM modifications: ${llmModificationCount}`);
  console.log(`Failures: ${failures.length}`);

  for (const failure of failures) {
    console.log(`FAIL ${failure}`);
  }

  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[audit-swap-relations] fatal error:', error);
  process.exit(1);
});
