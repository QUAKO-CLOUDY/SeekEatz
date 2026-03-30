import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface RestaurantLocationSource {
  id: string;
  name: string;
  google_places_id?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  last_enriched_at?: string | null;
}

export interface LocationSyncOptions {
  dryRun?: boolean;
}

export interface LocationSyncResult {
  action: 'inserted' | 'updated' | 'skipped';
  reason?: string;
}

function buildServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createServiceRoleClient() {
  return buildServiceClient();
}

export async function syncRestaurantLocation(
  supabase: SupabaseClient,
  restaurant: RestaurantLocationSource,
  options: LocationSyncOptions = {}
): Promise<LocationSyncResult> {
  const latitude = normalizeNumber(restaurant.latitude);
  const longitude = normalizeNumber(restaurant.longitude);

  if (latitude === undefined || longitude === undefined) {
    return { action: 'skipped', reason: 'missing_coordinates' };
  }

  const payload = {
    restaurant_id: restaurant.id,
    google_place_id: restaurant.google_places_id ?? null,
    address: restaurant.address ?? null,
    city: restaurant.city ?? null,
    state: restaurant.state ?? null,
    zip_code: restaurant.zip_code ?? null,
    latitude,
    longitude,
    data_source: restaurant.google_places_id ? 'google_places' : 'manual',
    is_open: true,
  };

  let existingLocationId: string | undefined;

  if (restaurant.google_places_id) {
    const { data } = await supabase
      .from('restaurant_locations')
      .select('id')
      .eq('google_place_id', restaurant.google_places_id)
      .limit(1)
      .maybeSingle();

    existingLocationId = typeof data?.id === 'string' ? data.id : undefined;
  }

  if (!existingLocationId) {
    const { data } = await supabase
      .from('restaurant_locations')
      .select('id')
      .eq('restaurant_id', restaurant.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    existingLocationId = typeof data?.id === 'string' ? data.id : undefined;
  }

  if (options.dryRun) {
    return { action: existingLocationId ? 'updated' : 'inserted' };
  }

  if (existingLocationId) {
    const { error } = await supabase
      .from('restaurant_locations')
      .update(payload)
      .eq('id', existingLocationId);

    if (error) {
      throw new Error(`Failed to update location for ${restaurant.name}: ${error.message}`);
    }

    return { action: 'updated' };
  }

  const { error } = await supabase
    .from('restaurant_locations')
    .insert(payload);

  if (error) {
    throw new Error(`Failed to insert location for ${restaurant.name}: ${error.message}`);
  }

  return { action: 'inserted' };
}

export async function fetchRestaurantsForLocationSync(
  supabase: SupabaseClient,
  options: { limit?: number; restaurantName?: string } = {}
): Promise<RestaurantLocationSource[]> {
  let query = supabase
    .from('restaurants')
    .select('id, name, google_places_id, address, city, state, zip_code, latitude, longitude, last_enriched_at')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('last_enriched_at', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true });

  if (options.restaurantName) {
    query = query.ilike('name', options.restaurantName);
  }

  if (options.limit !== undefined) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch restaurants for location sync: ${error.message}`);
  }

  return (data ?? []) as RestaurantLocationSource[];
}

function normalizeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}
