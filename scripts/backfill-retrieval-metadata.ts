import path from 'path';
import dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normalizeItem } from './ingest/normalizer';
import type { RawIngestionItem } from './ingest/types';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type MenuItemRow = {
  id: string | number;
  restaurant_name: string;
  restaurant_id?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  meal_type?: string | null;
  image_url?: string | null;
  price_estimate?: number | null;
  allergens?: string[] | null;
  source_url?: string | null;
  source_type?: string | null;
  confidence_score?: number | null;
  macros?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    fiber?: number;
    sugar?: number;
    sodium?: number;
    cholesterol?: number;
    saturated_fat?: number;
  } | null;
};

type RestaurantRow = {
  id: string;
  name: string;
  canonical_name?: string | null;
  aliases?: string[] | null;
  cuisine_types?: string[] | null;
  brand_tags?: string[] | null;
  active_status?: boolean | null;
  last_verified_at?: string | null;
};

type RetrievalSchemaState = {
  restaurantsExtended: boolean;
  menuItemsExtended: boolean;
};

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const restaurantArg = args.find((value) => value.startsWith('--restaurant='))?.split('=')[1];
const limitArg = args.find((value) => value.startsWith('--limit='))?.split('=')[1];
const limit = limitArg ? Math.max(1, Number(limitArg)) : undefined;
const BATCH_SIZE = 200;

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeLookup(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

function createRestaurantLookup(restaurants: RestaurantRow[]) {
  const lookup = new Map<string, RestaurantRow>();

  for (const restaurant of restaurants) {
    const candidates = new Set<string>();
    candidates.add(restaurant.name);
    if (restaurant.canonical_name) candidates.add(restaurant.canonical_name);
    for (const alias of restaurant.aliases ?? []) candidates.add(alias);

    for (const candidate of candidates) {
      lookup.set(normalizeLookup(candidate), restaurant);
    }
  }

  return lookup;
}

function toRawIngestionItem(row: MenuItemRow): RawIngestionItem {
  return {
    source: (row.source_type as RawIngestionItem['source']) || 'manual',
    sourceUrl: row.source_url ?? undefined,
    restaurantName: row.restaurant_name,
    name: row.name,
    description: row.description ?? undefined,
    calories: Number(row.macros?.calories ?? 0),
    protein_g: Number(row.macros?.protein ?? 0),
    carbs_g: Number(row.macros?.carbs ?? 0),
    fat_g: Number(row.macros?.fat ?? 0),
    fiber_g: row.macros?.fiber,
    sugar_g: row.macros?.sugar,
    sodium_mg: row.macros?.sodium,
    cholesterol_mg: row.macros?.cholesterol,
    saturated_fat_g: row.macros?.saturated_fat,
    rawCategory: row.category ?? undefined,
    rawMealType: row.meal_type ?? undefined,
    price: row.price_estimate ?? undefined,
    imageUrl: row.image_url ?? undefined,
    allergens: row.allergens ?? undefined,
    sourceConfidence: row.confidence_score ?? 0.75,
  };
}

async function fetchRestaurants(supabase: SupabaseClient): Promise<RestaurantRow[]> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, name');

  if (error) {
    throw new Error(`Failed to fetch restaurants: ${error.message}`);
  }

  return (data ?? []) as RestaurantRow[];
}

async function detectSchemaState(supabase: SupabaseClient): Promise<RetrievalSchemaState> {
  const [restaurantProbe, menuProbe] = await Promise.all([
    supabase.from('restaurants').select('canonical_name').limit(1),
    supabase.from('menu_items').select('description_short').limit(1),
  ]);

  return {
    restaurantsExtended: !restaurantProbe.error,
    menuItemsExtended: !menuProbe.error,
  };
}

async function fetchMenuItems(
  supabase: SupabaseClient,
  offset: number
): Promise<MenuItemRow[]> {
  let query = supabase
    .from('menu_items')
    .select([
      'id',
      'restaurant_name',
      'restaurant_id',
      'name',
      'description',
      'category',
      'meal_type',
      'image_url',
      'price_estimate',
      'allergens',
      'confidence_score',
      'macros',
    ].join(', '))
    .order('id', { ascending: true })
    .range(offset, offset + BATCH_SIZE - 1);

  if (restaurantArg) {
    query = query.ilike('restaurant_name', `%${restaurantArg}%`);
  }

  if (limit) {
    query = query.range(offset, Math.min(offset + BATCH_SIZE - 1, limit - 1));
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch menu_items: ${error.message}`);
  }

  return ((data ?? []) as unknown) as MenuItemRow[];
}

async function updateMenuItemChunk(
  supabase: SupabaseClient,
  updates: Array<Record<string, unknown>>
): Promise<void> {
  for (const update of updates) {
    const { id, ...payload } = update;
    const { error } = await supabase
      .from('menu_items')
      .update(payload)
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update menu_item ${String(id)}: ${error.message}`);
    }
  }
}

