'use client';

import { useState } from 'react';
import { ChevronRight, Sparkles, X } from 'lucide-react';
import type { Meal } from '../types';
import { getRestaurantLogoUrl } from '@/lib/image-utils';
import { getStoredLocation, ensureSearchLocation } from '@/lib/location';
import FoodCard from './FoodCard';

type Props = {
  onMealSelect: (meal: Meal) => void;
  onBack?: () => void;
};

type SearchResultItem = {
  id?: string | number;
  category?: string;
  item_name?: string;
  name?: string;
  restaurant_name?: string;
  restaurantLogoUrl?: string;
  restaurant_logo_url?: string;
  logo_url?: string;
  fat?: number;
  fats?: number;
  fat_g?: number;
  fats_g?: number;
  nutrition_info?: {
    fat?: number;
    fats?: number;
    fat_g?: number;
    fats_g?: number;
  };
  macros?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    fats?: number;
  };
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  price?: number | null;
  description?: string;
  dietary_tags?: string[];
  tags?: string[];
};

type SearchResponse =
  | SearchResultItem[]
  | {
      meals?: SearchResultItem[];
      results?: SearchResultItem[];
      hasMore?: boolean;
      nextOffset?: number;
      searchKey?: string;
    };

const SEARCH_SCREEN_PAGE_SIZE = 12;

// Convert API result to Meal type
function convertToMeal(item: SearchResultItem): Meal {
  // Determine category from item data
  const category = item.category === 'Grocery' || item.category === 'Hot Bar' 
    ? 'grocery' as const 
    : 'restaurant' as const;

  const mealName = item.item_name || item.name || 'Unknown Item';
  const restaurantName = item.restaurant_name || 'Unknown Restaurant';
  
  const imageUrl = getRestaurantLogoUrl(
    restaurantName,
    item.restaurantLogoUrl || item.restaurant_logo_url || item.logo_url
  );

  // Handle fats - normalize fat/fats consistently
  // Prefer fat (singular) from DB, fallback to fats (plural)
  // Also check _g suffixed variants for compatibility
  const fats = item.fat ?? item.fats ?? 
               item.fat_g ?? item.fats_g ?? 
               (item.nutrition_info?.fat) ?? 
               (item.nutrition_info?.fats) ?? 
               (item.nutrition_info?.fat_g) ?? 
               (item.nutrition_info?.fats_g) ?? 0;

  return {
    id: String(item.id ?? `meal-${Date.now()}-${Math.random()}`),
    name: mealName,
    restaurant: restaurantName,
    restaurant_name: restaurantName, // Add for logo logic consistency
    calories: item.calories || 0,
    protein: item.protein_g || 0,
    carbs: item.carbs_g || 0,
    fats: typeof fats === 'number' ? fats : 0,
    image: imageUrl,
    restaurantLogoUrl: imageUrl,
    price: item.price ?? undefined,
    description: item.description || '',
    category: category,
    dietary_tags: item.dietary_tags || item.tags || [],
  };
}

