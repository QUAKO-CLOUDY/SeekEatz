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

const APPLY = process.env.APPLY === 'true';
const PAGE_SIZE = 1000;
const UPDATE_CHUNK_SIZE = 100;

const MEAL_LIKE_CATEGORIES = new Set([
  'appatizer',
  'appetizer',
  'appetizers',
  'breakfast',
  'burgers in paradise',
  'entree',
  'entrees',
  'flatbread',
  'garlic herb bread blunt size (12")',
  'garlic herb bread nug size (4")',
  'garlic herb bread pinner size (8")',
  'gluten sensitive',
  'happy hour small plates',
  'makin’ muscle',
  "makin' muscle",
  'may we suggest',
  'pasta',
  'salad',
  'salads & soup',
  'sandwich',
  'small plate',
  'soups & more',
  'soups & salad',
  'specialties',
  'value menu',
  'wraps',
]);

const SIDE_LIKE_CATEGORIES = new Set([
  'protein',
  'sides',
]);

const OBVIOUS_NON_MEAL_NAME_PATTERN =
  /(^side of\b|^cup of\b|^coleslaw,|^garlic bread\b|\b(blue cheese cup|caesar salad dressing|balsamic salad dressing|sauce trio|cane's sauce|side house|egg white|fries \(no ketchup\)|sweet potato fries|pretzel bites|pickle chips|cookie|sunchips)\b)/i;

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
      throw new Error(`Failed to fetch ambiguous searchable rows: ${error.message}`);
    }

    const page = (data ?? []) as MenuItemRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

function isObviousNonMeal(row: MenuItemRow) {
  const name = normalize(row.name);
  const category = normalizeKey(row.category);
  if (normalizeKey(row.restaurant_name) === "raising cane's" && normalizeKey(row.name) === 'chicken finger') {
    return true;
  }

  return OBVIOUS_NON_MEAL_NAME_PATTERN.test(name) || SIDE_LIKE_CATEGORIES.has(category);
}

function isExplicitMealException(row: MenuItemRow) {
  return normalizeKey(row.restaurant_name) === "raising cane's" && normalizeKey(row.name) === 'sandwich';
}

function buildPlan(rows: MenuItemRow[]) {
  const promoteMeals: MenuItemRow[] = [];
  const hideNonCards: MenuItemRow[] = [];
  const needsReview: MenuItemRow[] = [];

  for (const row of rows) {
    const category = normalizeKey(row.category);

    if (isExplicitMealException(row)) {
      promoteMeals.push(row);
    } else if (isObviousNonMeal(row)) {
      hideNonCards.push(row);
    } else if (MEAL_LIKE_CATEGORIES.has(category)) {
      promoteMeals.push(row);
    } else {
      needsReview.push(row);
    }
  }

  return { promoteMeals, hideNonCards, needsReview };
}

function printExamples(label: string, rows: MenuItemRow[], limit = 40) {
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

async function updateRows(label: string, rows: MenuItemRow[], values: Record<string, unknown>) {
  const supabase = createSupabaseClient();
  let updatedCount = 0;

  for (const idChunk of chunk(rows.map((row) => row.id), UPDATE_CHUNK_SIZE)) {
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
  const plan = buildPlan(rows);

  console.log(`Ambiguous searchable non-card rows found: ${rows.length}`);
  console.log(`High-confidence meals to promote: ${plan.promoteMeals.length}`);
  console.log(`Obvious sides/snacks/add-ons to hide: ${plan.hideNonCards.length}`);
  console.log(`Rows requiring manual review: ${plan.needsReview.length}`);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  printExamples('Promote to meal', plan.promoteMeals);
  printExamples('Hide from meal-card search', plan.hideNonCards);
  printExamples('Still needs review', plan.needsReview);

  if (!APPLY) {
    console.log('\nDry run only. Re-run with APPLY=true to write these updates.');
    return;
  }

  await updateRows('meal rows', plan.promoteMeals, {
    item_type: 'meal',
    is_modifier: false,
    is_searchable: true,
  });

  await updateRows('non-card rows', plan.hideNonCards, {
    is_searchable: false,
  });
}

main().catch((error) => {
  console.error('[cleanup-ambiguous-searchable-rows] fatal error:', error);
  process.exit(1);
});