async function updateRestaurantChunk(
  supabase: SupabaseClient,
  updates: Array<Record<string, unknown>>
): Promise<void> {
  for (const update of updates) {
    const { id, ...payload } = update;
    const { error } = await supabase
      .from('restaurants')
      .update(payload)
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update restaurant ${String(id)}: ${error.message}`);
    }
  }
}

async function main() {
  const supabase = getSupabaseClient();
  const schemaState = await detectSchemaState(supabase);
  const restaurants = await fetchRestaurants(supabase);
  const restaurantLookup = createRestaurantLookup(restaurants);

  if (!schemaState.restaurantsExtended || !schemaState.menuItemsExtended) {
    const missingTargets = [
      !schemaState.restaurantsExtended ? 'restaurants canonical retrieval columns' : null,
      !schemaState.menuItemsExtended ? 'menu_items retrieval metadata columns' : null,
    ].filter(Boolean).join(', ');

    if (!isDryRun) {
      throw new Error(
        `Retrieval schema is not fully applied. Missing: ${missingTargets}. ` +
        'Run supabase/migrations/20250101000012_retrieval_v2_schema.sql before live backfill.'
      );
    }

    console.log(`[backfill] DRY RUN: schema not fully applied yet (${missingTargets})`);
    console.log('[backfill] DRY RUN will still preview menu_item normalization, but live updates require migration 012.');
  }

  const restaurantUpdates = restaurants
    .map((restaurant) => {
      const aliases = Array.from(
        new Set([
          restaurant.name.toLowerCase(),
          ...(restaurant.aliases ?? []),
          ...(restaurant.canonical_name ? [restaurant.canonical_name.toLowerCase()] : []),
        ])
      );

      return {
        id: restaurant.id,
        canonical_name: restaurant.canonical_name ?? restaurant.name,
        aliases,
        active_status: restaurant.active_status ?? true,
        last_verified_at: restaurant.last_verified_at ?? new Date().toISOString(),
      };
    });

  if (isDryRun || !schemaState.restaurantsExtended) {
    console.log(`[backfill] DRY RUN: would normalize ${restaurantUpdates.length} restaurant rows`);
  } else {
    await updateRestaurantChunk(supabase, restaurantUpdates);
  }

  let offset = 0;
  let processed = 0;
  let updated = 0;
  let skipped = 0;

  while (true) {
    if (limit !== undefined && offset >= limit) {
      break;
    }

    const rows = await fetchMenuItems(supabase, offset);
    if (rows.length === 0) {
      break;
    }

    const updates: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      processed += 1;
      const normalizedRestaurant = restaurantLookup.get(normalizeLookup(row.restaurant_name));
      const normalized = normalizeItem(toRawIngestionItem(row), {
        batchLabel: 'retrieval-backfill',
        calorieFloor: 0,
        skipLargePortions: false,
        skipModifiers: false,
        skipDrinks: false,
      });

      if (!normalized) {
        skipped += 1;
        continue;
      }

      updates.push({
        id: row.id,
        restaurant_id: row.restaurant_id ?? normalizedRestaurant?.id ?? null,
        description_short: normalized.description_short ?? null,
        calories: normalized.macros.calories,
        protein_g: normalized.macros.protein,
        carbs_g: normalized.macros.carbs,
        fat_g: normalized.macros.fat,
        normalized_category: normalized.normalized_category ?? row.category ?? null,
        meal_type: normalized.meal_type,
        item_type: normalized.item_type,
        food_tags: normalized.food_tags ?? null,
        cuisine_type: normalized.cuisine_type ?? normalizedRestaurant?.cuisine_types?.[0] ?? null,
        protein_source: normalized.protein_source ?? null,
        cooking_method: normalized.cooking_method ?? null,
        tags: normalized.tags ?? normalized.food_tags ?? null,
        aliases: normalized.aliases ?? [row.name.toLowerCase()],
        diet_flags: normalized.diet_flags ?? null,
        allergen_flags: normalized.allergen_flags ?? normalized.allergens ?? null,
        source_type: row.source_type ?? normalized.source_type ?? 'manual',
        source_url: row.source_url ?? normalized.source_url ?? null,
        confidence_score: Math.max(
          Number(row.confidence_score ?? 0),
          Number(normalized.confidence_score ?? 0)
        ),
        last_verified_at: normalized.last_verified_at ?? new Date().toISOString(),
        active_status: true,
      });
    }

    if (updates.length > 0) {
      if (isDryRun || !schemaState.menuItemsExtended) {
        console.log(`[backfill] DRY RUN: would update ${updates.length} menu_items in chunk starting at offset ${offset}`);
      } else {
        await updateMenuItemChunk(supabase, updates);
      }
      updated += updates.length;
    }

    offset += rows.length;
    if (rows.length < BATCH_SIZE) {
      break;
    }
  }

  console.log('[backfill] complete');
  console.log(`[backfill] processed menu_items: ${processed}`);
  console.log(`[backfill] updated menu_items:   ${updated}`);
  console.log(`[backfill] skipped menu_items:   ${skipped}`);
  if (restaurantArg) {
    console.log(`[backfill] restaurant filter:    ${restaurantArg}`);
  }
  if (limit !== undefined) {
    console.log(`[backfill] limit:                ${limit}`);
  }
  console.log(`[backfill] mode:                 ${isDryRun ? 'dry-run' : 'live'}`);
}

main().catch((error) => {
  console.error('[backfill] fatal error:', error);
  process.exit(1);
});
