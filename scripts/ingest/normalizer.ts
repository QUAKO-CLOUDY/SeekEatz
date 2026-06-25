/**
 * SeekEatz Ingestion — Normalizer
 *
 * Converts a RawIngestionItem (from any adapter) into a NormalizedMenuItem
 * that maps directly to the menu_items table columns.
 *
 * Responsibilities:
 *  - Auto-classify item_type, normalized_category, meal_type, food_tags
 *  - Apply calorie floor (skip items < 150 cal — these are add-ons/dressings)
 *  - Apply catering/large-portion filter (skip family meals by default)
 *  - Sanitize text fields
 *  - Generate import_batch_id from batch label + timestamp
 */

import type { RawIngestionItem, NormalizedMenuItem } from './types';
import {
  detectItemType,
  detectFoodTags,
  detectMealType,
  detectNormalizedCategory,
} from './classify';

function detectCuisineType(text: string): string | undefined {
  const lower = text.toLowerCase();
  const cuisines: Array<[string, string]> = [
    ['barbecue', 'barbecue'],
    ['bbq', 'barbecue'],
    ['mexican', 'mexican'],
    ['italian', 'italian'],
    ['mediterranean', 'mediterranean'],
    ['greek', 'greek'],
    ['sushi', 'sushi'],
    ['asian', 'asian'],
    ['thai', 'thai'],
    ['indian', 'indian'],
    ['american', 'american'],
    ['southern', 'southern'],
  ];

  return cuisines.find(([needle]) => lower.includes(needle))?.[1];
}

function detectProteinSource(text: string): string | undefined {
  const lower = text.toLowerCase();
  const proteins = ['chicken', 'steak', 'beef', 'turkey', 'tofu', 'fish', 'shrimp', 'pork', 'egg'];
  return proteins.find((protein) => lower.includes(protein));
}

function detectCookingMethod(text: string): string | undefined {
  const lower = text.toLowerCase();
  const methods = ['grilled', 'fried', 'baked', 'smoked', 'roasted', 'blackened'];
  return methods.find((method) => lower.includes(method));
}

function buildDescriptionShort(name: string, description?: string): string | undefined {
  const candidate = description?.trim() || name.trim();
  if (!candidate) return undefined;
  return candidate.replace(/\s+/g, ' ').slice(0, 160);
}

function buildAliases(name: string, normalizedCategory?: string): string[] | undefined {
  const aliases = new Set<string>();
  const lower = name.toLowerCase();
  aliases.add(lower);

  if (lower.includes('bbq')) aliases.add('barbecue');
  if (lower.includes('barbecue')) aliases.add('bbq');
  if (lower.includes('breakfast sandwich')) aliases.add('breakfast_sandwich');
  if (normalizedCategory) aliases.add(normalizedCategory);

  return aliases.size ? [...aliases] : undefined;
}

function buildDietFlags(name: string, description?: string): string[] | undefined {
  const haystack = `${name} ${description ?? ''}`.toLowerCase();
  const flags = new Set<string>();
  if (haystack.includes('vegan')) flags.add('vegan');
  if (haystack.includes('vegetarian') || haystack.includes('veggie')) flags.add('vegetarian');
  if (haystack.includes('keto')) flags.add('keto');
  if (haystack.includes('gluten free') || haystack.includes('gluten-free')) flags.add('gluten_aware');
  if (haystack.includes('high protein')) flags.add('high_protein');
  if (haystack.includes('low carb')) flags.add('low_carb');
  return flags.size ? [...flags] : undefined;
}

// ─── Config ────────────────────────────────────────────────────────────────────

interface NormalizerOptions {
  /** Unique label for this ingestion run (e.g. "nutritionix-2026-03") */
  batchLabel: string;
  /** Minimum calories for an item to be included (default: 150) */
  calorieFloor?: number;
  /** Skip items tagged as catering/large_portion (default: true) */
  skipLargePortions?: boolean;
  /** Skip items classified as drinks (default: false) */
  skipDrinks?: boolean;
  /** Skip items classified as modifiers (default: true) */
  skipModifiers?: boolean;
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

function sanitize(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return text.trim().replace(/\s+/g, ' ').slice(0, 500) || undefined;
}

function sanitizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 200);
}

function safeNum(val: number | undefined): number | undefined {
  if (val === undefined || val === null) return undefined;
  if (!isFinite(val)) return undefined;
  return Math.round(val * 10) / 10; // 1 decimal place
}

function safeInt(val: number | undefined): number | undefined {
  const n = safeNum(val);
  return n !== undefined ? Math.round(n) : undefined;
}

// ─── Serving size string ───────────────────────────────────────────────────────

function buildServingSize(item: RawIngestionItem): string | undefined {
  if (item.serving_qty && item.serving_unit) {
    return `${item.serving_qty} ${item.serving_unit}`;
  }
  if (item.serving_unit) return item.serving_unit;
  return undefined;
}

// ─── Main normalizer ───────────────────────────────────────────────────────────

