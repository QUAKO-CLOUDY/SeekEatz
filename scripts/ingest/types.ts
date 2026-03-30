/**
 * SeekEatz Data Ingestion — Shared Types
 *
 * All three adapters (Nutritionix, Scraper, AI Estimator) produce a
 * RawIngestionItem.  The normalizer converts that into a NormalizedMenuItem
 * which maps 1-to-1 with the menu_items table columns.
 */

// ─── Raw item coming from any adapter ────────────────────────────────────────

export interface RawIngestionItem {
  /** Adapter that produced this record */
  source: 'nutritionix' | 'scraper' | 'ai_estimator' | 'manual';

  /** Restaurant display name (must match or be upserted into restaurants table) */
  restaurantName: string;

  /** Item display name */
  name: string;

  /** Optional description / ingredients text */
  description?: string;
  sourceUrl?: string;

  /** Core macros — at minimum calories is required */
  calories: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;

  /** Extended nutrition */
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  cholesterol_mg?: number;
  saturated_fat_g?: number;
  trans_fat_g?: number;

  /** Serving info */
  serving_qty?: number;
  serving_unit?: string;

  /** Optional category hint from the source (e.g. "Burgers", "Salads") */
  rawCategory?: string;

  /** Menu section / meal period hint (e.g. "Breakfast", "Dinner") */
  rawMealType?: string;

  /** Price in USD */
  price?: number;

  /** Image URL from source */
  imageUrl?: string;

  /** Allergen list */
  allergens?: string[];

  /** Source-specific external ID (for dedup / refresh) */
  externalId?: string;

  /** How confident is this data? (0–1). Nutritionix = 0.95, scraper = 0.80, AI = 0.65 */
  sourceConfidence?: number;
}

// ─── Normalized record ready for DB upsert ───────────────────────────────────

export interface NormalizedMenuItem {
  // required
  restaurant_name:      string;
  name:                 string;
  import_batch_id:      string;

  // macros jsonb
  macros: {
    calories: number;
    protein:  number;
    carbs:    number;
    fat:      number;
  };

  // extended nutrition (dedicated columns)
  fiber_g?:             number;
  sugar_g?:             number;
  sodium_mg?:           number;
  cholesterol_mg?:      number;
  saturated_fat_g?:     number;
  trans_fat_g?:         number;

  // serving
  serving_size?:        string;
  serving_unit?:        string;

  // classification
  item_type:            'meal' | 'side' | 'drink' | 'snack' | 'modifier';
  normalized_category?: string;
  meal_type:            'breakfast' | 'lunch' | 'dinner' | 'brunch' | 'snack' | 'all_day';
  food_tags?:           string[];
  category?:            string;
  description_short?:   string;
  cuisine_type?:        string;
  protein_source?:      string;
  cooking_method?:      string;
  tags?:                string[];
  aliases?:             string[];
  diet_flags?:          string[];
  allergen_flags?:      string[];

  // metadata
  description?:         string;
  image_url?:           string;
  price_estimate?:      number;
  allergens?:           string[];
  source_type?:         string;
  source_url?:          string;
  confidence_score:     number;
  is_verified:          boolean;
  is_available:         boolean;
  last_verified_at?:    string;
  active_status?:       boolean;
  source_tag?:          string;  // stored in import_batch_id prefix
}

// ─── Ingestion run config ─────────────────────────────────────────────────────

export interface IngestConfig {
  /** Which adapter(s) to run */
  adapters: Array<'nutritionix' | 'scraper' | 'ai_estimator'>;

  /** Target restaurant names to ingest */
  restaurants: string[];

  /** Unique label for this batch (used as import_batch_id prefix) */
  batchLabel?: string;

  /** Dry run — normalize & log but don't write to DB */
  dryRun?: boolean;

  /** Stop on first error per restaurant, or skip and continue */
  continueOnError?: boolean;
}

// ─── Adapter interface ────────────────────────────────────────────────────────

export interface IngestAdapter {
  name: string;
  fetch(restaurantName: string): Promise<RawIngestionItem[]>;
}
