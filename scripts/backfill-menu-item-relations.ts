import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials in .env.local');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const SINGLE_RESTAURANT = process.env.SINGLE_RESTAURANT?.trim();

type MenuItemRow = {
  id: number;
  restaurant_name: string;
  name: string;
  category: string | null;
  item_type: string | null;
  is_modifier: boolean | null;
  is_searchable: boolean | null;
  modifier_unit_label: string | null;
  modifier_unit_default_qty: number | null;
  modifier_unit_max_qty: number | null;
};

type MenuItemUpdate = Partial<MenuItemRow> & { id: number };

type RelationType =
  | 'add_on'
  | 'side_option'
  | 'sauce_option'
  | 'dressing_option'
  | 'protein_option'
  | 'egg_swap'
  | 'swap_candidate';

type RelationRow = {
  parent_item_id: number;
  child_item_id: number;
  relation_type: RelationType;
  group_name: string;
  min_quantity: number;
  default_quantity: number;
  max_quantity: number;
  sort_order: number;
  metadata: Record<string, unknown>;
};

type RelationTemplate = {
  mealCategoryPatterns?: RegExp[];
  mealNamePatterns?: RegExp[];
  childCategoryPatterns?: RegExp[];
  childNamePatterns?: RegExp[];
  childExcludeNamePatterns?: RegExp[];
  relationType: RelationType;
  groupName: string;
  minQuantity?: number;
  defaultQuantity?: number;
  maxQuantity?: number;
  metadata?: Record<string, unknown>;
};

type RestaurantRuleSet = {
  relationTemplates: RelationTemplate[];
};

function normalize(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function matchesAny(value: string, patterns?: RegExp[]): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }
  return patterns.some((pattern) => pattern.test(value));
}

function inferMenuItemUpdate(item: MenuItemRow): MenuItemUpdate | null {
  const category = normalize(item.category);
  const name = normalize(item.name);

  const next: MenuItemUpdate = { id: item.id };

  const apply = (patch: Omit<MenuItemUpdate, 'id'>) => {
    Object.assign(next, patch);
  };

  if (/dressings?/.test(category) || /dressing|vinaigrette|ranch|aioli|mustard|sauce/.test(name)) {
    apply({
      item_type: /sauce/.test(category) ? 'sauce' : 'modifier',
      is_modifier: true,
      is_searchable: false,
      modifier_unit_label: 'serving',
      modifier_unit_default_qty: 1,
      modifier_unit_max_qty: 3,
    });
  } else if (/sauce/.test(category)) {
    apply({
      item_type: 'sauce',
      is_modifier: true,
      is_searchable: false,
      modifier_unit_label: 'serving',
      modifier_unit_default_qty: 1,
      modifier_unit_max_qty: 3,
    });
  } else if (/protein add-on|protein add on|protein|add ons|add-ons|add on|add-on|range-add-ons|mains|bowl add-ons/.test(category)) {
    apply({
      item_type: 'modifier',
      is_modifier: true,
      is_searchable: false,
      modifier_unit_label: 'portion',
      modifier_unit_default_qty: 1,
      modifier_unit_max_qty: 2,
    });
  } else if (/dips \+ spreads|toppings|greens \+ grains/.test(category)) {
    apply({
      item_type: 'modifier',
      is_modifier: true,
      is_searchable: false,
      modifier_unit_label: /greens \+ grains/.test(category) ? 'base' : 'portion',
      modifier_unit_default_qty: 1,
      modifier_unit_max_qty: 2,
    });
  } else if (/sides meats/.test(category)) {
    const eggCountMatch = name.match(/\b(\d+)\s+eggs?\b/);
    apply({
      item_type: 'modifier',
      is_modifier: true,
      is_searchable: false,
      modifier_unit_label: /bacon|sausage|links|slices/.test(name) ? 'serving' : 'portion',
      modifier_unit_default_qty: 1,
      modifier_unit_max_qty: 2,
    });
    if (eggCountMatch) {
      apply({
        modifier_unit_label: 'egg',
        modifier_unit_default_qty: 1,
        modifier_unit_max_qty: Number.parseInt(eggCountMatch[1], 10),
      });
    }
  } else if (/sandwich sides|sides other|sides$/.test(category)) {
    apply({
      item_type: 'side',
      is_modifier: true,
      is_searchable: false,
      modifier_unit_label: 'side',
      modifier_unit_default_qty: 1,
      modifier_unit_max_qty: 1,
    });
  } else if (/^other$/.test(category) && /^\d+\s+eggs?\b/.test(name)) {
    const eggCountMatch = name.match(/\b(\d+)\s+eggs?\b/);
    apply({
      item_type: 'modifier',
      is_modifier: true,
      is_searchable: false,
      modifier_unit_label: 'egg',
      modifier_unit_default_qty: 1,
      modifier_unit_max_qty: eggCountMatch ? Number.parseInt(eggCountMatch[1], 10) : 2,
    });
  } else {
    apply({
      item_type: item.item_type === 'meal' || !item.item_type ? 'meal' : item.item_type,
      is_modifier: false,
      is_searchable: true,
      modifier_unit_label: null,
      modifier_unit_default_qty: null,
      modifier_unit_max_qty: null,
    });
  }

  const changed = (
    item.item_type !== (next.item_type ?? item.item_type) ||
    item.is_modifier !== (next.is_modifier ?? item.is_modifier) ||
    item.is_searchable !== (next.is_searchable ?? item.is_searchable) ||
    item.modifier_unit_label !== (next.modifier_unit_label ?? item.modifier_unit_label) ||
    item.modifier_unit_default_qty !== (next.modifier_unit_default_qty ?? item.modifier_unit_default_qty) ||
    item.modifier_unit_max_qty !== (next.modifier_unit_max_qty ?? item.modifier_unit_max_qty)
  );

  return changed ? next : null;
}

