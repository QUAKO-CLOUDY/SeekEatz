/**
 * SeekEatz Ingestion — Supabase Upserter
 *
 * Writes normalized menu items to the menu_items table.
 * Deduplication: upserts on (restaurant_name, name) — if a row already exists
 * with the same restaurant + item name, it updates macros and metadata rather
 * than inserting a duplicate.
 *
 * Also upserts the restaurant into the restaurants table if it doesn't exist.
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (NOT the anon key — service role bypasses RLS)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NormalizedMenuItem } from './types';

// ─── Supabase client ──────────────────────────────────────────────────────────

function getSupabaseClient(): SupabaseClient {
  const url    = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key    = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase credentials.\n' +
      'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local\n' +
      '(Use the service_role key, not the anon key — it bypasses RLS for writes)'
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── Restaurant upsert ────────────────────────────────────────────────────────

const restaurantCache = new Set<string>(); // avoid redundant upserts per run

async function upsertRestaurant(
  supabase:       SupabaseClient,
  restaurantName: string
): Promise<void> {
  if (restaurantCache.has(restaurantName)) return;

  const { error } = await supabase
    .from('restaurants')
    .upsert(
      {
        name: restaurantName,
        canonical_name: restaurantName,
        aliases: [restaurantName.toLowerCase()],
        active_status: true,
        last_verified_at: new Date().toISOString(),
        is_chain: true,
      },
      { onConflict: 'name', ignoreDuplicates: true }
    );

  if (error) {
    console.warn(`  [upserter] Restaurant upsert warning for "${restaurantName}":`, error.message);
  }

  restaurantCache.add(restaurantName);
}

// ─── Batch menu item upsert ───────────────────────────────────────────────────

const CHUNK_SIZE = 100; // Supabase recommends ≤500 rows per upsert, 100 is safe

interface UpsertResult {
  inserted: number;
  updated:  number;
  errors:   number;
}

async function upsertChunk(
  supabase: SupabaseClient,
  items:    NormalizedMenuItem[]
): Promise<UpsertResult> {
  // Build the upsert payload — map NormalizedMenuItem → DB columns
  const rows = items.map(item => ({
    restaurant_name:    item.restaurant_name,
    name:               item.name,
    import_batch_id:    item.import_batch_id,
    calories:           item.calories,
    protein_g:          item.protein_g,
    carbs_g:            item.carbs_g,
    fat_g:              item.fat_g,
    macros:             item.macros,
    fiber_g:            item.fiber_g        ?? null,
    sugar_g:            item.sugar_g        ?? null,
    sodium_mg:          item.sodium_mg      ?? null,
    cholesterol_mg:     item.cholesterol_mg ?? null,
    saturated_fat_g:    item.saturated_fat_g ?? null,
    trans_fat_g:        item.trans_fat_g    ?? null,
    serving_size:       item.serving_size   ?? null,
    serving_unit:       item.serving_unit   ?? null,
    item_type:          item.item_type,
    normalized_category: item.normalized_category ?? null,
    meal_type:          item.meal_type,
    food_tags:          item.food_tags      ?? null,
    category:           item.category       ?? null,
    description_short:  item.description_short ?? null,
    cuisine_type:       item.cuisine_type ?? null,
    protein_source:     item.protein_source ?? null,
    cooking_method:     item.cooking_method ?? null,
    tags:               item.tags ?? null,
    aliases:            item.aliases ?? null,
    diet_flags:         item.diet_flags ?? null,
    allergen_flags:     item.allergen_flags ?? null,
    description:        item.description    ?? null,
    image_url:          item.image_url      ?? null,
    price_estimate:     item.price_estimate ?? null,
    allergens:          item.allergens      ?? null,
    source_type:        item.source_type ?? null,
    source_url:         item.source_url ?? null,
    confidence_score:   item.confidence_score,
    is_verified:        item.is_verified,
    is_available:       item.is_available,
    last_verified_at:   item.last_verified_at ?? null,
    active_status:      item.active_status ?? true,
  }));

  const { data, error } = await supabase
    .from('menu_items')
    .upsert(rows, {
      onConflict:      'restaurant_name,name', // dedup key
      ignoreDuplicates: false,                 // update existing rows
    })
    .select('id');

  if (error) {
    console.error('  [upserter] Chunk upsert error:', error.message);
    return { inserted: 0, updated: 0, errors: items.length };
  }

  // Supabase upsert doesn't distinguish insert vs update in the response,
  // so we just report total affected
  return { inserted: data?.length ?? 0, updated: 0, errors: 0 };
}

// ─── Main upsert function ─────────────────────────────────────────────────────

export interface UpsertOptions {
  /** If true, log what would be written but don't actually write */
  dryRun?: boolean;
}

export async function upsertMenuItems(
  items:    NormalizedMenuItem[],
  options:  UpsertOptions = {}
): Promise<{ total: number; errors: number }> {
  if (options.dryRun) {
    console.log(`  [upserter] DRY RUN — would upsert ${items.length} items`);
    items.slice(0, 3).forEach(item => {
      console.log(`    • ${item.restaurant_name} — ${item.name} (${item.macros.calories} cal)`);
    });
    if (items.length > 3) console.log(`    ... and ${items.length - 3} more`);
    return { total: items.length, errors: 0 };
  }

  const supabase = getSupabaseClient();

  // Upsert unique restaurants first
  const uniqueRestaurants = [...new Set(items.map(i => i.restaurant_name))];
  for (const name of uniqueRestaurants) {
    await upsertRestaurant(supabase, name);
  }

  // Upsert menu items in chunks
  let total  = 0;
  let errors = 0;

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const result = await upsertChunk(supabase, chunk);
    total  += result.inserted + result.updated;
    errors += result.errors;

    const pct = Math.round(((i + chunk.length) / items.length) * 100);
    process.stdout.write(`\r  [upserter] ${i + chunk.length}/${items.length} (${pct}%)    `);
  }

  process.stdout.write('\n');
  return { total, errors };
}
