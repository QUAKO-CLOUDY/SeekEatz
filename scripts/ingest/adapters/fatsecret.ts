/**
 * SeekEatz Ingestion — FatSecret Adapter
 *
 * FatSecret Platform API has one of the largest food databases available,
 * with verified restaurant items from hundreds of chains. It's a strong
 * complement to Nutritionix — many regional chains appear in FatSecret
 * but not Nutritionix, and vice versa.
 *
 * Sign up (free): https://platform.fatsecret.com/api/
 * Docs:           https://platform.fatsecret.com/api/Default.aspx?screen=rapih
 *
 * Required env vars:
 *   FATSECRET_CLIENT_ID      — from your FatSecret developer dashboard
 *   FATSECRET_CLIENT_SECRET  — from your FatSecret developer dashboard
 *
 * Rate limits (free tier):
 *   - 5,000 API calls / day
 *   - More than enough for large-scale ingestion
 *
 * Auth: OAuth 2.0 Client Credentials (token auto-refreshes in this adapter)
 */

import type { IngestAdapter, RawIngestionItem } from '../types';

const TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
const API_URL   = 'https://platform.fatsecret.com/rest/server.api';

// ─── Token management ─────────────────────────────────────────────────────────

interface TokenCache {
  token:     string;
  expiresAt: number; // epoch ms
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const clientId     = process.env.FATSECRET_CLIENT_ID;
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing FatSecret credentials.\n' +
      'Set FATSECRET_CLIENT_ID and FATSECRET_CLIENT_SECRET in .env.local\n' +
      'Sign up free at: https://platform.fatsecret.com/api/'
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=basic',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`FatSecret token request failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  tokenCache = {
    token:     data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 86400) * 1000,
  };

  return tokenCache.token;
}

// ─── API call helper ──────────────────────────────────────────────────────────

