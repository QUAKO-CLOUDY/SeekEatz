import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateDistanceMiles } from '@/lib/distance-utils';
import { normalizeRestaurantName } from '@/lib/restaurant-resolver';

const PLACES_BASE = 'https://places.googleapis.com/v1';
const CACHE_TYPE = 'live_brand_nearby_v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BRAND_SEARCH_CONCURRENCY = 12;

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

type CachedBrandPlace = {
  found: boolean;
  placeId?: string;
  displayName?: string;
  latitude?: number;
  longitude?: number;
};

const memoryCache = new Map<string, { expiresAt: number; value: CachedBrandPlace }>();

function getApiKey(): string | null {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  return key || null;
}

function buildLocationBucket(lat: number, lng: number, radiusMiles: number): string {
  return `${lat.toFixed(2)}:${lng.toFixed(2)}:${radiusMiles}`;
}

function buildCacheKey(bucket: string, brandName: string): string {
  return `${CACHE_TYPE}:${bucket}:${normalizeRestaurantName(brandName)}`;
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

async function readCachedBrandPlace(cacheKey: string): Promise<CachedBrandPlace | null> {
  const memoryHit = memoryCache.get(cacheKey);
  if (memoryHit && memoryHit.expiresAt > Date.now()) {
    return memoryHit.value;
  }

  return null;
}

function writeMemoryCache(cacheKey: string, value: CachedBrandPlace, found: boolean) {
  memoryCache.set(cacheKey, {
    expiresAt: Date.now() + (found ? CACHE_TTL_MS : MISS_CACHE_TTL_MS),
    value,
  });
}

async function searchBrandNearLocation(
  brandName: string,
  lat: number,
  lng: number,
  radiusMiles: number,
): Promise<CachedBrandPlace> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { found: false };
  }

  const bucket = buildLocationBucket(lat, lng, radiusMiles);
  const cacheKey = buildCacheKey(bucket, brandName);
  const cached = await readCachedBrandPlace(cacheKey);
  if (cached) {
    return cached;
  }

  const radiusMeters = Math.min(radiusMiles * 1609.344, 50_000);

  try {
    const res = await fetch(`${PLACES_BASE}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
      },
      body: JSON.stringify({
        textQuery: brandName,
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: radiusMeters,
          },
        },
        maxResultCount: 3,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.warn(`[google-places-nearby] Text search failed for "${brandName}": ${errorBody}`);
      const miss = { found: false as const };
      writeMemoryCache(cacheKey, miss, false);
      return miss;
    }

    const data = (await res.json()) as {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        location?: { latitude?: number; longitude?: number };
      }>;
    };

    let best: CachedBrandPlace = { found: false };

    for (const place of data.places ?? []) {
      const displayName = place.displayName?.text?.trim();
      const latitude = place.location?.latitude;
      const longitude = place.location?.longitude;
      const placeId = place.id?.trim();

      if (!displayName || latitude === undefined || longitude === undefined || !placeId) {
        continue;
      }

      const distanceMiles = calculateDistanceMiles(
        { latitude: lat, longitude: lng },
        { latitude, longitude },
      );

      if (distanceMiles > radiusMiles) {
        continue;
      }

      if (!best.found || distanceMiles < calculateDistanceMiles(
        { latitude: lat, longitude: lng },
        { latitude: best.latitude!, longitude: best.longitude! },
      )) {
        best = {
          found: true,
          placeId,
          displayName,
          latitude,
          longitude,
        };
      }
    }

    writeMemoryCache(cacheKey, best, best.found);
    return best;
  } catch (error) {
    console.warn(
      `[google-places-nearby] Text search error for "${brandName}":`,
      error instanceof Error ? error.message : error,
    );
    const miss = { found: false as const };
    writeMemoryCache(cacheKey, miss, false);
    return miss;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

export async function resolveLiveNearbyRestaurantMatches(
  supabase: SupabaseClient,
  location: { lat: number; lng: number; radiusMiles: number },
): Promise<LiveNearbyRestaurantMatch[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return [];
  }

  const restaurantIndex = await buildRestaurantIndex(supabase);
  if (restaurantIndex.length === 0) {
    return [];
  }

  const brandResults = await mapWithConcurrency(
    restaurantIndex,
    BRAND_SEARCH_CONCURRENCY,
    async (restaurant) => {
      const place = await searchBrandNearLocation(
        restaurant.name,
        location.lat,
        location.lng,
        location.radiusMiles,
      );

      if (!place.found || place.latitude === undefined || place.longitude === undefined || !place.placeId) {
        return null;
      }

      const distanceMiles = calculateDistanceMiles(
        { latitude: location.lat, longitude: location.lng },
        { latitude: place.latitude, longitude: place.longitude },
      );

      return {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        distanceMiles,
        latitude: place.latitude,
        longitude: place.longitude,
        placeId: place.placeId,
      } satisfies LiveNearbyRestaurantMatch;
    },
  );

  const matches: LiveNearbyRestaurantMatch[] = [];
  for (const match of brandResults) {
    if (match !== null) {
      matches.push(match);
    }
  }

  return matches.sort((a, b) => a.distanceMiles - b.distanceMiles);
}
