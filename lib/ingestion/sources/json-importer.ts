/**
 * JSON Source Importer
 *
 * Reads the existing data/jsons/*.json restaurant files and upserts
 * them into Supabase as normalized menu items.
 *
 * JSON format:
 * {
 *   "restaurant_name": "Chipotle Mexican Grill",
 *   "items": [
 *     { "name": "...", "category": "...", "price_estimate": 10.99,
 *       "image_url": null,
 *       "macros": { "calories": 650, "protein": 25, "carbs": 80, "fat": 22 } }
 *   ]
 * }
 *
 * Upsert key: (restaurant_name, name) — preserves existing embeddings.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeMenuItem, type RawMenuItem, type MenuItemRecord } from '../normalize';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JSONRestaurantFile {
  restaurant_name: string;
  items: RawMenuItem[];
}

export interface ImportResult {
  restaurantName: string;
  inserted:       number;
  updated:        number;
  skipped:        number;
  failed:         number;
  errors:         string[];
}

// ─── Main importer ────────────────────────────────────────────────────────────

/**
 * Import a single JSON file into Supabase.
 * Looks up the restaurant_id from the restaurants table.
 * Uses upsert on (restaurant_name, name) conflict.
 */
export async function importJSONFile(
  supabase:    SupabaseClient,
  filePath:    string,
  sourceId:    string,
  batchId:     string
): Promise<ImportResult> {
  const result: ImportResult = {
    restaurantName: path.basename(filePath, '.json'),
    inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [],
  };

  // ── Read and parse file ──────────────────────────────────────────────────
  let raw: JSONRestaurantFile;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    raw = JSON.parse(content);
  } catch (err) {
    result.errors.push(`Parse error: ${err}`);
    result.failed++;
    return result;
  }

  if (!raw.restaurant_name || !Array.isArray(raw.items) || raw.items.length === 0) {
    result.errors.push('Invalid file structure: missing restaurant_name or items');
    result.skipped++;
    return result;
  }

  result.restaurantName = raw.restaurant_name;

  // ── Resolve restaurant_id ────────────────────────────────────────────────
  const { data: restaurantRow } = await supabase
    .from('restaurants')
    .select('id')
    .ilike('name', raw.restaurant_name)
    .single();

  const restaurantId: string | undefined = restaurantRow?.id;

  // ── Normalize all items ──────────────────────────────────────────────────
  const normalized: MenuItemRecord[] = raw.items
    .filter(item => item.name && item.name.trim().length > 0)
    .map(item => normalizeMenuItem(item, raw.restaurant_name, restaurantId, sourceId));

  if (normalized.length === 0) {
    result.skipped = raw.items.length;
    return result;
  }

  // ── Batch upsert (chunks of 100 to stay within Supabase limits) ──────────
  const CHUNK_SIZE = 100;
  for (let i = 0; i < normalized.length; i += CHUNK_SIZE) {
    const chunk = normalized.slice(i, i + CHUNK_SIZE).map(item => ({
      ...item,
      import_batch_id: batchId,
    }));

    const { data, error, count } = await supabase
      .from('menu_items')
      .upsert(chunk, {
        onConflict:        'restaurant_name,name',
        ignoreDuplicates:  false,  // update existing rows
        count:             'exact',
      });

    if (error) {
      result.errors.push(`Upsert error (chunk ${i}): ${error.message}`);
      result.failed += chunk.length;
    } else {
      // Supabase doesn't distinguish insert vs update in upsert
      // We track all as "updated" since most will be re-importing existing data
      result.updated += chunk.length;
    }
  }

  return result;
}

/**
 * Import all JSON files in a directory.
 */
export async function importAllJSONFiles(
  supabase:   SupabaseClient,
  jsonDir:    string,
  sourceId:   string,
  batchId:    string,
  onProgress?: (result: ImportResult, fileIndex: number, total: number) => void
): Promise<ImportResult[]> {
  const files = fs.readdirSync(jsonDir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(jsonDir, f));

  const results: ImportResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const result = await importJSONFile(supabase, files[i], sourceId, batchId);
    results.push(result);
    onProgress?.(result, i, files.length);
  }

  return results;
}

/**
 * Summarize import results
 */
export function summarizeResults(results: ImportResult[]) {
  return {
    totalRestaurants: results.length,
    totalInserted:    results.reduce((s, r) => s + r.inserted, 0),
    totalUpdated:     results.reduce((s, r) => s + r.updated, 0),
    totalSkipped:     results.reduce((s, r) => s + r.skipped, 0),
    totalFailed:      results.reduce((s, r) => s + r.failed, 0),
    errors:           results.flatMap(r => r.errors.map(e => `[${r.restaurantName}] ${e}`)),
  };
}
