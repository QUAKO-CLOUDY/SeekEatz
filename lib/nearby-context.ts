import { calculateDistanceMiles } from '@/lib/distance-utils';

export type NearbyMatchSnapshot = {
  restaurantId?: string;
  restaurantName: string;
  distanceMiles: number;
  latitude: number;
  longitude: number;
};

export type NearbyCachePayload = {
  contextKey: string;
  fetchRadiusMiles: number;
  lat: number;
  lng: number;
  matches: NearbyMatchSnapshot[];
};

export type StoredNearbyContext = NearbyCachePayload & {
  cachedAt: number;
};

export type NearbySearchPayload = {
  nearbyContextKey?: string;
  nearbyMatchesSnapshot?: NearbyMatchSnapshot[];
};

const STORAGE_KEY = 'seekeatz_nearby_context_v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOCATION_DRIFT_MILES = 0.5;

/** Stable key for lat/lng bucket + search radius (matches server cache bucket). */
export function buildNearbyContextKey(
  lat: number,
  lng: number,
  radiusMiles: number,
): string {
  return `${lat.toFixed(2)}:${lng.toFixed(2)}:${radiusMiles}`;
}

export function filterMatchesToRadius<T extends { distanceMiles: number }>(
  matches: T[],
  radiusMiles: number,
): T[] {
  return matches.filter((match) => match.distanceMiles <= radiusMiles);
}

export function isSameNearbyLocation(
  storedLat: number,
  storedLng: number,
  lat: number,
  lng: number,
  maxDriftMiles = LOCATION_DRIFT_MILES,
): boolean {
  return (
    calculateDistanceMiles(
      { latitude: storedLat, longitude: storedLng },
      { latitude: lat, longitude: lng },
    ) <= maxDriftMiles
  );
}

export function validateClientNearbySnapshot(args: {
  contextKey?: string;
  snapshot?: NearbyMatchSnapshot[];
  lat: number;
  lng: number;
  radiusMiles: number;
}): NearbyMatchSnapshot[] | null {
  const { contextKey, snapshot, lat, lng, radiusMiles } = args;
  if (!snapshot?.length || !contextKey) {
    return null;
  }

  const expectedKey = buildNearbyContextKey(lat, lng, radiusMiles);
  if (contextKey !== expectedKey) {
    return null;
  }

  const filtered = filterMatchesToRadius(snapshot, radiusMiles);
  return filtered.length > 0 ? filtered : null;
}

export function getStoredNearbyContext(): StoredNearbyContext | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredNearbyContext;
    if (
      !parsed ||
      typeof parsed.contextKey !== 'string' ||
      typeof parsed.fetchRadiusMiles !== 'number' ||
      typeof parsed.lat !== 'number' ||
      typeof parsed.lng !== 'number' ||
      !Array.isArray(parsed.matches) ||
      typeof parsed.cachedAt !== 'number'
    ) {
      return null;
    }

    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function storeNearbyContext(payload: NearbyCachePayload): void {
  if (typeof window === 'undefined') {
    return;
  }

  const stored: StoredNearbyContext = {
    ...payload,
    cachedAt: Date.now(),
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

export function clearNearbyContext(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Returns client cached nearby restaurants when location is unchanged and
 * cached fetch radius covers the requested radius.
 */
export function getNearbySearchPayload(
  lat: number,
  lng: number,
  radiusMiles: number,
): NearbySearchPayload {
  const stored = getStoredNearbyContext();
  if (!stored) {
    return {};
  }

  if (!isSameNearbyLocation(stored.lat, stored.lng, lat, lng)) {
    clearNearbyContext();
    return {};
  }

  if (stored.fetchRadiusMiles < radiusMiles) {
    return {};
  }

  const filtered = filterMatchesToRadius(stored.matches, radiusMiles);
  if (filtered.length === 0) {
    return {};
  }

  return {
    nearbyContextKey: buildNearbyContextKey(lat, lng, radiusMiles),
    nearbyMatchesSnapshot: filtered,
  };
}

export function saveNearbyContextFromResponse(
  payload: NearbyCachePayload | null | undefined,
): void {
  if (!payload?.matches?.length) {
    return;
  }
  storeNearbyContext(payload);
}

export function buildNearbyCachePayload(args: {
  lat: number;
  lng: number;
  fetchRadiusMiles: number;
  matches: NearbyMatchSnapshot[];
}): NearbyCachePayload {
  return {
    contextKey: buildNearbyContextKey(args.lat, args.lng, args.fetchRadiusMiles),
    fetchRadiusMiles: args.fetchRadiusMiles,
    lat: args.lat,
    lng: args.lng,
    matches: args.matches,
  };
}

/** Merge a fresh fetch into stored cache when expanding radius at the same location. */
export function mergeNearbyCachePayload(
  existing: StoredNearbyContext | null,
  incoming: NearbyCachePayload,
): NearbyCachePayload {
  if (
    !existing ||
    !isSameNearbyLocation(existing.lat, existing.lng, incoming.lat, incoming.lng)
  ) {
    return incoming;
  }

  if (incoming.fetchRadiusMiles <= existing.fetchRadiusMiles) {
    return incoming;
  }

  const byBrand = new Map<string, NearbyMatchSnapshot>();
  for (const match of [...existing.matches, ...incoming.matches]) {
    const key = (match.restaurantId ?? match.restaurantName).toLowerCase();
    const current = byBrand.get(key);
    if (!current || match.distanceMiles < current.distanceMiles) {
      byBrand.set(key, match);
    }
  }

  return {
    ...incoming,
    matches: [...byBrand.values()].sort((a, b) => a.distanceMiles - b.distanceMiles),
  };
}