async function apiCall(params: Record<string, string>): Promise<any> {
  const token = await getAccessToken();

  const url = new URL(API_URL);
  url.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${token}` },
    signal:  AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`FatSecret API error (${res.status}): ${body}`);
  }

  return res.json();
}

// ─── FatSecret types ──────────────────────────────────────────────────────────

interface FSFood {
  food_id:          string;
  food_name:        string;
  food_type:        string; // 'Brand' for restaurant items
  brand_name?:      string;
  food_description: string; // e.g. "Per 1 serving - Calories: 350kcal | Fat: 12g | Carbs: 45g | Protein: 18g"
  food_url?:        string;
}

interface FSFoodDetail {
  food_id:    string;
  food_name:  string;
  brand_name?: string;
  food_type:  string;
  servings: {
    serving: FSServing | FSServing[];
  };
}

interface FSServing {
  serving_id:         string;
  serving_description: string;
  serving_url?:       string;
  metric_serving_amount?: string;
  metric_serving_unit?:   string;
  number_of_units?:   string;
  measurement_description?: string;
  calories:           string;
  carbohydrate?:      string;
  protein?:           string;
  fat?:               string;
  saturated_fat?:     string;
  trans_fat?:         string;
  cholesterol?:       string;
  sodium?:            string;
  fiber?:             string;
  sugar?:             string;
  vitamin_a?:         string;
  vitamin_c?:         string;
  calcium?:           string;
  iron?:              string;
}

// ─── Parse the food_description shorthand ────────────────────────────────────
// e.g. "Per 1 Serving - Calories: 350kcal | Fat: 12.00g | Carbs: 45.00g | Protein: 18.00g"

function parseDescription(desc: string): Partial<FSServing> {
  const cal  = desc.match(/Calories:\s*([\d.]+)/i)?.[1];
  const fat  = desc.match(/Fat:\s*([\d.]+)/i)?.[1];
  const carb = desc.match(/Carbs:\s*([\d.]+)/i)?.[1];
  const prot = desc.match(/Protein:\s*([\d.]+)/i)?.[1];
  return {
    calories:      cal  ?? '0',
    fat:           fat,
    carbohydrate:  carb,
    protein:       prot,
  };
}

// ─── Search for food items by restaurant name (paginated) ─────────────────────

async function searchFoods(
  restaurantName: string,
  maxPages = 10
): Promise<FSFood[]> {
  const allFoods: FSFood[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < maxPages; page++) {
    const data = await apiCall({
      method:            'foods.search',
      search_expression: restaurantName,
      page_number:       String(page),
      max_results:       '50',
    });

    const results = data?.foods;
    if (!results) break;

    const foods: FSFood[] = Array.isArray(results.food)
      ? results.food
      : results.food ? [results.food] : [];

    if (foods.length === 0) break;

    for (const food of foods) {
      // Only include branded/restaurant items whose brand matches our restaurant
      if (food.food_type === 'Brand' && food.brand_name) {
        const brandLower = food.brand_name.toLowerCase();
        const restLower  = restaurantName.toLowerCase();
        // Fuzzy brand match
        if (
          brandLower.includes(restLower) ||
          restLower.includes(brandLower) ||
          brandLower.replace(/[^a-z0-9]/g, '').includes(restLower.replace(/[^a-z0-9]/g, ''))
        ) {
          if (!seen.has(food.food_id)) {
            seen.add(food.food_id);
            allFoods.push(food);
          }
        }
      }
    }

    // If we got fewer than 50 results this page, we've hit the end
    if (foods.length < 50) break;

    await new Promise(r => setTimeout(r, 150));
  }

  return allFoods;
}

// ─── Get detailed nutrition for a single food item ───────────────────────────

async function getFoodDetail(foodId: string): Promise<FSFoodDetail | null> {
  try {
    const data = await apiCall({
      method:  'food.get.v4',
      food_id: foodId,
    });
    return data?.food ?? null;
  } catch {
    return null;
  }
}

// ─── Map a FatSecret serving to RawIngestionItem ─────────────────────────────

function mapServingToItem(
  food:           FSFood | FSFoodDetail,
  serving:        FSServing,
  restaurantName: string
): RawIngestionItem | null {
  const calories = parseFloat(serving.calories);
  if (!calories || calories < 10) return null;

  const brandName = (food as any).brand_name ?? restaurantName;

  // Choose the "standard" serving — prefer the first one that isn't an add-on
  const servingDesc = serving.serving_description ?? '';
  const isAddon = /add|extra|side|sauce|dressing/i.test(servingDesc);

  return {
    source:           'nutritionix', // treat FatSecret data at same confidence tier
    restaurantName:   brandName,
    name:             food.food_name,
    calories,
    protein_g:        serving.protein       ? parseFloat(serving.protein)       : undefined,
    carbs_g:          serving.carbohydrate  ? parseFloat(serving.carbohydrate)  : undefined,
    fat_g:            serving.fat           ? parseFloat(serving.fat)           : undefined,
    fiber_g:          serving.fiber         ? parseFloat(serving.fiber)         : undefined,
    sugar_g:          serving.sugar         ? parseFloat(serving.sugar)         : undefined,
    sodium_mg:        serving.sodium        ? parseFloat(serving.sodium)        : undefined,
    cholesterol_mg:   serving.cholesterol   ? parseFloat(serving.cholesterol)   : undefined,
    saturated_fat_g:  serving.saturated_fat ? parseFloat(serving.saturated_fat) : undefined,
    trans_fat_g:      serving.trans_fat     ? parseFloat(serving.trans_fat)     : undefined,
    serving_qty:      serving.number_of_units ? parseFloat(serving.number_of_units) : 1,
    serving_unit:     serving.measurement_description ?? serving.serving_description,
    externalId:       `fatsecret::${food.food_id}::${serving.serving_id}`,
    sourceConfidence: isAddon ? 0.70 : 0.90,
  };
}

// ─── Main adapter ─────────────────────────────────────────────────────────────

export function createFatSecretAdapter(): IngestAdapter {
  return {
    name: 'fatsecret',

    async fetch(restaurantName: string): Promise<RawIngestionItem[]> {
      console.log(`  [fatsecret] Searching for: "${restaurantName}"`);

      // Search for foods matching the restaurant
      const foods = await searchFoods(restaurantName);
      console.log(`  [fatsecret] Found ${foods.length} candidate items`);

      if (foods.length === 0) return [];

      const results: RawIngestionItem[] = [];

      // For items found in search results, we can parse description directly
      // (avoids burning extra API calls for detail lookups on every item)
      for (const food of foods) {
        const quickNutrition = parseDescription(food.food_description);
        const calories = parseFloat(quickNutrition.calories ?? '0');
        if (calories < 10) continue;

        const brandName = food.brand_name ?? restaurantName;

        results.push({
          source:           'nutritionix',
          restaurantName:   brandName,
          name:             food.food_name,
          calories,
          protein_g:        quickNutrition.protein      ? parseFloat(quickNutrition.protein)     : undefined,
          carbs_g:          quickNutrition.carbohydrate ? parseFloat(quickNutrition.carbohydrate) : undefined,
          fat_g:            quickNutrition.fat          ? parseFloat(quickNutrition.fat)          : undefined,
          externalId:       `fatsecret::${food.food_id}`,
          sourceConfidence: 0.88,
        });
      }

      // Optionally enrich a subset with full detail (costs extra API calls)
      // Uncomment the block below to get extended nutrition (fiber, sodium, etc.)
      // for items where the description doesn't have enough data:
      /*
      const needsEnrichment = results.filter(r => !r.fiber_g && !r.sodium_mg).slice(0, 20);
      for (const item of needsEnrichment) {
        const foodId = item.externalId?.split('::')?.[1];
        if (!foodId) continue;

        const detail = await getFoodDetail(foodId);
        if (!detail?.servings) continue;

        const servings = Array.isArray(detail.servings.serving)
          ? detail.servings.serving
          : [detail.servings.serving];
        const primary = servings[0];
        if (!primary) continue;

        item.fiber_g       = primary.fiber        ? parseFloat(primary.fiber)        : undefined;
        item.sugar_g       = primary.sugar        ? parseFloat(primary.sugar)        : undefined;
        item.sodium_mg     = primary.sodium       ? parseFloat(primary.sodium)       : undefined;
        item.cholesterol_mg = primary.cholesterol ? parseFloat(primary.cholesterol)  : undefined;
        item.saturated_fat_g = primary.saturated_fat ? parseFloat(primary.saturated_fat) : undefined;

        await new Promise(r => setTimeout(r, 100));
      }
      */

      console.log(`  [fatsecret] Returning ${results.length} items`);
      return results;
    },
  };
}
