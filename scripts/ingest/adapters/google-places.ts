/**
 * SeekEatz Ingestion — Google Places Enrichment Adapter
 *
 * This adapter does NOT fetch menu items. Instead it enriches your restaurants
 * table with location data, ratings, photos, website URLs, and price tier —
 * data that powers "near me" filtering, restaurant cards, and map views.
 *
 * What it writes to the restaurants table:
 *   - latitude / longitude
 *   - address, city, state, zip_code
 *   - website_url
 *   - google_places_id
 *   - google_rating
 *   - price_tier (1–4, maps to $, $$, $$$, $$$$)
 *   - logo_url / image_url (from Place photos)
 *   - last_enriched_at
 *
 * Sign up: https://console.cloud.google.com/
 * Enable:  Places API (New)
 * Docs:    https://developers.google.com/maps/documentation/places/web-service
 *
 * Required env var:
 *   GOOGLE_PLACES_API_KEY — from Google Cloud Console
 *
 * Cost:
 *   Text Search:   $32.00 per 1,000 requests
 *   Place Details: $17.00 per 1,000 requests
 *   $200 free monthly credit → ~6,200 restaurant lookups/month for free
 *   Well within budget for 100–500 restaurant enrichment run.
 *
 * Run separately from menu ingestion:
 *   npx tsx scripts/ingest/index.ts --adapter=places
 */

import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { syncRestaurantLocation } from '../../lib/restaurant-locations';

const PLACES_BASE = 'https://places.googleapis.com/v1';
const CACHE_TYPE = 'restaurant_google_places';
const DEFAULT_HIT_CACHE_DAYS = 30;
const DEFAULT_MISS_CACHE_DAYS = 7;

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlaceResult {
  id:                   string; // place_id
  displayName?:         { text: string };
  formattedAddress?:    string;
  location?:            { latitude: number; longitude: number };
  websiteUri?:          string;
  rating?:              number;
  priceLevel?:          string; // 'PRICE_LEVEL_INEXPENSIVE' | 'MODERATE' | 'EXPENSIVE' | 'VERY_EXPENSIVE'
  photos?:              Array<{ name: string; widthPx: number; heightPx: number }>;
  regularOpeningHours?: { weekdayDescriptions: string[] };
}

interface EnrichmentResult {
  restaurant:  string;
  found:       boolean;
  placeId?:    string;
  error?:      string;
  cacheStatus?: 'hit' | 'miss' | 'refresh' | 'disabled';
}

interface CacheEnvelope {
  found: boolean;
  place: PlaceResult | null;
}

interface CacheEntryRow {
  id: string;
  results_json: CacheEnvelope | null;
  hit_count: number | null;
}

interface PlacesEnrichmentOptions {
  dryRun?: boolean;
  refreshCache?: boolean;
  cacheEnabled?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    throw new Error(
      'Missing GOOGLE_PLACES_API_KEY in .env.local\n' +
      'Enable the Places API (New) at: https://console.cloud.google.com/'
    );
  }
  return key;
}

