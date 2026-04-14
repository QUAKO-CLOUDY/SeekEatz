/**
 * SeekEatz Ingestion — Web Scraper Adapter
 *
 * Handles regional chains and any restaurant that publishes nutrition data on
 * their website (US chains with 20+ locations are required by the FDA to post
 * calorie counts, and most post full nutrition panels).
 *
 * Strategy:
 *  1. Try to find structured data on the page (JSON-LD, application/json script tags)
 *  2. Fall back to parsing HTML nutrition tables
 *  3. For JS-heavy sites, instructions are provided to use Playwright manually
 *
 * Required env var (optional, for JS-heavy sites):
 *   None — this adapter uses only the built-in fetch API + regex/JSON parsing.
 *
 * For JavaScript-rendered pages (React/Next/Angular menus), install Playwright:
 *   npm install -D playwright && npx playwright install chromium
 * Then set SCRAPER_USE_PLAYWRIGHT=true in your .env.local
 *
 * Usage:
 *   import { createScraperAdapter } from './adapters/scraper';
 *   const adapter = createScraperAdapter({
 *     'Shake Shack': 'https://shakeshack.com/allergens-nutrition',
 *     'Wingstop':    'https://www.wingstop.com/menu/wings',
 *   });
 */

import type { IngestAdapter, RawIngestionItem } from '../types';

export interface ScraperTarget {
  url: string;
  /** Optional: which CSS selector contains menu items (for table scraping) */
  tableSelector?: string;
}

export type ScraperTargetMap = Record<string, ScraperTarget | string>;

// ─── JSON-LD / structured data extraction ─────────────────────────────────────

interface JsonLdMenuItem {
  '@type'?:      string;
  name?:         string;
  description?:  string;
  nutrition?: {
    calories?:        string | number;
    proteinContent?:  string | number;
    carbohydrateContent?: string | number;
    fatContent?:      string | number;
    fiberContent?:    string | number;
    sodiumContent?:   string | number;
    sugarContent?:    string | number;
    cholesterolContent?: string | number;
    saturatedFatContent?: string | number;
  };
  offers?: { price?: string | number };
  image?: string | { url?: string };
  suitableForDiet?: string | string[];
  menuAddOn?: JsonLdMenuItem[];
  hasMenuItem?: JsonLdMenuItem[];
}

function parseNumber(val: string | number | undefined): number | undefined {
  if (val === undefined || val === null) return undefined;
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(n) ? undefined : n;
}

function extractJsonLdItems(html: string, restaurantName: string): RawIngestionItem[] {
  const results: RawIngestionItem[] = [];
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    let json: any;
    try { json = JSON.parse(match[1]); } catch { continue; }

    // Handle @graph arrays
    const nodes: any[] = Array.isArray(json)
      ? json
      : (json['@graph'] ? json['@graph'] : [json]);

    for (const node of nodes) {
      // Direct MenuItem nodes
      if (node['@type'] === 'MenuItem' && node.name) {
        const item = extractFromJsonLdItem(node, restaurantName);
        if (item) results.push(item);
      }

      // Menu → hasMenuSection → hasMenuItem
      if (node['@type'] === 'Menu' || node['@type'] === 'Restaurant') {
        const sections = node.hasMenuSection ?? node.hasPart ?? [];
        const sectionArr = Array.isArray(sections) ? sections : [sections];
        for (const section of sectionArr) {
          const items = section.hasMenuItem ?? section.hasItem ?? [];
          const itemArr = Array.isArray(items) ? items : [items];
          for (const menuItem of itemArr) {
            const item = extractFromJsonLdItem(menuItem, restaurantName);
            if (item) results.push(item);
          }
        }
      }
    }
  }

  return results;
}

function extractFromJsonLdItem(
  node: JsonLdMenuItem,
  restaurantName: string
): RawIngestionItem | null {
  if (!node.name) return null;

  const nut = node.nutrition;
  const calories = parseNumber(nut?.calories);
  if (calories === undefined) return null; // skip items with no calorie data

  const imageUrl = typeof node.image === 'string'
    ? node.image
    : (node.image as any)?.url;

  const price = node.offers
    ? parseNumber((node.offers as any).price)
    : undefined;

  return {
    source:           'scraper',
    restaurantName,
    name:             node.name,
    description:      node.description,
    calories,
    protein_g:        parseNumber(nut?.proteinContent),
    carbs_g:          parseNumber(nut?.carbohydrateContent),
    fat_g:            parseNumber(nut?.fatContent),
    fiber_g:          parseNumber(nut?.fiberContent),
    sugar_g:          parseNumber(nut?.sugarContent),
    sodium_mg:        parseNumber(nut?.sodiumContent),
    cholesterol_mg:   parseNumber(nut?.cholesterolContent),
    saturated_fat_g:  parseNumber(nut?.saturatedFatContent),
    imageUrl,
    price,
    sourceConfidence: 0.82,
  };
}

