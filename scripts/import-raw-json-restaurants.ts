import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { normalizeItems, explainSkipReason } from './ingest/normalizer';
import { upsertMenuItems } from './ingest/upserter';
import type { RawIngestionItem } from './ingest/types';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type RawJsonItem = {
  name?: string;
  category?: string | null;
  price_estimate?: number | null;
  image_url?: string | null;
  description?: string | null;
  macros?: {
    calories?: number | string | null;
    protein?: number | string | null;
    carbs?: number | string | null;
    fat?: number | string | null;
  } | null;
};

type RawJsonRestaurantFile = {
  restaurant_name?: string;
  items?: RawJsonItem[];
};

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const listSkips = args.includes('--list-skips');
const batchLabel = args.find((value) => value.startsWith('--batch-label='))?.split('=')[1] ?? 'raw-json-import';
const requestedRestaurants = args
  .filter((value) => value.startsWith('--restaurant='))
  .flatMap((value) => value.split('=')[1]?.split(',') ?? [])
  .map((value) => value.trim())
  .filter(Boolean);

function normalizeLookup(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/['.,-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyPriceLabel(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Reject numeric-only names like "9.99" or "$12.49" which are almost always bad labels.
  return /^\$?\d+(?:\.\d{1,2})?$/.test(trimmed);
}

function getTargetFiles(): Array<{ filePath: string; restaurantName: string; items: RawJsonItem[] }> {
  const jsonDir = path.resolve(process.cwd(), 'data', 'jsons');
  const files = fs.readdirSync(jsonDir).filter((file) => file.endsWith('_raw.json')).sort();

  const requestedSet = new Set(requestedRestaurants.map(normalizeLookup));
  const matches: Array<{ filePath: string; restaurantName: string; items: RawJsonItem[] }> = [];

  for (const file of files) {
    const filePath = path.join(jsonDir, file);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as RawJsonRestaurantFile;
    const restaurantName = parsed.restaurant_name?.trim();
    if (!restaurantName || !Array.isArray(parsed.items)) {
      continue;
    }

    if (requestedSet.size > 0 && !requestedSet.has(normalizeLookup(restaurantName))) {
      continue;
    }

    matches.push({
      filePath,
      restaurantName,
      items: parsed.items,
    });
  }

  return matches;
}

function mapRawItem(restaurantName: string, item: RawJsonItem): RawIngestionItem | null {
  const name = item.name?.trim();
  if (!name) {
    return null;
  }
  if (isLikelyPriceLabel(name)) {
    return null;
  }

  return {
    source: 'manual',
    restaurantName,
    name,
    description: item.description ?? undefined,
    calories: Number(item.macros?.calories ?? 0),
    protein_g: Number(item.macros?.protein ?? 0),
    carbs_g: Number(item.macros?.carbs ?? 0),
    fat_g: Number(item.macros?.fat ?? 0),
    rawCategory: item.category ?? undefined,
    price: typeof item.price_estimate === 'number' ? item.price_estimate : undefined,
    imageUrl: item.image_url ?? undefined,
    sourceConfidence: 0.8,
  };
}

async function main() {
  const targetFiles = getTargetFiles();

  if (targetFiles.length === 0) {
    const requested = requestedRestaurants.length > 0
      ? requestedRestaurants.join(', ')
      : '(none)';
    throw new Error(`No matching raw JSON restaurants found for: ${requested}`);
  }

  console.log(`[import-raw-json] Mode: ${isDryRun ? 'dry-run' : 'live'}`);
  console.log(`[import-raw-json] Batch label: ${batchLabel}`);
  console.log(`[import-raw-json] Restaurants: ${targetFiles.map((entry) => entry.restaurantName).join(', ')}`);

  let totalNormalized = 0;
  let totalSkipped = 0;
  let totalUpserted = 0;
  let totalErrors = 0;

  for (const target of targetFiles) {
    const rawItems = target.items
      .map((item) => mapRawItem(target.restaurantName, item))
      .filter((item): item is RawIngestionItem => item !== null);

    const normalizeOptions = {
      batchLabel,
      calorieFloor: 150,
      skipLargePortions: true,
      skipModifiers: false,
      skipDrinks: false,
    };

    const { items, skipped } = normalizeItems(rawItems, normalizeOptions);

    if (listSkips && skipped > 0) {
      console.log('  Skipped items:');
      for (const rawItem of rawItems) {
        const reason = explainSkipReason(rawItem, normalizeOptions);
        if (reason) {
          const calories = Number(rawItem.calories ?? rawItem.macros?.calories ?? 0);
          console.log(`    • ${rawItem.name} — ${reason}${calories ? `, ${calories} cal` : ''}`);
        }
      }
    }

    console.log(`\n[import-raw-json] ${target.restaurantName}`);
    console.log(`  Raw items: ${rawItems.length}`);
    console.log(`  Normalized: ${items.length}`);
    console.log(`  Skipped: ${skipped}`);

    totalNormalized += items.length;
    totalSkipped += skipped;

    if (items.length === 0) {
      continue;
    }

    const result = await upsertMenuItems(items, { dryRun: isDryRun });
    totalUpserted += result.total;
    totalErrors += result.errors;

    console.log(`  ${isDryRun ? 'Would upsert' : 'Upserted'}: ${result.total}`);
    if (result.errors > 0) {
      console.log(`  Errors: ${result.errors}`);
    }
  }

  console.log('\n[import-raw-json] Summary');
  console.log(`  Restaurants processed: ${targetFiles.length}`);
  console.log(`  Normalized items: ${totalNormalized}`);
  console.log(`  Skipped items: ${totalSkipped}`);
  console.log(`  ${isDryRun ? 'Would upsert' : 'Upserted'} rows: ${totalUpserted}`);
  console.log(`  Errors: ${totalErrors}`);
}

main().catch((error) => {
  console.error('[import-raw-json] fatal error:', error);
  process.exit(1);
});