export function normalizeItem(
  raw: RawIngestionItem,
  options: NormalizerOptions
): NormalizedMenuItem | null {
  const {
    batchLabel,
    calorieFloor    = 150,
    skipLargePortions = true,
    skipDrinks      = false,
    skipModifiers   = true,
  } = options;

  const name = sanitizeName(raw.name);
  if (!name) return null;

  const calories = safeNum(raw.calories) ?? 0;
  const description = sanitize(raw.description);
  const rawCategory = raw.rawCategory ?? '';
  const item_type = detectItemType(name, description, calories, rawCategory);

  // Calorie floor applies to full meals only — sides/modifiers/drinks stay for swaps.
  if (item_type === 'meal' && calories < calorieFloor) return null;

  if (skipModifiers && item_type === 'modifier') return null;
  if (skipDrinks    && item_type === 'drink')    return null;

  const classificationText = [name, description, rawCategory, raw.rawMealType, raw.restaurantName].filter(Boolean).join(' ');
  const food_tags = detectFoodTags(name, description, calories, rawCategory);

  // ── Skip catering / large portions ────────────────────────────────────────────
  if (skipLargePortions) {
    const hasLargeTag = food_tags.some(t =>
      ['large_portion', 'catering', 'multi_serving'].includes(t)
    );
    if (hasLargeTag) return null;
  }

  // ── Other classifications ─────────────────────────────────────────────────────
  const meal_type           = detectMealType(name, description, raw.rawMealType, rawCategory);
  const normalized_category = detectNormalizedCategory(name, description, rawCategory, raw.restaurantName);
  const cuisine_type        = detectCuisineType(classificationText);
  const protein_source      = detectProteinSource(classificationText);
  const cooking_method      = detectCookingMethod(classificationText);
  const description_short   = buildDescriptionShort(name, description);
  const aliases             = buildAliases(name, normalized_category);
  const diet_flags          = buildDietFlags(name, description);
  const allergen_flags      = raw.allergens?.map((item) => item.toLowerCase().replace(/\s+/g, '_'));
  const tags                = Array.from(
    new Set([
      ...food_tags,
      ...(cuisine_type ? [cuisine_type] : []),
      ...(protein_source ? [protein_source] : []),
      ...(cooking_method ? [cooking_method] : []),
      ...(diet_flags ?? []),
    ])
  );

  // ── Macros ────────────────────────────────────────────────────────────────────
  const macros = {
    calories: Math.round(calories),
    protein:  Math.round(safeNum(raw.protein_g) ?? 0),
    carbs:    Math.round(safeNum(raw.carbs_g)   ?? 0),
    fat:      Math.round(safeNum(raw.fat_g)     ?? 0),
  };

  // ── import_batch_id ────────────────────────────────────────────────────────────
  const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const import_batch_id = `${batchLabel}::${raw.source}::${timestamp}`;

  return {
    restaurant_name:    raw.restaurantName,
    name,
    import_batch_id,
    calories:           macros.calories,
    protein_g:          macros.protein,
    carbs_g:            macros.carbs,
    fat_g:              macros.fat,
    macros,
    fiber_g:            safeNum(raw.fiber_g),
    sugar_g:            safeNum(raw.sugar_g),
    sodium_mg:          safeInt(raw.sodium_mg),
    cholesterol_mg:     safeInt(raw.cholesterol_mg),
    saturated_fat_g:    safeNum(raw.saturated_fat_g),
    trans_fat_g:        safeNum(raw.trans_fat_g),
    serving_size:       buildServingSize(raw),
    serving_unit:       raw.serving_unit,
    item_type,
    normalized_category,
    meal_type,
    food_tags:          food_tags.length > 0 ? food_tags : undefined,
    category:           rawCategory || undefined,
    description_short,
    cuisine_type,
    protein_source,
    cooking_method,
    tags:               tags.length > 0 ? tags : undefined,
    aliases,
    diet_flags,
    allergen_flags,
    description,
    image_url:          raw.imageUrl,
    price_estimate:     raw.price ? Math.round(raw.price * 100) / 100 : undefined,
    allergens:          raw.allergens,
    source_type:        raw.source,
    source_url:         raw.sourceUrl,
    confidence_score:   raw.sourceConfidence ?? 0.75,
    is_verified:        raw.source === 'nutritionix', // Nutritionix data is verified
    is_available:       true,
    last_verified_at:   new Date().toISOString(),
    active_status:      true,
    source_tag:         raw.source,
  };
}

// ─── Batch normalize ──────────────────────────────────────────────────────────

export function normalizeItems(
  rawItems: RawIngestionItem[],
  options: NormalizerOptions
): { items: NormalizedMenuItem[]; skipped: number } {
  let skipped = 0;
  const items: NormalizedMenuItem[] = [];

  for (const raw of rawItems) {
    const normalized = normalizeItem(raw, options);
    if (normalized) {
      items.push(normalized);
    } else {
      skipped++;
    }
  }

  return { items, skipped };
}

/** Why an item would be dropped by normalizeItem (for import diagnostics). */
export function explainSkipReason(
  raw: RawIngestionItem,
  options: NormalizerOptions,
): string | null {
  const {
    calorieFloor = 150,
    skipLargePortions = true,
    skipDrinks = false,
    skipModifiers = true,
  } = options;

  const name = sanitizeName(raw.name);
  if (!name) {
    return 'empty_name';
  }

  const calories = safeNum(raw.calories) ?? 0;
  const description = sanitize(raw.description);
  const rawCategory = raw.rawCategory ?? '';
  const item_type = detectItemType(name, description, calories, rawCategory);

  if (item_type === 'meal' && calories < calorieFloor) {
    return `below_calorie_floor (${calories} < ${calorieFloor})`;
  }

  if (skipModifiers && item_type === 'modifier') {
    return 'modifier';
  }
  if (skipDrinks && item_type === 'drink') {
    return 'drink';
  }

  const food_tags = detectFoodTags(name, description, calories, rawCategory);
  if (skipLargePortions) {
    const largeTag = food_tags.find((tag) =>
      ['large_portion', 'catering', 'multi_serving'].includes(tag),
    );
    if (largeTag) {
      return `large_portion (${largeTag})`;
    }
  }

  return null;
}