function mapPriceLevel(level: string | undefined): number | undefined {
  const map: Record<string, number> = {
    PRICE_LEVEL_FREE:         1,
    PRICE_LEVEL_INEXPENSIVE:  1,
    PRICE_LEVEL_MODERATE:     2,
    PRICE_LEVEL_EXPENSIVE:    3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return level ? map[level] : undefined;
}

function getHitCacheDays(): number {
  const fromEnv = Number(process.env.GOOGLE_PLACES_CACHE_DAYS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_HIT_CACHE_DAYS;
}

function getMissCacheDays(): number {
  const fromEnv = Number(process.env.GOOGLE_PLACES_MISS_CACHE_DAYS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_MISS_CACHE_DAYS;
}

function shouldUseCache(): boolean {
  return process.env.GOOGLE_PLACES_CACHE_DISABLED !== '1';
}

function buildCacheKey(restaurantName: string): string {
  const normalized = restaurantName.trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto
    .createHash('sha256')
    .update(`google_places:${normalized}`)
    .digest('hex');
}

function buildExpiry(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function parseAddressParts(
  formatted: string | undefined
): { address?: string; city?: string; state?: string; zip?: string } {
  if (!formatted) return {};

  // Format: "123 Main St, Dallas, TX 75201, USA"
  const parts = formatted.split(',').map(p => p.trim());

  const address = parts[0];
  const cityPart = parts[1] ?? '';
  const stateZipPart = parts[2] ?? '';
  const stateZipMatch = stateZipPart.match(/([A-Z]{2})\s+(\d{5})/);

  return {
    address,
    city:  cityPart || undefined,
    state: stateZipMatch?.[1],
    zip:   stateZipMatch?.[2],
  };
}

// ─── Build photo URL ──────────────────────────────────────────────────────────

function buildPhotoUrl(
  photoName: string,
  maxWidth: number = 800
): string {
  const apiKey = getApiKey();
  return `${PLACES_BASE}/${photoName}/media?maxWidthPx=${maxWidth}&key=${apiKey}`;
}

// ─── Text Search — find a place by restaurant name ───────────────────────────

async function searchPlace(restaurantName: string): Promise<PlaceResult | null> {
  const apiKey = getApiKey();

  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type':     'application/json',
      'X-Goog-Api-Key':   apiKey,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.location',
        'places.websiteUri',
        'places.rating',
        'places.priceLevel',
        'places.photos',
      ].join(','),
    },
    body: JSON.stringify({
      textQuery:          restaurantName,
      includedType:       'restaurant',
      languageCode:       'en',
      maxResultCount:     1,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Places search failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data?.places?.[0] ?? null;
}

async function readCachedPlace(
  supabase: SupabaseClient,
  restaurantName: string
): Promise<CacheEnvelope | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('cache_entries')
    .select('id, results_json, hit_count')
    .eq('cache_key', buildCacheKey(restaurantName))
    .eq('cache_type', CACHE_TYPE)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .maybeSingle();

  if (error) {
    console.warn(`  [places] Cache read skipped for "${restaurantName}": ${error.message}`);
    return null;
  }

  const row = data as CacheEntryRow | null;
  if (!row?.results_json) {
    return null;
  }

  void supabase
    .from('cache_entries')
    .update({ hit_count: (row.hit_count ?? 0) + 1 })
    .eq('id', row.id);

  return row.results_json;
}

async function writeCachedPlace(
  supabase: SupabaseClient,
  restaurantName: string,
  payload: CacheEnvelope
): Promise<void> {
  const { error } = await supabase
    .from('cache_entries')
    .upsert({
      cache_key: buildCacheKey(restaurantName),
      cache_type: CACHE_TYPE,
      params_json: { restaurantName },
      results_json: payload,
      result_count: payload.found ? 1 : 0,
      expires_at: buildExpiry(payload.found ? getHitCacheDays() : getMissCacheDays()),
      cache_version: 'v2_google_places',
    }, { onConflict: 'cache_key' });

  if (error) {
    console.warn(`  [places] Cache write skipped for "${restaurantName}": ${error.message}`);
  }
}

// ─── Write enrichment to Supabase restaurants table ──────────────────────────

async function enrichRestaurant(
  supabase:       SupabaseClient,
  restaurantName: string,
  place:          PlaceResult,
  dryRun:         boolean
): Promise<void> {
  const addressParts = parseAddressParts(place.formattedAddress);

  // Build photo URL for primary photo
  const photoUrl = place.photos?.[0]
    ? buildPhotoUrl(place.photos[0].name, 800)
    : undefined;

  const update = {
    google_places_id: place.id,
    google_rating:    place.rating,
    price_tier:       mapPriceLevel(place.priceLevel),
    latitude:         place.location?.latitude,
    longitude:        place.location?.longitude,
    address:          addressParts.address,
    city:             addressParts.city,
    state:            addressParts.state,
    zip_code:         addressParts.zip,
    website_url:      place.websiteUri,
    image_url:        photoUrl,
    last_enriched_at: new Date().toISOString(),
  };

  // Remove undefined fields
  const cleanUpdate = Object.entries(update).reduce<Record<string, string | number>>(
    (accumulator, [key, value]) => {
      if (value !== undefined) {
        accumulator[key] = value;
      }
      return accumulator;
    },
    {}
  );

  if (dryRun) {
    console.log(`  [places] DRY RUN — would update "${restaurantName}":`);
    console.log(`    Rating: ${place.rating}, Price: ${place.priceLevel}`);
    console.log(`    Address: ${place.formattedAddress}`);
    console.log(`    Website: ${place.websiteUri ?? 'n/a'}`);
    return;
  }

  const { error } = await supabase
    .from('restaurants')
    .update(cleanUpdate)
    .eq('name', restaurantName);

  if (error) {
    console.warn(`  [places] DB update warning for "${restaurantName}":`, error.message);
    return;
  }

  const { data: restaurantRow, error: restaurantReadError } = await supabase
    .from('restaurants')
    .select('id, name, google_places_id, address, city, state, zip_code, latitude, longitude, last_enriched_at')
    .eq('name', restaurantName)
    .limit(1)
    .maybeSingle();

  if (restaurantReadError) {
    console.warn(`  [places] Location sync read skipped for "${restaurantName}":`, restaurantReadError.message);
    return;
  }

  if (restaurantRow?.id) {
    try {
      await syncRestaurantLocation(supabase, restaurantRow, { dryRun });
    } catch (locationError) {
      console.warn(
        `  [places] Location sync warning for "${restaurantName}":`,
        locationError instanceof Error ? locationError.message : String(locationError)
      );
    }
  }
}

// ─── Main enrichment runner ───────────────────────────────────────────────────

export async function enrichRestaurantsWithPlaces(
  restaurantNames: string[],
  options: PlacesEnrichmentOptions = {}
): Promise<EnrichmentResult[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase credentials for Google Places enrichment.');
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results: EnrichmentResult[] = [];
  const cacheEnabled = options.cacheEnabled ?? shouldUseCache();

  for (const name of restaurantNames) {
    console.log(`  [places] Looking up: "${name}"`);

    try {
      let cacheStatus: EnrichmentResult['cacheStatus'] = cacheEnabled ? 'miss' : 'disabled';
      let cached: CacheEnvelope | null = null;

      if (cacheEnabled && !options.refreshCache) {
        cached = await readCachedPlace(supabase, name);
      }

      let place = cached?.place ?? null;
      if (cached) {
        cacheStatus = 'hit';
      } else {
        if (cacheEnabled && options.refreshCache) {
          cacheStatus = 'refresh';
        }
        place = await searchPlace(name);
        if (cacheEnabled) {
          await writeCachedPlace(supabase, name, {
            found: Boolean(place),
            place,
          });
        }
      }

      if (!place) {
        console.warn(`  [places] Not found: "${name}"`);
        results.push({ restaurant: name, found: false, cacheStatus });
        continue;
      }

      await enrichRestaurant(supabase, name, place, options.dryRun ?? false);

      console.log(
        `  [places] ✓ "${name}" — rating: ${place.rating ?? 'n/a'}, ` +
        `${place.formattedAddress ?? 'no address'}`
      );

      results.push({ restaurant: name, found: true, placeId: place.id, cacheStatus });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [places] Error for "${name}":`, msg);
      results.push({
        restaurant: name,
        found: false,
        error: msg,
        cacheStatus: cacheEnabled ? 'miss' : 'disabled',
      });
    }

    // Stay well within Google's rate limits (10 QPS free tier)
    await new Promise(r => setTimeout(r, 200));
  }

  return results;
}

// ─── Convenience: enrich ALL restaurants already in the DB ───────────────────

export async function enrichAllDbRestaurants(
  options: { dryRun?: boolean; limit?: number; refreshCache?: boolean; cacheEnabled?: boolean } = {}
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase credentials.');
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase
    .from('restaurants')
    .select('name')
    .limit(options.limit ?? 500);

  if (!options.refreshCache) {
    query = query.is('google_places_id', null);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to fetch restaurants: ${error.message}`);
  if (!data || data.length === 0) {
    console.log(
      options.refreshCache
        ? '[places] No restaurants found for cache refresh.'
        : '[places] All restaurants already enriched.'
    );
    return;
  }

  console.log(`[places] Enriching ${data.length} restaurants...`);
  const names = data.map((r: any) => r.name);
  const results = await enrichRestaurantsWithPlaces(names, options);

  const found = results.filter(r => r.found).length;
  const missing = results.filter(r => !r.found).length;
  const cacheHits = results.filter(r => r.cacheStatus === 'hit').length;
  const cacheMisses = results.filter(r => r.cacheStatus === 'miss').length;
  const cacheRefreshes = results.filter(r => r.cacheStatus === 'refresh').length;
  console.log(
    `[places] Done — found: ${found}, not found: ${missing}, ` +
    `cache hits: ${cacheHits}, cache misses: ${cacheMisses}, refreshes: ${cacheRefreshes}`
  );
}
