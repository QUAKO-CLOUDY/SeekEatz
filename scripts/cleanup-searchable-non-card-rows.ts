import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type MenuItemRow = {
  id: string | number;
  restaurant_name: string | null;
  name: string | null;
  category: string | null;
  item_type: string | null;
  is_searchable: boolean | null;
};

type CleanupPlan = {
  sauceLikeRows: MenuItemRow[];
  smoothieRows: MenuItemRow[];
  untouchedRows: MenuItemRow[];
};

const SAUCE_LIKE_CATEGORIES = new Set([
  '8oz sauces',
  'condiments',
  'dips & flavors',
  'dressing',
  'sauce',
  'sauces & dressings',
  'side sweets, sauces,s',
  'sides, sweets, sauces',
  'topping',
]);

const APPLY = process.env.APPLY === 'true';
const PAGE_SIZE = 1000;
const UPDATE_CHUNK_SIZE = 100;

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

function normalize(value: string | null | undefined) {
  return (value ?? '').trim();
}

function normalizeKey(value: string | null | undefined) {
  return normalize(value).toLowerCase();
}

async function fetchRows(): Promise<MenuItemRow[]> {
  const supabase = createSupabaseClient();
  const rows: MenuItemRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, restaurant_name, name, category, item_type, is_searchable')
      .eq('is_searchable', true)
      .not('item_type', 'in', '("meal","drink")')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch searchable non-card rows: ${error.message}`);
    }

    const page = (data ?? []) as MenuItemRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

function buildCleanupPlan(rows: MenuItemRow[]): CleanupPlan {
  const sauceLikeRows: MenuItemRow[] = [];
  const smoothieRows: MenuItemRow[] = [];
  const untouchedRows: MenuItemRow[] = [];

  for (const row of rows) {
    const category = normalizeKey(row.category);

    if (SAUCE_LIKE_CATEGORIES.has(category)) {
      sauceLikeRows.push(row);
    } else if (category === 'smoothie') {
      smoothieRows.push(row);
    } else {
      untouchedRows.push(row);
    }
  }

  return { sauceLikeRows, smoothieRows, untouchedRows };
}

function printExamples(label: string, rows: MenuItemRow[], limit = 12) {
  console.log(`\n${label}:`);
  for (const row of rows.slice(0, limit)) {
    console.log(
      `${row.id}\t${normalize(row.restaurant_name)}\t${normalize(row.category)}\t${normalize(row.item_type)}\t${normalize(row.name)}`
    );
  }
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function updateRows(
  label: string,
  rows: MenuItemRow[],
  values: Record<string, unknown>
) {
  const supabase = createSupabaseClient();
  const ids = rows.map((row) => row.id);
  let updatedCount = 0;

  for (const idChunk of chunk(ids, UPDATE_CHUNK_SIZE)) {
    const { error } = await supabase
      .from('menu_items')
      .update(values)
      .in('id', idChunk);

    if (error) {
      throw new Error(`Failed to update ${label}: ${error.message}`);
    }

    updatedCount += idChunk.length;
  }

  console.log(`Updated ${updatedCount} ${label}`);
}

async function main() {
  const rows = await fetchRows();
  const plan = buildCleanupPlan(rows);

  console.log(`Searchable non-card rows found: ${rows.length}`);
  console.log(`High-confidence sauce/dressing/topping rows to hide: ${plan.sauceLikeRows.length}`);
  console.log(`Smoothie category rows to reclassify as drink: ${plan.smoothieRows.length}`);
  console.log(`Ambiguous rows intentionally left untouched: ${plan.untouchedRows.length}`);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  printExamples('Rows to hide from meal-card search', plan.sauceLikeRows);
  printExamples('Rows to keep searchable but reclassify as drink', plan.smoothieRows);
  printExamples('Ambiguous rows left for later review', plan.untouchedRows);

  if (!APPLY) {
    console.log('\nDry run only. Re-run with APPLY=true to write these high-confidence updates.');
    return;
  }

  await updateRows('sauce/dressing/topping rows', plan.sauceLikeRows, {
    item_type: 'modifier',
    is_modifier: true,
    is_searchable: false,
  });

  await updateRows('smoothie category rows', plan.smoothieRows, {
    item_type: 'drink',
    is_modifier: false,
    is_searchable: true,
  });
}

main().catch((error) => {
  console.error('[cleanup-searchable-non-card-rows] fatal error:', error);
  process.exit(1);
});
