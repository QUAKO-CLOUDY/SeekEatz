/**
 * SeekEatz Data Ingestion — Main Runner
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Run with:
 *   npx tsx scripts/ingest/index.ts [options]
 *
 * Options (env vars or CLI flags):
 *   --dry-run            Don't write to DB, just log what would be ingested
 *   --adapter=<name>     Only run one adapter:
 *                          nutritionix | fatsecret | scraper | ai | places
 *   --restaurant=<name>  Only ingest one restaurant (exact name)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * HOW TO USE THIS FILE:
 *
 * 1. NATIONAL CHAINS (Nutritionix) → Add to NUTRITIONIX_RESTAURANTS
 * 2. NATIONAL CHAINS (FatSecret fallback) → Add to FATSECRET_RESTAURANTS
 *    Use FatSecret for chains Nutritionix doesn't cover, or run both for
 *    maximum coverage (the upserter deduplicates on restaurant_name + name).
 * 3. REGIONAL CHAINS → Add to SCRAPER_TARGETS with their nutrition page URL.
 * 4. LOCAL/INDEPENDENT → Add to AI_ESTIMATOR_TARGETS with item names + desc.
 * 5. RESTAURANT ENRICHMENT → Run --adapter=places to pull Google Places data
 *    (coordinates, ratings, photos, website) for all restaurants in the DB.
 * ───────────────────────────────────────────────────────────────────────────
 */

import path from 'path';
import dotenv from 'dotenv';
import { createNutritionixAdapter }        from './adapters/nutritionix';
import { createFatSecretAdapter }          from './adapters/fatsecret';
import { createScraperAdapter }            from './adapters/scraper';
import { createAIEstimatorAdapter }        from './adapters/ai-estimator';
import { enrichAllDbRestaurants }          from './adapters/google-places';
import { normalizeItems }                  from './normalizer';
import { upsertMenuItems }                 from './upserter';
import type { IngestAdapter, RawIngestionItem } from './types';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// ══════════════════════════════════════════════════════════════════════════════
// ① NATIONAL CHAINS — Nutritionix will find and pull these automatically
// Add restaurant names exactly as they appear on Nutritionix.
// ══════════════════════════════════════════════════════════════════════════════

const NUTRITIONIX_RESTAURANTS: string[] = [
  // Fast food
  'Wendy\'s',
  'Taco Bell',
  'Popeyes',
  'Raising Cane\'s',
  'Wingstop',
  'Steak \'n Shake',
  'Whataburger',
  'Jack in the Box',
  'Shake Shack',
  'Habit Burger',
  // Fast casual
  'Sweetgreen',
  'Noodles & Company',
  'Mod Pizza',
  'Which Wich',
  'Potbelly',
  'Tropical Smoothie Cafe',
  'Zoes Kitchen',
  'Pei Wei',
  // Casual dining
  'Applebee\'s',
  'TGI Friday\'s',
  'Denny\'s',
  'IHOP',
  'Red Robin',
  'Bob Evans',
  'Cracker Barrel',
  'Texas Roadhouse',
  'Outback Steakhouse',
  'Chili\'s',
  // Add more as needed...
];

// ══════════════════════════════════════════════════════════════════════════════
// ② FATSECRET — Fallback for chains Nutritionix doesn't cover
// Run after Nutritionix. Upserter deduplicates, so no double entries.
// ══════════════════════════════════════════════════════════════════════════════

const FATSECRET_RESTAURANTS: string[] = [
  // Add restaurants here that weren't found via Nutritionix:
  // 'WaBa Grill',
  // 'Taziki\'s Mediterranean Cafe',
  // 'Urban Plates',
  // 'Protein Bar & Kitchen',
];

// ══════════════════════════════════════════════════════════════════════════════
// ③ REGIONAL CHAINS — Provide their nutrition page URL
// The scraper will try JSON-LD, inline JSON, and HTML tables automatically.
// If the page is JS-rendered (React/Next), see SCRAPER_USE_PLAYWRIGHT in README.
// ══════════════════════════════════════════════════════════════════════════════

const SCRAPER_TARGETS: Record<string, string> = {
  // Format: 'Restaurant Name': 'https://...'

  // Examples (uncomment and fill in real URLs):
  // 'Taziki\'s Mediterranean Cafe': 'https://tazikis.com/nutrition',
  // 'WaBa Grill':   'https://www.wabagrill.com/nutrition',
  // 'Cafe Rio':     'https://www.caferio.com/menu/nutrition',

  // Add regional chains with their nutrition page URLs here:
};

// ══════════════════════════════════════════════════════════════════════════════
// ④ LOCAL / INDEPENDENT — Provide menu items manually, AI estimates macros
// ══════════════════════════════════════════════════════════════════════════════

