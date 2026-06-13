/**
 * SeekEatz Response Formatter
 *
 * Shapes raw DB rows (from search_menu_items RPC or vector search)
 * into the `Meal` type used throughout the frontend.
 *
 * Also handles restaurant logo enrichment from the restaurants table
 * (cached in-memory per request to avoid N+1 lookups).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Meal } from '@/app/types';
import type { RawResult } from './ranker';
import { calculateDistanceMiles } from '@/lib/distance-utils';
import { getRestaurantLogoUrl } from '@/lib/image-utils';

// ─── Restaurant logo cache (per-request, not global) ─────────────────────────

interface RestaurantMeta {
  name?: string;
  logo_url?: string;
  latitude?: number;
  longitude?: number;
}

export type NearbyDistanceHints = {
  byRestaurantId: Map<string, number>;
  byRestaurantName: Map<string, number>;
  byRestaurantCoords?: {
    byRestaurantId: Map<string, { latitude: number; longitude: number }>;
    byRestaurantName: Map<string, { latitude: number; longitude: number }>;
  };
};

export class ResponseFormatter {
  private restaurantCache: Map<string, RestaurantMeta> = new Map();

  constructor(private supabase: SupabaseClient) {}

  /**
   * Formats an array of raw DB results into Meal objects.
   * Enriches with restaurant logo in a single batched query.
   */
  async format(
    items: RawResult[],
    userLocation?: { lat: number; lng: number },
    nearbyDistances?: NearbyDistanceHints
  ): Promise<Meal[]> {
    if (items.length === 0) return [];

    // Batch-fetch restaurant meta for all unique restaurant_ids
    await this.prefetchRestaurantMeta(items);

    return items.map(item => this.toMeal(item, userLocation, nearbyDistances));
  }

  private async prefetchRestaurantMeta(items: RawResult[]) {
    const unknownIds = [
      ...new Set(
        items
          .map(i => i.restaurant_id)
          .filter(id => id && !this.restaurantCache.has(id))
      ),
    ];

    if (unknownIds.length === 0) return;

    const { data: restaurants } = await this.supabase
      .from('restaurants')
      .select('id, name, logo_url, latitude, longitude')
      .in('id', unknownIds);

    for (const r of restaurants ?? []) {
      this.restaurantCache.set(r.id, {
        name: r.name,
        logo_url: r.logo_url,
        latitude: typeof r.latitude === 'number' ? r.latitude : undefined,
        longitude: typeof r.longitude === 'number' ? r.longitude : undefined,
      });
    }
  }

  private toMeal(
    item: RawResult,
    userLocation?: { lat: number; lng: number },
    nearbyDistances?: NearbyDistanceHints
  ): Meal {
    const macros = item.macros ?? {};
    const restaurantMeta = this.restaurantCache.get(item.restaurant_id) ?? {};
    const restaurantName = item.restaurant_name || restaurantMeta.name || '';
    const restaurantLogoUrl = restaurantMeta.logo_url;
    const normalizedRestaurantName = restaurantName.trim().toLowerCase();

    let distance: number | undefined;
    let latitude: number | undefined;
    let longitude: number | undefined;

    if (nearbyDistances) {
      if (item.restaurant_id) {
        distance = nearbyDistances.byRestaurantId.get(item.restaurant_id);
        const coords = nearbyDistances.byRestaurantCoords?.byRestaurantId.get(item.restaurant_id);
        if (coords) {
          latitude = coords.latitude;
          longitude = coords.longitude;
        }
      }
      if (distance === undefined && normalizedRestaurantName) {
        distance = nearbyDistances.byRestaurantName.get(normalizedRestaurantName);
        const coords = nearbyDistances.byRestaurantCoords?.byRestaurantName.get(normalizedRestaurantName);
        if (coords) {
          latitude = coords.latitude;
          longitude = coords.longitude;
        }
      }
    }

    if (distance === undefined && userLocation && restaurantMeta.latitude !== undefined && restaurantMeta.longitude !== undefined) {
      distance = calculateDistanceMiles(
        { latitude: userLocation.lat, longitude: userLocation.lng },
        { latitude: restaurantMeta.latitude, longitude: restaurantMeta.longitude }
      );
      latitude = restaurantMeta.latitude;
      longitude = restaurantMeta.longitude;
    } else if (latitude === undefined && restaurantMeta.latitude !== undefined) {
      latitude = restaurantMeta.latitude;
      longitude = restaurantMeta.longitude;
    }

    const meal: Meal = {
      id:               String(item.id),
      name:             item.name ?? '',
      restaurant:       restaurantName,
      restaurant_name:  restaurantName,
      calories:         Number(macros.calories ?? 0),
      protein:          Number(macros.protein  ?? 0),
      carbs:            Number(macros.carbs    ?? 0),
      fats:             Number(macros.fat      ?? 0),
      macros: {
        calories: Number(macros.calories ?? 0),
        protein:  Number(macros.protein  ?? 0),
        carbs:    Number(macros.carbs    ?? 0),
        fats:     Number(macros.fat      ?? 0),
      },
      // Images
      image:      getRestaurantLogoUrl(restaurantName, restaurantLogoUrl),
      // Price
      price:      item.price != null ? Number(item.price) : undefined,
      // Description
      description: item.description ?? undefined,
      // Tags
      tags:         item.food_tags ?? [],
      dietary_tags: item.food_tags ?? [],
      // Match score from ranker
      matchScore:   item.matchScore,
    };

    if (item.matchReasons) {
      meal.matchReasons = item.matchReasons;
    }
    if (item.searchMetadata) {
      meal.searchMetadata = item.searchMetadata;
    }
    if (restaurantLogoUrl) {
      meal.restaurantLogoUrl = restaurantLogoUrl;
    }
    if (distance !== undefined) {
      meal.distance = distance;
    }
    if (latitude !== undefined) {
      meal.latitude = latitude;
    }
    if (longitude !== undefined) {
      meal.longitude = longitude;
    }

    return meal;
  }
}

// ─── Standalone formatter (no logo enrichment) ────────────────────────────────

/**
 * Simple sync formatter when restaurant logos aren't needed
 * (e.g. for quick-search or non-critical paths).
 */
export function formatMealsSync(items: RawResult[]): Meal[] {
  return items.map(item => {
    const macros = item.macros ?? {};
    const restaurantName = item.restaurant_name ?? '';
    const restaurantLogoUrl = getRestaurantLogoUrl(restaurantName);
    const meal: Meal = {
      id:              String(item.id),
      name:            item.name ?? '',
      restaurant:      restaurantName,
      restaurant_name: restaurantName,
      calories:        Number(macros.calories ?? 0),
      protein:         Number(macros.protein  ?? 0),
      carbs:           Number(macros.carbs    ?? 0),
      fats:            Number(macros.fat      ?? 0),
      macros: {
        calories: Number(macros.calories ?? 0),
        protein:  Number(macros.protein  ?? 0),
        carbs:    Number(macros.carbs    ?? 0),
        fats:     Number(macros.fat      ?? 0),
      },
      image:       restaurantLogoUrl,
      price:       item.price != null ? Number(item.price) : undefined,
      description: item.description ?? undefined,
      tags:        item.food_tags ?? [],
      dietary_tags: item.food_tags ?? [],
      matchScore:  item.matchScore,
    };

    meal.restaurantLogoUrl = restaurantLogoUrl;
    if (item.matchReasons) {
      meal.matchReasons = item.matchReasons;
    }
    if (item.searchMetadata) {
      meal.searchMetadata = item.searchMetadata;
    }

    return meal;
  });
}
