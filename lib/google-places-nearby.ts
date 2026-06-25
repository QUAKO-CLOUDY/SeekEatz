import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateDistanceMiles } from '@/lib/distance-utils';
import { buildNearbyContextKey, filterMatchesToRadius } from '@/lib/nearby-context';
import { normalizeRestaurantName } from '@/lib/restaurant-resolver';

const PLACES_BASE = 'https://places.googleapis.com/v1';
const AGGREGATE_CACHE_TYPE = 'live_brand_nearby_aggregate_v2';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEARBY_SEARCH_MAX_PAGES = 3;
const NEARBY_SEARCH_PAGE_SIZE = 20;

const BRAND_NAME_STOP_WORDS = new Set([
  'restaurant',
  'restaurants',
  'bar',
  'bars',
  'grill',
  'grills',
  'cafe',
  'kitchen',
  'and',
  'the',
  'a',
  'an',
  'of',
  'inc',
  'llc',
  'co',
  'company',
]);

function extractBrandTokens(name: string): string[] {
  return normalizeRestaurantName(name)
    .split(' ')
    .filter((token) => token.length > 0 && !BRAND_NAME_STOP_WORDS.has(token));
}

export function placeNameMatchesBrand(brandName: string, placeDisplayName: string): boolean {
  const normalizedBrand = normalizeRestaurantName(brandName);
  const normalizedPlace = normalizeRestaurantName(placeDisplayName);
  if (!normalizedBrand || !normalizedPlace) {
    return false;
  }

  if (
    normalizedPlace.includes(normalizedBrand) ||
    normalizedBrand.includes(normalizedPlace)
  ) {
    return true;
  }

  const brandTokens = extractBrandTokens(brandName);
  if (brandTokens.length === 0) {
    return normalizedPlace.includes(normalizedBrand);
  }

  return brandTokens.every((token) => normalizedPlace.includes(token));
}

export type LiveNearbyRestaurantMatch = {
  restaurantId?: string;
  restaurantName: string;
  distanceMiles: number;
  latitude: number;
  longitude: number;
  placeId: string;
};

type RestaurantIndexEntry = {
  id: string;
  name: string;
};

type NearbyPlaceCandidate = {
  displayName: string;
  placeId: string;
  latitude: number;
  longitude: number;
};

const aggregateMemoryCache = new Map<
  string,
  { expiresAt: number; matches: LiveNearbyRestaurantMatch[]; fetchRadiusMiles: number }
>();

class PlacesQuotaError extends Error {
  constructor(message = 'Google Places quota exceeded') {
    super(message);
    this.name = 'PlacesQuotaError';
  }
}

function getApiKey(): string | null {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  return key || null;
}

function buildAggregateCacheKey(bucket: string): string {
  return `${AGGREGATE_CACHE_TYPE}:${bucket}`;
}

function parseBucketRadius(bucket: string): number | undefined {
  const parts = bucket.split(':');
  if (parts.length !== 3) {
    return undefined;
  }
  const radius = Number(parts[2]);
  return Number.isFinite(radius) ? radius : undefined;
}

function readAggregateMemoryCache(
  lat: number,
  lng: number,
  radiusMiles: number,
): LiveNearbyRestaurantMatch[] | null {
  const exactBucket = buildNearbyContextKey(lat, lng, radiusMiles);
  const exactHit = aggregateMemoryCache.get(buildAggregateCacheKey(exactBucket));
  if (exactHit && exactHit.expiresAt > Date.now()) {
    return filterMatchesToRadius(exactHit.matches, radiusMiles);
  }

  const prefix = buildNearbyContextKey(lat, lng, 0).replace(/:0$/, ':');
  let best: { matches: LiveNearbyRestaurantMatch[]; fetchRadius: number } | null = null;

  for (const [cacheKey, entry] of aggregateMemoryCache.entries()) {
    if (entry.expiresAt <= Date.now()) {
      continue;
    }
    if (!cacheKey.startsWith(`${AGGREGATE_CACHE_TYPE}:${prefix}`)) {
      continue;
    }
    const bucket = cacheKey.slice(`${AGGREGATE_CACHE_TYPE}:`.length);
    const cachedRadius = parseBucketRadius(bucket) ?? entry.fetchRadiusMiles;
    if (cachedRadius < radiusMiles) {
      continue;
    }
    if (!best || cachedRadius > best.fetchRadius) {
      best = { matches: entry.matches, fetchRadius: cachedRadius };
    }
  }

  if (!best) {
    return null;
  }

  return filterMatchesToRadius(best.matches, radiusMiles);
}