export function SearchScreen({ onMealSelect, onBack }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Meal[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchKey, setSearchKey] = useState<string | undefined>(undefined);
  const [nextOffset, setNextOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(() => {
    const stored = getStoredLocation();
    return stored
      ? { latitude: stored.latitude, longitude: stored.longitude }
      : null;
  });

  const ensureLocationForSearch = async () => {
    if (userLocation) return userLocation;
    const location = await ensureSearchLocation();
    if (!location) return null;
    const nextLocation = { latitude: location.latitude, longitude: location.longitude };
    setUserLocation(nextLocation);
    return nextLocation;
  };

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);
    setHasMore(false);
    setNextOffset(0);
    setSearchKey(undefined);
    
    try {
      const resolvedLocation = await ensureLocationForSearch();
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          ...(resolvedLocation ? { location: 'near me' } : {}),
          ...(resolvedLocation ? {
            user_location_lat: resolvedLocation.latitude,
            user_location_lng: resolvedLocation.longitude,
          } : {}),
          limit: SEARCH_SCREEN_PAGE_SIZE,
        }),
      });
      
      const data: SearchResponse = await res.json();
      console.log("Search API response:", data);
      
      // Normalize API response to always be an array
      let normalizedResults: SearchResultItem[] = [];
      
      if (Array.isArray(data)) {
        normalizedResults = data;
        setHasMore(false);
        setNextOffset(0);
        setSearchKey(undefined);
      } else if (data && typeof data === 'object' && Array.isArray(data.meals)) {
        // New format: { meals, hasMore, nextOffset, searchKey }
        normalizedResults = data.meals;
        setHasMore(Boolean(data.hasMore));
        setNextOffset(data.nextOffset ?? normalizedResults.length);
        setSearchKey(data.searchKey);
      } else if (data && typeof data === 'object' && Array.isArray(data.results)) {
        // Legacy format support
        normalizedResults = data.results;
        setHasMore(false);
        setNextOffset(0);
        setSearchKey(undefined);
      }
      
      // Store raw results for FoodCard display
      setSearchResults(normalizedResults);
      
      // Convert to Meal type for onMealSelect
      const meals = normalizedResults.map(convertToMeal);
      setResults(meals);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
      setSearchResults([]);
      setHasMore(false);
      setNextOffset(0);
      setSearchKey(undefined);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadMore() {
    if (loading || loadingMore || !hasMore || !searchKey) return;

    setLoadingMore(true);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchKey,
          isPagination: true,
          offset: nextOffset,
          limit: SEARCH_SCREEN_PAGE_SIZE,
        }),
      });

      const data: SearchResponse = await res.json();
      console.log("Search API pagination response:", data);

      const nextItems = Array.isArray(data)
        ? data
        : Array.isArray(data?.meals)
          ? data.meals
          : Array.isArray(data?.results)
            ? data.results
            : [];

      if (nextItems.length === 0) {
        setHasMore(false);
        return;
      }

      setSearchResults((prev) => {
        const seenIds = new Set(prev.map((item) => String(item.id ?? '')));
        const dedupedNext = nextItems.filter((item) => !seenIds.has(String(item.id ?? '')));
        return [...prev, ...dedupedNext];
      });

      setResults((prev) => {
        const seenIds = new Set(prev.map((meal) => meal.id));
        const dedupedNextMeals = nextItems
          .map(convertToMeal)
          .filter((meal) => !seenIds.has(meal.id));
        return [...prev, ...dedupedNextMeals];
      });

      if (!Array.isArray(data) && data && typeof data === 'object') {
        setHasMore(Boolean(data.hasMore));
        setNextOffset(data.nextOffset ?? (nextOffset + nextItems.length));
        setSearchKey(data.searchKey ?? searchKey);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Load more failed:', error);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full w-full bg-background text-foreground font-sans">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-4 py-4 backdrop-blur-md">
        {onBack ? (
          <button
            onClick={onBack}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          <div />
        )}
        <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
          SeekEatz
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground bg-card px-3 py-1 rounded-full border border-border">
            Search
          </span>
        </div>
      </header>

      {/* Content Area */}
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col space-y-6 overflow-y-auto px-4 py-6 pb-[calc(var(--app-nav-safe-offset)+5.75rem)]">
        
        {/* Welcome / Empty State */}
        {!hasSearched && (
          <div className="text-center mt-20 opacity-60">
            <Sparkles className="w-12 h-12 mx-auto text-cyan-500 mb-4 animate-pulse" />
            <h2 className="text-lg font-medium text-foreground">Ready to fuel?</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Search for high-protein meals, specific restaurants, or dietary preferences.
            </p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="space-y-4">
             {[1, 2, 3].map((i) => (
               <div key={i} className="h-24 bg-card rounded-xl animate-pulse" />
             ))}
          </div>
        )}

        {/* Results List */}
        <div className="space-y-4">
          {searchResults.map((item) => {
            // Convert item to meal for onMealSelect when clicked
            const meal = convertToMeal(item);
            
            return (
              <div
                key={item.id || meal.id}
                onClick={() => onMealSelect(meal)}
                className="cursor-pointer"
              >
                <FoodCard 
                  item={{
                    name: meal.name,
                    category: meal.category ?? 'restaurant',
                    macros: item.macros
                      ? {
                          calories: item.macros.calories ?? null,
                          protein: item.macros.protein ?? null,
                          carbs: item.macros.carbs ?? null,
                          fats: item.macros.fats ?? item.macros.fat ?? null,
                        }
                      : {
                          calories: meal.calories,
                          protein: meal.protein,
                          carbs: meal.carbs,
                          fats: meal.fats,
                        },
                    image_url: item.restaurantLogoUrl || item.restaurant_logo_url || item.logo_url || null,
                  }}
                  restaurantName={item.restaurant_name || 'Unknown Restaurant'} 
                />
              </div>
            );
          })}
          
          {hasSearched && !loading && results.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <p className="mb-2">No meals found matching that description.</p>
              <p className="text-sm text-muted-foreground/70">Try a different search term.</p>
            </div>
          )}

          {hasSearched && !loading && results.length > 0 && hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? 'Loading...' : 'Load more meals'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search Input Bar (Fixed at bottom) */}
      <div className="fixed bottom-[calc(var(--app-nav-safe-offset)+0.75rem)] left-0 right-0 z-40 px-4">
        <form onSubmit={handleSearch} className="max-w-md mx-auto">
          <div className="bg-card border border-border rounded-2xl p-2 shadow-2xl flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search meals, restaurants, or preferences..."
                className="w-full bg-muted border-none rounded-xl py-3 pl-4 pr-12 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-cyan-500 outline-none"
              />
              <button 
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500 hover:text-white rounded-lg px-3 py-2 transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

