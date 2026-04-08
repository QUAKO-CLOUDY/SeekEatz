import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type MenuItemAuditRow = {
  id: string | number;
  restaurant_name: string | null;
  name: string | null;
  category: string | null;
  item_type: string | null;
  is_searchable: boolean | null;
};

type RelationAuditRow = {
  parent_item_id: string | number | null;
};

const RELATION_ROLLOUT_RESTAURANTS = [
  'Sweetgreen',
  'CAVA',
  "Taziki's Mediterranean Cafe",
  'Chopt Creative Salad Co.',
  'WaBa Grill',
  'QDOBA Mexican Eats',
  'The Habit Burger & Grill',
  'Sweetfin',
  'Smashburger',
  'El Pollo Loco',
  'Pollo Tropical',
  'Cheba Hut',
  'True Food Kitchen',
  'Flower Child',
  'The Original Pancake House',
];

function normalizeRestaurantName(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/['.,-]/g, '')
    .replace(/\b(the|co|company|restaurant|grill|cafe|bar|kitchen)\b/g, ' ')
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

function getRawJsonRestaurantNames(): Array<{ file: string; restaurantName: string }> {
  const jsonDir = path.resolve(process.cwd(), 'data/jsons');
  const files = fs
    .readdirSync(jsonDir)
    .filter((file) => file.endsWith('_raw.json'))
    .sort();

  const restaurants: Array<{ file: string; restaurantName: string }> = [];
  for (const file of files) {
    const fullPath = path.join(jsonDir, file);
    const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as { restaurant_name?: string };
    restaurants.push({
      file,
      restaurantName: parsed.restaurant_name ?? '',
    });
  }

  return restaurants;
}

async function fetchAllRows<T>(
  supabase: ReturnType<typeof createSupabaseClient>,
  table: string,
  select: string,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch ${table}: ${error.message}`);
    }

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }
  }

  return rows;
}

async function main() {
  const supabase = createSupabaseClient();
  const failures: string[] = [];
  const warnings: string[] = [];

  const rows = await fetchAllRows<MenuItemAuditRow>(
    supabase,
    'menu_items',
    'id, restaurant_name, name, category, item_type, is_searchable'
  );
  const searchableRows = rows.filter((row) => row.is_searchable === true);
  const distinctSearchableRestaurants = new Set(
    searchableRows.map((row) => row.restaurant_name).filter(Boolean)
  );

  const duplicateGroups = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.restaurant_name) {
      continue;
    }
    const key = normalizeRestaurantName(row.restaurant_name);
    if (!key) {
      continue;
    }
    const group = duplicateGroups.get(key) ?? new Set<string>();
    group.add(row.restaurant_name);
    duplicateGroups.set(key, group);
  }

  for (const [key, values] of duplicateGroups) {
    if (values.size > 1) {
      failures.push(`duplicate normalized DB restaurant group "${key}": ${Array.from(values).join(' | ')}`);
    }
  }

  const searchableModifierRows = searchableRows.filter((row) => !['meal', 'drink'].includes(row.item_type ?? ''));
  if (searchableModifierRows.length > 0) {
    warnings.push(
      `searchable modifier/non-card rows: ${searchableModifierRows.length}; examples=${searchableModifierRows
        .slice(0, 8)
        .map((row) => `${row.restaurant_name} :: ${row.name} [${row.item_type ?? 'null'}]`)
        .join(' | ')}`
    );
  }

  const moesRows = rows.filter((row) => row.restaurant_name === "Moe's Southwest Grill");
  const moesSearchable = moesRows.filter((row) => row.is_searchable === true);
  if (moesRows.length > 0 && moesSearchable.length !== 0) {
    failures.push(`Moe's Southwest Grill should remain quarantined with 0 searchable rows; got ${moesSearchable.length}`);
  }

  const relationRows = await fetchAllRows<RelationAuditRow>(
    supabase,
    'menu_item_relations',
    'parent_item_id'
  );
  const relationParentIds = new Set(
    relationRows
      .map((row) => String(row.parent_item_id ?? ''))
      .filter(Boolean)
  );

  for (const restaurantName of RELATION_ROLLOUT_RESTAURANTS) {
    const restaurantRows = rows.filter((row) => row.restaurant_name === restaurantName);
    if (restaurantRows.length === 0) {
      warnings.push(`relation rollout restaurant has no menu rows: ${restaurantName}`);
      continue;
    }

    const relationParentCount = restaurantRows.filter((row) => relationParentIds.has(String(row.id))).length;
    if (relationParentCount === 0) {
      failures.push(`relation rollout restaurant has 0 parent rows with relations: ${restaurantName}`);
    }
  }

  const rawRestaurants = getRawJsonRestaurantNames();
  const rawDuplicateGroups = new Map<string, Array<{ file: string; restaurantName: string }>>();
  for (const entry of rawRestaurants) {
    const key = normalizeRestaurantName(entry.restaurantName);
    if (!key) {
      failures.push(`raw JSON missing restaurant_name: ${entry.file}`);
      continue;
    }
    const group = rawDuplicateGroups.get(key) ?? [];
    group.push(entry);
    rawDuplicateGroups.set(key, group);
  }

  for (const [key, group] of rawDuplicateGroups) {
    const names = new Set(group.map((entry) => entry.restaurantName));
    if (names.size > 1) {
      failures.push(
        `duplicate normalized raw JSON restaurant group "${key}": ${group
          .map((entry) => `${entry.file}=${entry.restaurantName}`)
          .join(' | ')}`
      );
    }
  }

  console.log(`Menu rows audited: ${rows.length}`);
  console.log(`Searchable restaurants: ${distinctSearchableRestaurants.size}`);
  console.log(`Searchable modifier/non-card rows: ${searchableModifierRows.length}`);
  console.log(`Moe's rows: ${moesRows.length}`);
  console.log(`Moe's searchable rows: ${moesSearchable.length}`);
  console.log(`Relation rows audited: ${relationParentIds.size} distinct parent ids`);
  console.log(`Raw JSON files audited: ${rawRestaurants.length}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log(`Failures: ${failures.length}`);

  for (const warning of warnings) {
    console.log(`WARN ${warning}`);
  }

  for (const failure of failures) {
    console.log(`FAIL ${failure}`);
  }

  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[audit-db-quality] fatal error:', error);
  process.exit(1);
});