function writeAggregateMemoryCache(
  lat: number,
  lng: number,
  fetchRadiusMiles: number,
  matches: LiveNearbyRestaurantMatch[],
) {
  const bucket = buildNearbyContextKey(lat, lng, fetchRadiusMiles);
  aggregateMemoryCache.set(buildAggregateCacheKey(bucket), {
    expiresAt: Date.now() + CACHE_TTL_MS,
    matches,
    fetchRadiusMiles,
  });
}

async function readAggregateSupabaseCache(
  _supabase: SupabaseClient,
  lat: number,
  lng: number,
  radiusMiles: number,
): Promise<LiveNearbyRestaurantMatch[] | null> {
  try {
    const { createAdminClient } = await import('@/utils/supabase/admin');
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const prefix = `${AGGREGATE_CACHE_TYPE}:${buildNearbyContextKey(lat, lng, 0).replace(/:0$/, ':')}`;

    const { data, error } = await admin
      .from('cache_entries')
      .select('cache_key, results_json')
      .eq('cache_type', AGGREGATE_CACHE_TYPE)
      .like('cache_key', `${prefix}%`)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

    if (error || !data?.length) {
      return null;
    }

    let bestMatches: LiveNearbyRestaurantMatch[] | null = null;
    let bestRadius = -1;

    for (const row of data) {
      const bucket = String(row.cache_key ?? '').slice(`${AGGREGATE_CACHE_TYPE}:`.length);
      const cachedRadius = parseBucketRadius(bucket);
      if (cachedRadius === undefined || cachedRadius < radiusMiles) {
        continue;
      }

      const payload = row.results_json as {
        matches?: LiveNearbyRestaurantMatch[];
        fetchRadiusMiles?: number;
      };
      const matches = Array.isArray(payload.matches) ? payload.matches : null;
      if (!matches?.length) {
        continue;
      }

      const effectiveRadius = payload.fetchRadiusMiles ?? cachedRadius;
      if (effectiveRadius >= bestRadius) {
        bestRadius = effectiveRadius;
        bestMatches = matches;
      }
    }

    if (!bestMatches) {
      return null;
    }

    return filterMatchesToRadius(bestMatches, radiusMiles);
  } catch {
    return null;
  }
}

async function writeAggregateSupabaseCache(
  supabase: SupabaseClient,
  lat: number,
  lng: number,
  fetchRadiusMiles: number,
  matches: LiveNearbyRestaurantMatch[],
): Promise<void> {
  try {
    const { createAdminClient } = await import('@/utils/supabase/admin');
    const admin = createAdminClient();
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
    const bucket = buildNearbyContextKey(lat, lng, fetchRadiusMiles);
    const cacheKey = buildAggregateCacheKey(bucket);

    const { data: existing } = await admin
      .from('cache_entries')
      .select('id')
      .eq('cache_key', cacheKey)
      .eq('cache_type', AGGREGATE_CACHE_TYPE)
      .maybeSingle();

    const row = {
      cache_key: cacheKey,
      cache_type: AGGREGATE_CACHE_TYPE,
      results_json: { matches, fetchRadiusMiles },
      expires_at: expiresAt,
      hit_count: 0,
    };

    if (existing?.id) {
      await admin.from('cache_entries').update(row).eq('id', existing.id);
      return;
    }

    await admin.from('cache_entries').insert(row);
  } catch (error) {
    console.warn(
      '[google-places-nearby] Aggregate cache write skipped:',
      error instanceof Error ? error.message : error,
    );
  }
}

async function buildRestaurantIndex(supabase: SupabaseClient): Promise<RestaurantIndexEntry[]> {
  const { data, error } = await supabase.from('restaurants').select('id, name').order('name');
  if (error) {
    console.error('[google-places-nearby] Failed to load restaurants:', error.message);
    return [];
  }

  return (data ?? []).filter(
    (row): row is RestaurantIndexEntry => Boolean(row.id && row.name),
  );
}