const RESTAURANT_RULES: Record<string, RestaurantRuleSet> = {
  'The Original Pancake House': {
    relationTemplates: [
      {
        mealCategoryPatterns: [/^pancakes$/i, /^waffles$/i, /^specialties$/i],
        childCategoryPatterns: [/^sides meats$/i, /^range-add-ons$/i],
        childNamePatterns: [
          /bacon \(2 slices\)/i,
          /turkey bacon \(2 slices\)/i,
          /sausage patty \(1 ea\)/i,
          /sausage links \(2 ea\)/i,
          /turkey sausage links \(2 ea\)/i,
          /canadian bacon \(2 slices/i,
          /ham add-on/i,
          /turkey add-on/i,
          /chicken add-on/i,
        ],
        relationType: 'add_on',
        groupName: 'Breakfast Add-ons',
        maxQuantity: 2,
      },
      {
        mealCategoryPatterns: [/^traditional favorites$/i, /^omelettes$/i, /^benedicts$/i],
        childCategoryPatterns: [/^sides meats$/i],
        childNamePatterns: [
          /bacon \(2 slices\)/i,
          /turkey bacon \(2 slices\)/i,
          /sausage patty \(1 ea\)/i,
          /sausage links \(2 ea\)/i,
          /turkey sausage links \(2 ea\)/i,
          /canadian bacon \(2 slices/i,
          /ham steak/i,
          /chorizo patty \(1 ea\)/i,
        ],
        relationType: 'side_option',
        groupName: 'Breakfast Sides',
        maxQuantity: 2,
      },
      {
        mealCategoryPatterns: [/^traditional favorites$/i, /^omelettes$/i, /^benedicts$/i],
        childCategoryPatterns: [/^other$/i],
        childNamePatterns: [/^\d+\s+eggs?\b/i],
        relationType: 'egg_swap',
        groupName: 'Egg Adjustments',
        maxQuantity: 3,
      },
      {
        mealCategoryPatterns: [/^sandwiches$/i, /^other sandwiches$/i, /^half \+ half$/i, /^our really big create-a-club$/i],
        childCategoryPatterns: [/^sandwich sides$/i],
        childNamePatterns: [/potatoes|chips|salad|soup/i],
        relationType: 'side_option',
        groupName: 'Sandwich Sides',
      },
      {
        mealCategoryPatterns: [/^sandwiches$/i, /^other sandwiches$/i, /^half \+ half$/i, /^our really big create-a-club$/i],
        childCategoryPatterns: [/^dressings$/i],
        relationType: 'dressing_option',
        groupName: 'Dressings',
      },
      {
        mealCategoryPatterns: [/^sandwiches$/i, /^other sandwiches$/i, /^half \+ half$/i, /^our really big create-a-club$/i],
        childCategoryPatterns: [/^range-add-ons$/i],
        relationType: 'protein_option',
        groupName: 'Protein Add-ons',
        maxQuantity: 2,
      },
    ],
  },
  CAVA: {
    relationTemplates: [
      {
        mealCategoryPatterns: [/^curated bowls$/i, /^curated pitas$/i],
        childCategoryPatterns: [/^mains$/i],
        relationType: 'protein_option',
        groupName: 'Proteins',
        maxQuantity: 2,
      },
      {
        mealCategoryPatterns: [/^curated bowls$/i, /^curated pitas$/i],
        childCategoryPatterns: [/^dressings$/i, /^dips \+ spreads$/i],
        relationType: 'sauce_option',
        groupName: 'Sauces',
        maxQuantity: 3,
      },
      {
        mealCategoryPatterns: [/^curated bowls$/i],
        childCategoryPatterns: [/^toppings$/i, /^greens \+ grains$/i],
        relationType: 'add_on',
        groupName: 'Toppings',
        maxQuantity: 3,
      },
    ],
  },
  'True Food Kitchen': {
    relationTemplates: [
      {
        mealCategoryPatterns: [/^bowls$/i, /^salads$/i],
        childCategoryPatterns: [/^bowl add-ons$/i],
        relationType: 'protein_option',
        groupName: 'Protein Add-ons',
        maxQuantity: 2,
      },
      {
        mealCategoryPatterns: [/^entrees$/i, /^burgers & sandwiches$/i, /^starters$/i],
        childCategoryPatterns: [/^sides$/i],
        childExcludeNamePatterns: [/vinaigrette|sauce|ranch|ketchup|crunch/i],
        relationType: 'side_option',
        groupName: 'Sides',
      },
      {
        mealCategoryPatterns: [/^bowls$/i, /^salads$/i, /^starters$/i, /^burgers & sandwiches$/i],
        childCategoryPatterns: [/^sides$/i],
        childNamePatterns: [/vinaigrette|sauce|ranch|ketchup|crunch/i],
        relationType: 'sauce_option',
        groupName: 'Sauces',
        maxQuantity: 3,
      },
      {
        mealCategoryPatterns: [/^starters$/i],
        mealNamePatterns: [/guacamole|hummus/i],
        childCategoryPatterns: [/^starters$/i],
        childNamePatterns: [/sub veggies/i],
        relationType: 'swap_candidate',
        groupName: 'Starter Swaps',
        maxQuantity: 1,
      },
    ],
  },
  'Flower Child': {
    relationTemplates: [
      {
        mealCategoryPatterns: [/^bowls$/i, /^salads$/i, /^wraps$/i],
        childCategoryPatterns: [/^proteins$/i],
        relationType: 'protein_option',
        groupName: 'Protein Options',
        maxQuantity: 2,
      },
      {
        mealCategoryPatterns: [/^bowls$/i, /^wraps$/i, /^soups$/i],
        childCategoryPatterns: [/^sides$/i],
        relationType: 'side_option',
        groupName: 'Sides',
      },
      {
        mealCategoryPatterns: [/^to start$/i],
        mealNamePatterns: [/hummus|avocado toast|queso/i],
        childCategoryPatterns: [/^to start$/i],
        childNamePatterns: [/add raw veggies|sub gluten-free pita/i],
        childExcludeNamePatterns: [/includes pita/i],
        relationType: 'add_on',
        groupName: 'Starter Add-ons',
        maxQuantity: 2,
      },
      {
        mealCategoryPatterns: [/^wraps$/i],
        childCategoryPatterns: [/^to start$/i],
        childNamePatterns: [/sub gluten-free pita/i],
        relationType: 'swap_candidate',
        groupName: 'Wrap Swaps',
        maxQuantity: 1,
      },
    ],
  },
  'North Italia': {
    relationTemplates: [
      {
        mealCategoryPatterns: [/^entree$/i, /^salad$/i, /^appetizer$/i],
        childCategoryPatterns: [/^protein add-on$/i],
        relationType: 'protein_option',
        groupName: 'Protein Add-ons',
        maxQuantity: 2,
      },
      {
        mealCategoryPatterns: [/^entree$/i, /^salad$/i, /^appetizer$/i],
        childCategoryPatterns: [/^sauce$/i],
        relationType: 'sauce_option',
        groupName: 'Sauces',
        maxQuantity: 2,
      },
    ],
  },
};

function buildRelationsForRestaurant(items: MenuItemRow[], rules: RestaurantRuleSet): RelationRow[] {
  const relations = new Map<string, RelationRow>();

  for (const template of rules.relationTemplates) {
    const meals = items.filter((item) => {
      const category = item.category || '';
      const name = item.name || '';
      return (
        (template.mealCategoryPatterns ? matchesAny(category, template.mealCategoryPatterns) : true) &&
        (template.mealNamePatterns ? matchesAny(name, template.mealNamePatterns) : true)
      );
    });

    const children = items.filter((item) => {
      const category = item.category || '';
      const name = item.name || '';
      return (
        (template.childCategoryPatterns ? matchesAny(category, template.childCategoryPatterns) : true) &&
        (template.childNamePatterns ? matchesAny(name, template.childNamePatterns) : true) &&
        !(template.childExcludeNamePatterns ? matchesAny(name, template.childExcludeNamePatterns) : false)
      );
    });

    for (const meal of meals) {
      for (const child of children) {
        if (meal.id === child.id) {
          continue;
        }
        const key = `${meal.id}:${child.id}:${template.relationType}`;
        relations.set(key, {
          parent_item_id: meal.id,
          child_item_id: child.id,
          relation_type: template.relationType,
          group_name: template.groupName,
          min_quantity: template.minQuantity ?? 0,
          default_quantity: template.defaultQuantity ?? 1,
          max_quantity: template.maxQuantity ?? 1,
          sort_order: 0,
          metadata: template.metadata ?? {},
        });
      }
    }
  }

  return Array.from(relations.values());
}

async function ensureSchemaReady(): Promise<void> {
  const { error: menuItemsError } = await supabase
    .from('menu_items')
    .select('id, is_searchable, modifier_unit_label, modifier_unit_default_qty, modifier_unit_max_qty')
    .limit(1);

  if (menuItemsError) {
    throw new Error(
      'The new menu_items metadata columns are not available yet. Apply migration 20260401000013_menu_item_relations.sql first.'
    );
  }

  const { error: relationsError } = await supabase
    .from('menu_item_relations')
    .select('id')
    .limit(1);

  if (relationsError) {
    throw new Error(
      'The menu_item_relations table is not available yet. Apply migration 20260401000013_menu_item_relations.sql first.'
    );
  }
}

async function fetchRestaurantItems(restaurantName: string): Promise<MenuItemRow[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select(`
      id,
      restaurant_name,
      name,
      category,
      item_type,
      is_modifier,
      is_searchable,
      modifier_unit_label,
      modifier_unit_default_qty,
      modifier_unit_max_qty
    `)
    .eq('restaurant_name', restaurantName)
    .order('name');

  if (error) {
    throw new Error(`Failed to fetch menu items for ${restaurantName}: ${error.message}`);
  }

  return data as MenuItemRow[];
}

async function upsertMenuItemUpdates(
  updates: MenuItemUpdate[]
): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  for (const update of updates) {
    const payload = {
      item_type: update.item_type,
      is_modifier: update.is_modifier,
      is_searchable: update.is_searchable,
      modifier_unit_label: update.modifier_unit_label,
      modifier_unit_default_qty: update.modifier_unit_default_qty,
      modifier_unit_max_qty: update.modifier_unit_max_qty,
    };

    const { error } = await supabase
      .from('menu_items')
      .update(payload)
      .eq('id', update.id);

    if (error) {
      throw new Error(`Failed to update menu_items metadata for item ${update.id}: ${error.message}`);
    }
  }
}

async function replaceRestaurantRelations(restaurantName: string, relationRows: RelationRow[]): Promise<void> {
  const items = await fetchRestaurantItems(restaurantName);
  const itemIds = items.map((item) => item.id);

  if (itemIds.length === 0) {
    return;
  }

  const { error: deleteError } = await supabase
    .from('menu_item_relations')
    .delete()
    .in('parent_item_id', itemIds);

  if (deleteError) {
    throw new Error(`Failed to clear existing relations for ${restaurantName}: ${deleteError.message}`);
  }

  if (relationRows.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from('menu_item_relations')
    .upsert(relationRows, {
      onConflict: 'parent_item_id,child_item_id,relation_type',
      ignoreDuplicates: false,
    });

  if (insertError) {
    throw new Error(`Failed to write relations for ${restaurantName}: ${insertError.message}`);
  }
}

async function main() {
  await ensureSchemaReady();

  const targetRestaurants = SINGLE_RESTAURANT
    ? Object.keys(RESTAURANT_RULES).filter((name) => name === SINGLE_RESTAURANT)
    : Object.keys(RESTAURANT_RULES);

  if (targetRestaurants.length === 0) {
    throw new Error(
      SINGLE_RESTAURANT
        ? `No relation rules configured for ${SINGLE_RESTAURANT}`
        : 'No restaurants configured for backfill'
    );
  }

  console.log(`[relations] mode=${DRY_RUN ? 'dry-run' : 'write'} restaurants=${targetRestaurants.join(', ')}`);

  for (const restaurantName of targetRestaurants) {
    const items = await fetchRestaurantItems(restaurantName);
    const updates = items
      .map((item) => inferMenuItemUpdate(item))
      .filter((update): update is MenuItemUpdate => update !== null);
    const relations = buildRelationsForRestaurant(items, RESTAURANT_RULES[restaurantName]);

    console.log(
      `[relations] ${restaurantName}: items=${items.length} metadata_updates=${updates.length} relations=${relations.length}`
    );

    if (DRY_RUN) {
      console.log('[relations] sample updates:', updates.slice(0, 5));
      console.log('[relations] sample relations:', relations.slice(0, 5));
      continue;
    }

    await upsertMenuItemUpdates(updates);
    await replaceRestaurantRelations(restaurantName, relations);
  }

  console.log('[relations] done');
}

main().catch((error) => {
  console.error('[relations] failed:', error);
  process.exit(1);
});
