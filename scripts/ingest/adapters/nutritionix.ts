/**
 * SeekEatz Ingestion — Nutritionix Adapter
 *
 * Covers national chains (1,000+ restaurants) with verified, FDA-compliant
 * nutrition data.  Requires a free Nutritionix Track API account.
 *
 * Sign up: https://developer.nutritionix.com/signup
 * Docs:    https://docx.syndigo.com/developers/docs/get-started-with-the-nutritionix-api
 *
 * Required env vars:
 *   NUTRITIONIX_APP_ID  — from your Nutritionix dashboard
 *   NUTRITIONIX_APP_KEY — from your Nutritionix dashboard
 *
 * Rate limits (free tier):
 *   - 500 requests / day
 *   - Recommend 300ms delay between restaurant fetches
 */

import type { IngestAdapter, RawIngestionItem } from '../types';

const BASE_URL = 'https://trackapi.nutritionix.com/v2';

interface NutritionixBrand {
  id: string;
  name: string;
  type: number; // 1 = restaurant, 2 = grocery
  website?: string;
}

interface NutritionixItem {
  food_name:              string;
  brand_name:             string;
  serving_qty:            number;
  serving_unit:           string;
  serving_weight_grams?:  number;
  nf_calories:            number;
  nf_total_fat?:          number;
  nf_saturated_fat?:      number;
  nf_cholesterol?:        number;
  nf_sodium?:             number;
  nf_total_carbohydrate?: number;
  nf_dietary_fiber?:      number;
  nf_sugars?:             number;
  nf_protein?:            number;
  nf_potassium?:          number;
  photo?: { thumb?: string };
  nix_item_id?:           string;
  nix_brand_id?:          string;
  allergens?:             string[];
  tags?: { meal_type?: number[] };
}

function getHeaders(): Record<string, string> {
  const appId  = process.env.NUTRITIONIX_APP_ID;
  const appKey = process.env.NUTRITIONIX_APP_KEY;

  if (!appId || !appKey) {
    throw new Error(
      'Missing Nutritionix credentials.\n' +
      'Set NUTRITIONIX_APP_ID and NUTRITIONIX_APP_KEY in your .env.local file.\n' +
      'Get them free at: https://developer.nutritionix.com/signup'
    );
  }

  return {
    'x-app-id':      appId,
    'x-app-key':     appKey,
    'Content-Type':  'application/json',
  };
}

// ── Step 1: Find brand ID by restaurant name ──────────────────────────────────

async function findBrand(restaurantName: string): Promise<NutritionixBrand | null> {
  const url = `${BASE_URL}/brand/search?q=${encodeURIComponent(restaurantName)}&limit=5`;
  const res = await fetch(url, { headers: getHeaders() });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Nutritionix brand search failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const brands: NutritionixBrand[] = data.brands ?? [];

  // Prefer exact match (case-insensitive) and restaurant type (type=1)
  const exact = brands.find(
    b => b.name.toLowerCase() === restaurantName.toLowerCase() && b.type === 1
  );
  if (exact) return exact;

  // Fallback: closest restaurant brand
  const anyRestaurant = brands.find(b => b.type === 1);
  return anyRestaurant ?? null;
}

// ── Step 2: Fetch all menu items for a brand ──────────────────────────────────

async function fetchItemsForBrand(
  brandId: string,
  restaurantName: string,
  limit = 200
): Promise<NutritionixItem[]> {
  // Nutritionix instant search with brand filter returns up to 50 items per call.
  // We page through by running multiple searches with different query seeds.
  const allItems: NutritionixItem[] = [];
  const seen = new Set<string>();

  const querySeeds = [
    '', 'chicken', 'beef', 'salad', 'sandwich', 'burger', 'breakfast',
    'pasta', 'pizza', 'soup', 'fish', 'veggie', 'rice', 'bowl',
  ];

  for (const seed of querySeeds) {
    if (allItems.length >= limit) break;

    const params = new URLSearchParams({
      query:    seed || '*',
      branded:  'true',
      common:   'false',
      self:     'false',
      detailed: 'true',
      nix_brand_id: brandId,
    });

    const url = `${BASE_URL}/search/instant?${params}`;

    try {
      const res = await fetch(url, { headers: getHeaders() });
      if (!res.ok) continue;

      const data = await res.json();
      const items: NutritionixItem[] = data.branded ?? [];

      for (const item of items) {
        const key = `${item.brand_name}::${item.food_name}`;
        if (!seen.has(key)) {
          seen.add(key);
          allItems.push(item);
        }
      }

      // Polite delay between seed queries
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.warn(`  [nutritionix] seed "${seed}" failed for ${restaurantName}:`, err);
    }
  }

  return allItems;
}

// ── Main adapter ──────────────────────────────────────────────────────────────

function mapMealTypeTag(tags?: { meal_type?: number[] }): string | undefined {
  // Nutritionix meal_type: 1=breakfast, 2=lunch, 3=dinner, 4=snack
  const mt = tags?.meal_type?.[0];
  if (mt === 1) return 'breakfast';
  if (mt === 2) return 'lunch';
  if (mt === 3) return 'dinner';
  if (mt === 4) return 'snack';
  return undefined;
}

export function createNutritionixAdapter(): IngestAdapter {
  return {
    name: 'nutritionix',

    async fetch(restaurantName: string): Promise<RawIngestionItem[]> {
      console.log(`  [nutritionix] Searching for brand: "${restaurantName}"`);

      const brand = await findBrand(restaurantName);
      if (!brand) {
        console.warn(`  [nutritionix] Brand not found: "${restaurantName}"`);
        return [];
      }

      console.log(`  [nutritionix] Found brand: "${brand.name}" (id: ${brand.id})`);
      console.log(`  [nutritionix] Fetching menu items...`);

      const rawItems = await fetchItemsForBrand(brand.id, restaurantName);
      console.log(`  [nutritionix] Got ${rawItems.length} items`);

      return rawItems.map((item): RawIngestionItem => ({
        source:           'nutritionix',
        restaurantName:   brand.name, // use canonical brand name
        name:             item.food_name,
        calories:         item.nf_calories ?? 0,
        protein_g:        item.nf_protein,
        carbs_g:          item.nf_total_carbohydrate,
        fat_g:            item.nf_total_fat,
        fiber_g:          item.nf_dietary_fiber,
        sugar_g:          item.nf_sugars,
        sodium_mg:        item.nf_sodium,
        cholesterol_mg:   item.nf_cholesterol,
        saturated_fat_g:  item.nf_saturated_fat,
        serving_qty:      item.serving_qty,
        serving_unit:     item.serving_unit,
        imageUrl:         item.photo?.thumb,
        externalId:       item.nix_item_id,
        rawMealType:      mapMealTypeTag(item.tags),
        sourceConfidence: 0.95, // Nutritionix data is verified against actual labels
      }));
    },
  };
}