async function fetchNearbyPlacesFromGoogle(
  lat: number,
  lng: number,
  radiusMiles: number,
): Promise<NearbyPlaceCandidate[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return [];
  }

  const radiusMeters = Math.min(radiusMiles * 1609.344, 50_000);
  const collected: NearbyPlaceCandidate[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < NEARBY_SEARCH_MAX_PAGES; page += 1) {
    const body: Record<string, unknown> = {
      includedTypes: ['restaurant'],
      maxResultCount: NEARBY_SEARCH_PAGE_SIZE,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
    };

    if (pageToken) {
      body.pageToken = pageToken;
    }

    const res = await fetch(`${PLACES_BASE}/places:searchNearby`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location,nextPageToken',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      if (res.status === 429 || res.status === 403) {
        console.warn('[google-places-nearby] Nearby search quota/permission error:', errorBody);
        throw new PlacesQuotaError();
      }
      console.warn('[google-places-nearby] Nearby search failed:', errorBody);
      break;
    }

    const data = (await res.json()) as {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        location?: { latitude?: number; longitude?: number };
      }>;
      nextPageToken?: string;
    };

    for (const place of data.places ?? []) {
      const displayName = place.displayName?.text?.trim();
      const latitude = place.location?.latitude;
      const longitude = place.location?.longitude;
      const placeId = place.id?.trim();
      if (!displayName || latitude === undefined || longitude === undefined || !placeId) {
        continue;
      }
      collected.push({ displayName, placeId, latitude, longitude });
    }

    pageToken = data.nextPageToken;
    if (!pageToken) {
      break;
    }
  }

  return collected;
}

function matchPlacesToBrandIndex(
  places: NearbyPlaceCandidate[],
  restaurantIndex: RestaurantIndexEntry[],
  origin: { lat: number; lng: number },
  radiusMiles: number,
): LiveNearbyRestaurantMatch[] {
  const bestByBrandId = new Map<string, LiveNearbyRestaurantMatch>();

  for (const place of places) {
    for (const restaurant of restaurantIndex) {
      if (!placeNameMatchesBrand(restaurant.name, place.displayName)) {
        continue;
      }

      const distanceMiles = calculateDistanceMiles(
        { latitude: origin.lat, longitude: origin.lng },
        { latitude: place.latitude, longitude: place.longitude },
      );

      if (distanceMiles > radiusMiles) {
        continue;
      }

      const candidate: LiveNearbyRestaurantMatch = {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        distanceMiles,
        latitude: place.latitude,
        longitude: place.longitude,
        placeId: place.placeId,
      };

      const existing = bestByBrandId.get(restaurant.id);
      if (!existing || candidate.distanceMiles < existing.distanceMiles) {
        bestByBrandId.set(restaurant.id, candidate);
      }
    }
  }

  return [...bestByBrandId.values()].sort((a, b) => a.distanceMiles - b.distanceMiles);
}

export async function resolveLiveNearbyRestaurantMatches(
  supabase: SupabaseClient,
  location: { lat: number; lng: number; radiusMiles: number },
): Promise<LiveNearbyRestaurantMatch[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return [];
  }

  const memoryHit = readAggregateMemoryCache(location.lat, location.lng, location.radiusMiles);
  if (memoryHit) {
    return memoryHit;
  }

  const supabaseHit = await readAggregateSupabaseCache(
    supabase,
    location.lat,
    location.lng,
    location.radiusMiles,
  );
  if (supabaseHit) {
    writeAggregateMemoryCache(location.lat, location.lng, location.radiusMiles, supabaseHit);
    return supabaseHit;
  }

  const restaurantIndex = await buildRestaurantIndex(supabase);
  if (restaurantIndex.length === 0) {
    return [];
  }

  try {
    const places = await fetchNearbyPlacesFromGoogle(
      location.lat,
      location.lng,
      location.radiusMiles,
    );
    const matches = matchPlacesToBrandIndex(
      places,
      restaurantIndex,
      { lat: location.lat, lng: location.lng },
      location.radiusMiles,
    );

    writeAggregateMemoryCache(location.lat, location.lng, location.radiusMiles, matches);
    void writeAggregateSupabaseCache(
      supabase,
      location.lat,
      location.lng,
      location.radiusMiles,
      matches,
    );
    return matches;
  } catch (error) {
    if (error instanceof PlacesQuotaError) {
      return [];
    }
    console.warn(
      '[google-places-nearby] Live lookup failed:',
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

export { buildNearbyContextKey };
