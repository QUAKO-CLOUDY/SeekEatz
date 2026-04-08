import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type Row = {
  id: string | number;
  restaurant_name: string | null;
  name: string | null;
  category: string | null;
  item_type: string | null;
  is_searchable: boolean | null;
  macros: unknown;
};

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
  return (value ?? '').trim() || '(blank)';
}

function isLikelyMeal(row: Row): boolean {
  const name = normalize(row.name).toLowerCase();
  const category = normalize(row.category).toLowerCase();
  const mealSignals = [
    /\b(wrap|sandwich|burger|bowl|salad|pizza|pasta|plate|platter|entree|entrée|gyro|taco|burrito|quesadilla|omelet|omelette|pancake|waffle|toast|sub)\b/,
  ];
  const modifierSignals = [
    /\b(sauce|dressing|condiment|dip|topping|cheese|salsa|mayo|mustard|ketchup|aioli|vinaigrette|pesto|ranch|bbq|barbecue sauce)\b/,
    /^(add|extra|side of|cup of)\b/,
  ];

  if (modifierSignals.some((pattern) => pattern.test(name)) || modifierSignals.some((pattern) => pattern.test(category))) {
    return false;
  }

  return mealSignals.some((pattern) => pattern.test(name)) || mealSignals.some((pattern) => pattern.test(category));
}

async function fetchWarningRows(): Promise<Row[]> {
  const supabase = createSupabaseClient();
  const pageSize = 1000;
  const rows: Row[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, restaurant_name, name, category, item_type, is_searchable, macros')
      .eq('is_searchable', true)
      .not('item_type', 'in', '("meal","drink")')
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to fetch warning rows: ${error.message}`);
    }

    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < pageSize) {
      break;
    }
  }

  return rows;
}

function topCounts(rows: Row[], getKey: (row: Row) => string, limit = 25) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

async function main() {
  const rows = await fetchWarningRows();
  const likelyMeals = rows.filter(isLikelyMeal);
  const likelyModifiers = rows.filter((row) => !isLikelyMeal(row));

  console.log(`Searchable non-card rows: ${rows.length}`);
  console.log(`Likely mislabeled meals: ${likelyMeals.length}`);
  console.log(`Likely true modifiers/non-cards: ${likelyModifiers.length}`);

  console.log('\nTop item_type counts:');
  for (const [key, count] of topCounts(rows, (row) => normalize(row.item_type))) {
    console.log(`${String(count).padStart(4)}  ${key}`);
  }

  console.log('\nTop restaurant counts:');
  for (const [key, count] of topCounts(rows, (row) => normalize(row.restaurant_name))) {
    console.log(`${String(count).padStart(4)}  ${key}`);
  }

  console.log('\nTop category counts:');
  for (const [key, count] of topCounts(rows, (row) => normalize(row.category))) {
    console.log(`${String(count).padStart(4)}  ${key}`);
  }

  console.log('\nLikely meal examples:');
  for (const row of likelyMeals.slice(0, 40)) {
    console.log(`${row.id}\t${normalize(row.restaurant_name)}\t${normalize(row.category)}\t${normalize(row.item_type)}\t${normalize(row.name)}`);
  }

  console.log('\nLikely modifier examples:');
  for (const row of likelyModifiers.slice(0, 40)) {
    console.log(`${row.id}\t${normalize(row.restaurant_name)}\t${normalize(row.category)}\t${normalize(row.item_type)}\t${normalize(row.name)}`);
  }
}

main().catch((error) => {
  console.error('[audit-searchable-non-card-rows] fatal error:', error);
  process.exit(1);
});