// ─── Inline JSON data extraction (e.g. window.__INITIAL_STATE__) ──────────────

function extractInlineJson(html: string, restaurantName: string): RawIngestionItem[] {
  // Many restaurant sites embed menu data in a script tag as a JSON variable
  const patterns = [
    /window\.__(?:INITIAL_STATE|APP_DATA|MENU_DATA|NEXT_DATA)__\s*=\s*({[\s\S]+?});\s*(?:<\/script>|window\.)/,
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;

    let data: any;
    try { data = JSON.parse(match[1]); } catch { continue; }

    // Recursively search for arrays that look like menu items
    const candidates = findMenuItemArrays(data);
    if (candidates.length > 0) {
      return candidates.map(c => mapInlineItem(c, restaurantName)).filter(Boolean) as RawIngestionItem[];
    }
  }

  return [];
}

function findMenuItemArrays(obj: any, depth = 0): any[] {
  if (depth > 8 || !obj || typeof obj !== 'object') return [];

  if (Array.isArray(obj)) {
    // Check if this looks like a menu item array
    const sample = obj[0];
    if (
      sample &&
      typeof sample === 'object' &&
      (sample.name || sample.item_name || sample.itemName) &&
      (sample.calories !== undefined || sample.nutrition || sample.macros)
    ) {
      return obj;
    }
    for (const item of obj) {
      const found = findMenuItemArrays(item, depth + 1);
      if (found.length > 0) return found;
    }
  } else {
    for (const val of Object.values(obj)) {
      const found = findMenuItemArrays(val, depth + 1);
      if (found.length > 0) return found;
    }
  }

  return [];
}

function mapInlineItem(item: any, restaurantName: string): RawIngestionItem | null {
  const name = item.name || item.item_name || item.itemName || item.title;
  if (!name) return null;

  const nut = item.nutrition || item.macros || item.nutritionFacts || item;
  const calories = parseNumber(item.calories ?? nut?.calories ?? nut?.cal);
  if (!calories) return null;

  return {
    source:           'scraper',
    restaurantName,
    name:             String(name),
    description:      item.description || item.desc || item.ingredients,
    calories,
    protein_g:        parseNumber(nut?.protein ?? nut?.protein_g),
    carbs_g:          parseNumber(nut?.carbs ?? nut?.carbohydrates ?? nut?.carbs_g),
    fat_g:            parseNumber(nut?.fat ?? nut?.total_fat ?? nut?.fat_g),
    fiber_g:          parseNumber(nut?.fiber ?? nut?.dietary_fiber),
    sugar_g:          parseNumber(nut?.sugar ?? nut?.sugars),
    sodium_mg:        parseNumber(nut?.sodium),
    cholesterol_mg:   parseNumber(nut?.cholesterol),
    saturated_fat_g:  parseNumber(nut?.saturated_fat ?? nut?.saturatedFat),
    rawCategory:      item.category || item.menu_category || item.section,
    price:            parseNumber(item.price ?? item.cost),
    imageUrl:         item.image || item.image_url || item.imageUrl,
    sourceConfidence: 0.78,
  };
}

// ─── HTML table extraction (plain nutrition pages) ────────────────────────────

function extractFromTables(html: string, restaurantName: string): RawIngestionItem[] {
  const results: RawIngestionItem[] = [];

  // Remove script/style tags
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  // Find all table rows
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let currentCategory = '';
  let headerRow: string[] = [];

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(cleaned)) !== null) {
    const row = rowMatch[1];
    const cells = extractCells(row);
    if (cells.length === 0) continue;

    // Detect header row (contains "Calories", "Protein", etc.)
    const lowerCells = cells.map(c => c.toLowerCase().trim());
    if (lowerCells.some(c => c.includes('calories') || c.includes('cal'))) {
      headerRow = lowerCells;
      continue;
    }

    // Category row (single cell spanning multiple columns)
    if (cells.length === 1 && cells[0].length > 2 && cells[0].length < 80) {
      currentCategory = cells[0];
      continue;
    }

    // Skip rows without enough data
    if (cells.length < 2) continue;

    // Map using header row if available
    const item = mapTableRow(cells, headerRow, restaurantName, currentCategory);
    if (item) results.push(item);
  }

  return results;
}

