'use client';

import { useState } from 'react';
import { Search, Flame, ChevronRight, Sparkles, X, AlertCircle } from 'lucide-react';
import type { Meal } from '../types';
import { getMealImageUrl } from '@/lib/image-utils';
import FoodCard from './FoodCard';

type Props = {
  onMealSelect: (meal: Meal) => void;
  onBack?: () => void;
};

// Convert API result to Meal type
function convertToMeal(item: any): Meal {
  // Determine category from item data
  const category = item.category === 'Grocery' || item.category === 'Hot Bar' 
    ? 'grocery' as const 
    : 'restaurant' as const;

  const mealName = item.item_name || item.name || 'Unknown Item';
  const restaurantName = item.restaurant_name || 'Unknown Restaurant';
  
  // Use getMealImageUrl to ensure we always have a real food image
  const imageUrl = getMealImageUrl(
    mealName,
    restaurantName,
    item.image_url || item.image
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
    id: item.id || `meal-${Date.now()}-${Math.random()}`,
    name: mealName,
    restaurant: restaurantName,
    restaurant_name: restaurantName, // Add for logo logic consistency
    calories: item.calories || 0,
    protein: item.protein_g || 0,
    carbs: item.carbs_g || 0,
    fats: typeof fats === 'number' ? fats : 0,
    image: imageUrl,
    price: item.price || null, // Keep null for proper handling
    description: item.description || '',
    category: category,
    dietary_tags: item.dietary_tags || item.tags || [],
  };
}

export function SearchScreen({ onMealSelect, onBack }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Meal[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);
    
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      
      const data = await res.json();
      console.log("Search API response:", data);
      
      // Normalize API response to always be an array
      let normalizedResults: any[] = [];
      
      if (Array.isArray(data)) {
        normalizedResults = data;
      } else if (data && typeof data === 'object' && Array.isArray(data.meals)) {
        // New format: { meals, hasMore, nextOffset, searchKey }
        normalizedResults = data.meals;
      } else if (data && typeof data === 'object' && Array.isArray(data.results)) {
        // Legacy format support
        normalizedResults = data.results;
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
    } finally {
      setLoading(false);
      setIsSearchOpen(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full w-full bg-background text-foreground font-sans">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-4 flex justify-between items-center">
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
      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-md mx-auto w-full space-y-6 pb-24">
        
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
                  item={item} 
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
        </div>
      </div>

      {/* Search Input Bar (Fixed at bottom) */}
      <div className="fixed bottom-20 left-0 right-0 px-4 z-40">
        <form onSubmit={handleSearch} className="max-w-md mx-auto">
          <div className="bg-card border border-border rounded-2xl p-2 shadow-2xl flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search meals, restaurants, or preferences..."
                className="w-full bg-muted border-none rounded-xl py-3 pl-4 pr-12 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-cyan-500 outline-none"
                onFocus={() => setIsSearchOpen(true)}
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