const AI_ESTIMATOR_TARGETS: Record<string, Array<{ name: string; description?: string; category?: string; price?: number }>> = {
  // Format:
  // 'Restaurant Name': [
  //   { name: 'Item Name', description: 'Ingredients / prep style', category: 'Entrees', price: 14.99 },
  // ],

  // Example (uncomment to use):
  // 'The Local Kitchen': [
  //   { name: 'Grilled Salmon Plate', description: 'Atlantic salmon with roasted veggies and brown rice', category: 'Entrees', price: 18 },
  //   { name: 'Turkey Avocado Club', description: 'Sliced turkey, avocado, bacon, on sourdough', category: 'Sandwiches', price: 13 },
  //   { name: 'Quinoa Power Bowl', description: 'Quinoa, roasted chickpeas, kale, tahini dressing', category: 'Bowls', price: 14 },
  // ],
};

// ══════════════════════════════════════════════════════════════════════════════
// Ingestion runner — no changes needed below this line
// ══════════════════════════════════════════════════════════════════════════════

const args       = process.argv.slice(2);
const isDryRun   = args.includes('--dry-run');
const adapterArg = args.find(a => a.startsWith('--adapter='))?.split('=')[1];
const restArg    = args.find(a => a.startsWith('--restaurant='))?.split('=')[1];
const limitArg   = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const refreshCache = args.includes('--refresh-cache');
const cacheDisabled = args.includes('--no-cache');
const placesLimit = limitArg ? Number(limitArg) : undefined;

const BATCH_LABEL = process.env.INGEST_BATCH_LABEL ?? 'batch';

interface RestaurantResult {
  restaurant: string;
  adapter:    string;
  raw:        number;
  normalized: number;
  skipped:    number;
  upserted:   number;
  errors:     number;
}