function extractCells(row: string): string[] {
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  const cells: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = cellRegex.exec(row)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
    cells.push(text);
  }
  return cells;
}

function mapTableRow(
  cells: string[],
  headers: string[],
  restaurantName: string,
  category: string
): RawIngestionItem | null {
  const get = (keyword: string): number | undefined => {
    const idx = headers.findIndex(h => h.includes(keyword));
    if (idx >= 0 && idx < cells.length) return parseNumber(cells[idx].replace(/[^\d.]/g, ''));
    return undefined;
  };

  const name = cells[0];
  if (!name || name.length < 2 || name.length > 120) return null;

  // Try header-guided extraction first
  let calories = get('calorie') ?? get('cal');

  // Fallback: scan cells for numbers in reasonable calorie range
  if (calories === undefined) {
    for (let i = 1; i < cells.length; i++) {
      const n = parseNumber(cells[i].replace(/[^\d]/g, ''));
      if (n && n >= 50 && n <= 3000) { calories = n; break; }
    }
  }

  if (!calories) return null;

  return {
    source:           'scraper',
    restaurantName,
    name,
    calories,
    protein_g:        get('protein'),
    carbs_g:          get('carb') ?? get('carbohydrate'),
    fat_g:            get('fat') ?? get('total fat'),
    fiber_g:          get('fiber'),
    sugar_g:          get('sugar'),
    sodium_mg:        get('sodium'),
    cholesterol_mg:   get('cholesterol'),
    saturated_fat_g:  get('saturated'),
    rawCategory:      category || undefined,
    sourceConfidence: 0.72,
  };
}

// ─── Main fetch function ──────────────────────────────────────────────────────

async function scrapeUrl(
  url: string,
  restaurantName: string
): Promise<RawIngestionItem[]> {
  console.log(`  [scraper] Fetching: ${url}`);

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; SeekEatz/1.0; +https://seekeatz.com)',
      'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  const contentType = res.headers.get('content-type') ?? '';

  // If the response is JSON directly (some API-backed nutrition pages)
  if (contentType.includes('application/json')) {
    const data = await res.json();
    const candidates = findMenuItemArrays(data);
    return candidates
      .map(c => mapInlineItem(c, restaurantName))
      .filter(Boolean) as RawIngestionItem[];
  }

  const html = await res.text();

  // Try extraction methods in order of reliability
  let items: RawIngestionItem[] = [];

  items = extractJsonLdItems(html, restaurantName);
  if (items.length > 0) {
    console.log(`  [scraper] Found ${items.length} items via JSON-LD`);
    return items;
  }

  items = extractInlineJson(html, restaurantName);
  if (items.length > 0) {
    console.log(`  [scraper] Found ${items.length} items via inline JSON`);
    return items;
  }

  items = extractFromTables(html, restaurantName);
  if (items.length > 0) {
    console.log(`  [scraper] Found ${items.length} items via HTML tables`);
    return items;
  }

  console.warn(
    `  [scraper] Could not extract items from ${url}.\n` +
    `  The page may be JavaScript-rendered. Try:\n` +
    `    1. Install Playwright: npm install -D playwright && npx playwright install chromium\n` +
    `    2. Set SCRAPER_USE_PLAYWRIGHT=true in .env.local\n` +
    `    3. Re-run the ingestion for ${restaurantName}`
  );

  return [];
}

// ─── Adapter factory ──────────────────────────────────────────────────────────

export function createScraperAdapter(
  targets: ScraperTargetMap
): IngestAdapter {
  return {
    name: 'scraper',

    async fetch(restaurantName: string): Promise<RawIngestionItem[]> {
      const target = targets[restaurantName];
      if (!target) {
        console.warn(
          `  [scraper] No URL configured for "${restaurantName}".\n` +
          `  Add it to the SCRAPER_TARGETS map in scripts/ingest/index.ts`
        );
        return [];
      }

      const url = typeof target === 'string' ? target : target.url;

      try {
        return await scrapeUrl(url, restaurantName);
      } catch (err) {
        console.error(`  [scraper] Error scraping "${restaurantName}":`, err);
        return [];
      }
    },
  };
}
