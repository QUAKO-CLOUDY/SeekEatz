import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { buildSearchParams } from '@/lib/search-utils';
import { retrieveMealsWithClient } from '@/lib/retrieval/retrieval-engine';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type MenuItemRestaurantRow = {
  restaurant_name: string | null;
  item_type?: string | null;
  is_searchable?: boolean | null;
};

type RawRestaurantEntry = {
  file: string;
  restaurantName: string;
};

const BATCH_SIZE = 1000;
const KNOWN_QUARANTINED_RESTAURANTS = new Set([
  "Moe's Southwest Grill",
]);

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/['.,\-]/g, '')
    .replace(/\b(co|company|restaurant|grill|cafe|bar|kitchen|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function getRawJsonRestaurantNames(): RawRestaurantEntry[] {
  const jsonDir = path.resolve(process.cwd(), 'data', 'jsons');
  return fs
    .readdirSync(jsonDir)
    .filter((file) => file.endsWith('_raw.json'))
    .sort()
    .map((file) => {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(jsonDir, file), 'utf8')
      ) as { restaurant_name?: string };

      return {
        file,
        restaurantName: parsed.restaurant_name?.trim() ?? '',
      };
    });
}

async function fetchAllMenuRestaurantRows(
  supabase: ReturnType<typeof createSupabaseClient>,
  searchableMealsOnly = false
): Promise<MenuItemRestaurantRow[]> {
  const rows: MenuItemRestaurantRow[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from('menu_items')
      .select('restaurant_name, item_type, is_searchable')
      .not('restaurant_name', 'is', null)
      .range(from, from + BATCH_SIZE - 1);

    if (searchableMealsOnly) {
      query = query.eq('item_type', 'meal').eq('is_searchable', true);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch menu_items restaurant rows: ${error.message}`);
    }

    rows.push(...((data ?? []) as MenuItemRestaurantRow[]));

    if (!data || data.length < BATCH_SIZE) {
      break;
    }

    from += data.length;
  }

  return rows;
}

async function auditRestaurantQueries(
  supabase: ReturnType<typeof createSupabaseClient>,
  restaurantNames: string[]
) {
  const noResultFailures: string[] = [];
  const wrongRestaurantFailures: string[] = [];

  for (const restaurantName of restaurantNames) {
    const searchParams = await buildSearchParams({ query: restaurantName, limit: 3, offset: 0 });
    const result = await retrieveMealsWithClient(supabase, searchParams);

    if (result.meals.length === 0) {
      noResultFailures.push(`${restaurantName} -> resolved=${searchParams.restaurant ?? 'none'}`);
      continue;
    }

    const expectedRestaurant = normalizeName(searchParams.restaurant ?? restaurantName);
    const violations = result.meals.filter((meal) => normalizeName(meal.restaurant) !== expectedRestaurant);

    if (violations.length > 0) {
      wrongRestaurantFailures.push(
        `${restaurantName} -> resolved=${searchParams.restaurant ?? 'none'} returned=${Array.from(
          new Set(result.meals.map((meal) => meal.restaurant))
        ).join(', ')}`
      );
    }
  }

  return { noResultFailures, wrongRestaurantFailures };
}

async function main() {
  const supabase = createSupabaseClient();
  const [allRows, searchableMealRows] = await Promise.all([
    fetchAllMenuRestaurantRows(supabase),
    fetchAllMenuRestaurantRows(supabase, true),
  ]);

  const rawRestaurants = getRawJsonRestaurantNames();
  const searchableRestaurantNames = Array.from(
    new Set(
      searchableMealRows
        .map((row) => row.restaurant_name?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).sort((a, b) => a.localeCompare(b));

  const searchableRestaurantSet = new Set(searchableRestaurantNames.map(normalizeName));
  const rawCoverageMissing = rawRestaurants.filter((entry) => {
    if (!entry.restaurantName) return true;
    if (KNOWN_QUARANTINED_RESTAURANTS.has(entry.restaurantName)) return false;
    return !searchableRestaurantSet.has(normalizeName(entry.restaurantName));
  });

  const queryAudit = await auditRestaurantQueries(supabase, searchableRestaurantNames);
  const failed =
    rawCoverageMissing.length > 0 ||
    queryAudit.noResultFailures.length > 0 ||
    queryAudit.wrongRestaurantFailures.length > 0;

  console.log(`Raw JSON restaurants audited: ${rawRestaurants.length}`);
  console.log(`Searchable restaurants audited: ${searchableRestaurantNames.length}`);
  console.log(`Known quarantined restaurants: ${KNOWN_QUARANTINED_RESTAURANTS.size}`);
  console.log(`Raw JSON restaurants missing searchable meal coverage: ${rawCoverageMissing.length}`);
  for (const entry of rawCoverageMissing) {
    console.log(`MISSING_COVERAGE ${entry.restaurantName} <- ${entry.file}`);
  }

  console.log(`Restaurant queries with no meal cards: ${queryAudit.noResultFailures.length}`);
  for (const failure of queryAudit.noResultFailures) {
    console.log(`NO_RESULT ${failure}`);
  }

  console.log(`Restaurant queries returning wrong restaurants: ${queryAudit.wrongRestaurantFailures.length}`);
  for (const failure of queryAudit.wrongRestaurantFailures) {
    console.log(`WRONG_RESTAURANT ${failure}`);
  }

  if (failed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[audit-restaurant-readiness] fatal error:', error);
  process.exit(1);
});