async function runAdapter(
  adapter:        IngestAdapter,
  restaurants:    string[],
  batchLabel:     string
): Promise<RestaurantResult[]> {
  const results: RestaurantResult[] = [];

  const targets = restArg
    ? restaurants.filter(r => r.toLowerCase() === restArg.toLowerCase())
    : restaurants;

  for (const restaurant of targets) {
    console.log(`\n[${adapter.name}] → ${restaurant}`);

    let rawItems: RawIngestionItem[] = [];
    try {
      rawItems = await adapter.fetch(restaurant);
    } catch (err) {
      console.error(`  Error fetching from ${adapter.name}:`, err);
      results.push({ restaurant, adapter: adapter.name, raw: 0, normalized: 0, skipped: 0, upserted: 0, errors: 1 });
      continue;
    }

    if (rawItems.length === 0) {
      results.push({ restaurant, adapter: adapter.name, raw: 0, normalized: 0, skipped: 0, upserted: 0, errors: 0 });
      continue;
    }

    const { items, skipped } = normalizeItems(rawItems, {
      batchLabel,
      calorieFloor:     150,
      skipLargePortions: true,
      skipModifiers:     true,
      skipDrinks:        false,
    });

    console.log(`  Normalized: ${items.length} items (${skipped} skipped as modifiers/low-cal/catering)`);

    let upserted = 0;
    let errors   = 0;

    if (items.length > 0) {
      const result = await upsertMenuItems(items, { dryRun: isDryRun });
      upserted = result.total;
      errors   = result.errors;
      console.log(`  ${isDryRun ? '[DRY RUN] Would upsert' : 'Upserted'}: ${upserted} items`);
    }

    results.push({
      restaurant,
      adapter:    adapter.name,
      raw:        rawItems.length,
      normalized: items.length,
      skipped,
      upserted,
      errors,
    });

    // Polite delay between restaurants
    await new Promise(r => setTimeout(r, 400));
  }

  return results;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║       SeekEatz Data Ingestion Pipeline               ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (no DB writes)' : '✍️  LIVE (writing to Supabase)'}`);
  console.log(`Batch label: ${BATCH_LABEL}`);
  if (adapterArg) console.log(`Adapter filter: ${adapterArg}`);
  if (restArg)    console.log(`Restaurant filter: ${restArg}`);
  if (adapterArg === 'places' && Number.isFinite(placesLimit)) console.log(`Places limit: ${placesLimit}`);
  if (refreshCache) console.log('Places cache: refresh enabled');
  if (cacheDisabled) console.log('Places cache: disabled');
  console.log('');

  const allResults: RestaurantResult[] = [];

  // ── Google Places enrichment (runs first so restaurants exist before items) ─
  if (adapterArg === 'places') {
    console.log(`\n${'═'.repeat(56)}`);
    console.log('  GOOGLE PLACES — Restaurant enrichment');
    console.log(`${'═'.repeat(56)}`);
    console.log('  Enriching all un-enriched restaurants in the DB...');
    await enrichAllDbRestaurants({
      dryRun: isDryRun,
      limit: Number.isFinite(placesLimit) ? placesLimit : undefined,
      refreshCache,
      cacheEnabled: !cacheDisabled,
    });
    console.log('\nPlaces enrichment complete.');
    return;
  }

  // ── Nutritionix ────────────────────────────────────────────────────────────
  if (!adapterArg || adapterArg === 'nutritionix') {
    if (NUTRITIONIX_RESTAURANTS.length > 0) {
      console.log(`\n${'═'.repeat(56)}`);
      console.log(`  NUTRITIONIX — ${NUTRITIONIX_RESTAURANTS.length} restaurants`);
      console.log(`${'═'.repeat(56)}`);

      const adapter = createNutritionixAdapter();
      const results = await runAdapter(adapter, NUTRITIONIX_RESTAURANTS, BATCH_LABEL);
      allResults.push(...results);
    } else {
      console.log('\n[nutritionix] No restaurants configured — skipping');
    }
  }

  // ── FatSecret ──────────────────────────────────────────────────────────────
  if (!adapterArg || adapterArg === 'fatsecret') {
    if (FATSECRET_RESTAURANTS.length > 0) {
      console.log(`\n${'═'.repeat(56)}`);
      console.log(`  FATSECRET — ${FATSECRET_RESTAURANTS.length} restaurants`);
      console.log(`${'═'.repeat(56)}`);

      const adapter = createFatSecretAdapter();
      const results = await runAdapter(adapter, FATSECRET_RESTAURANTS, BATCH_LABEL);
      allResults.push(...results);
    } else {
      console.log('\n[fatsecret] No restaurants configured — skipping');
    }
  }

  // ── Scraper ────────────────────────────────────────────────────────────────
  if (!adapterArg || adapterArg === 'scraper') {
    const scraperRestaurants = Object.keys(SCRAPER_TARGETS);
    if (scraperRestaurants.length > 0) {
      console.log(`\n${'═'.repeat(56)}`);
      console.log(`  SCRAPER — ${scraperRestaurants.length} restaurants`);
      console.log(`${'═'.repeat(56)}`);

      const adapter = createScraperAdapter(SCRAPER_TARGETS);
      const results = await runAdapter(adapter, scraperRestaurants, BATCH_LABEL);
      allResults.push(...results);
    } else {
      console.log('\n[scraper] No URLs configured — skipping');
    }
  }

  // ── AI Estimator ───────────────────────────────────────────────────────────
  if (!adapterArg || adapterArg === 'ai') {
    const aiRestaurants = Object.keys(AI_ESTIMATOR_TARGETS);
    if (aiRestaurants.length > 0) {
      console.log(`\n${'═'.repeat(56)}`);
      console.log(`  AI ESTIMATOR — ${aiRestaurants.length} restaurants`);
      console.log(`${'═'.repeat(56)}`);

      const adapter = createAIEstimatorAdapter(AI_ESTIMATOR_TARGETS);
      const results = await runAdapter(adapter, aiRestaurants, BATCH_LABEL);
      allResults.push(...results);
    } else {
      console.log('\n[ai-estimator] No restaurants configured — skipping');
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(56)}`);
  console.log('  SUMMARY');
  console.log(`${'═'.repeat(56)}`);

  const totalRaw        = allResults.reduce((s, r) => s + r.raw, 0);
  const totalNormalized = allResults.reduce((s, r) => s + r.normalized, 0);
  const totalSkipped    = allResults.reduce((s, r) => s + r.skipped, 0);
  const totalUpserted   = allResults.reduce((s, r) => s + r.upserted, 0);
  const totalErrors     = allResults.reduce((s, r) => s + r.errors, 0);

  console.log(`  Restaurants processed: ${allResults.length}`);
  console.log(`  Raw items fetched:     ${totalRaw}`);
  console.log(`  Normalized (kept):     ${totalNormalized}`);
  console.log(`  Skipped (filtered):    ${totalSkipped}`);
  console.log(`  ${isDryRun ? 'Would upsert' : 'Upserted to DB'}:   ${totalUpserted}`);
  if (totalErrors > 0) console.log(`  ⚠️  Errors:             ${totalErrors}`);

  console.log('');

  if (allResults.some(r => r.errors > 0)) {
    const failed = allResults.filter(r => r.errors > 0).map(r => r.restaurant);
    console.log(`Failed restaurants: ${failed.join(', ')}`);
  }

  console.log(isDryRun ? '\nDry run complete — no data was written.' : '\nIngestion complete ✓');
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
