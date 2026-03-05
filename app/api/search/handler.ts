import { createClient } from '@/utils/supabase/server';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';
import { classifyMenuItem } from '@/lib/menu-item-classifier';

/**
 * Dish taxonomy mapping: dishType → { keywords[] }
 * Maps dish types to name keywords for filtering
 * Minimum viable keywords per requirements
 */
const DISH_TAXONOMY: Record<string, { keywords: string[] }> = {
  burgers: {
    keywords: ['burger', 'burgers', 'whopper', 'big mac', 'cheeseburger', 'hamburger']
  },
  sandwiches: {
    keywords: ['sandwich', 'sandwiches', 'sandwhich', 'sandwiche', 'sub', 'subs', 'hoagie', 'hoagies', 'hero', 'heroes']
  },
  bowls: {
    keywords: ['bowl', 'bowls']
  },
  salads: {
    keywords: ['salad', 'salads']
  },
  wraps: {
    keywords: ['wrap', 'wraps']
  },
  tacos: {
    keywords: ['taco', 'tacos']
  },
  burritos: {
    keywords: ['burrito', 'burritos']
  },
  pizza: {
    keywords: ['pizza', 'pizzas']
  },
  sushi: {
    keywords: ['sushi', 'roll', 'rolls']
  },
  breakfast: {
    keywords: ['breakfast', 'pancake', 'pancakes', 'waffle', 'waffles', 'omelet', 'omelette', 'eggs', 'bacon', 'sausage']
  }
};

/**
 * Extracts dish type from query if present
 * Supports plurals and common misspellings (e.g., "sandwhich", "sandwiche")
 * Returns dishType string or null
 * Do NOT use embeddings to decide dish type - keyword matching only
 */
function extractDishType(query: string): string | null {
  if (!query || typeof query !== 'string') return null;
  
  const lowerQuery = query.toLowerCase().trim();
  
  // Check each dish type in taxonomy
  for (const [dishType, { keywords }] of Object.entries(DISH_TAXONOMY)) {
    // Check if any keyword matches (word boundary to avoid partial matches)
    for (const keyword of keywords) {
      // Escape special regex characters in keyword
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
      if (pattern.test(lowerQuery)) {
        return dishType;
      }
    }
  }
  
  return null;
}

/**
 * Applies strict dish-type filtering
 * Keeps only items where name matches keywords (category not used - menu_items doesn't have reliable category)
 * Applied BEFORE macro filtering per requirements
 */
function applyDishTypeFilter(items: any[], dishType: string): any[] {
  if (!dishType || !DISH_TAXONOMY[dishType]) {
    return items; // No dish type constraint
  }
  
  const { keywords } = DISH_TAXONOMY[dishType];
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  
  return items.filter((item: any) => {
    const itemName = (item.name || item.item_name || '').toLowerCase();
    
    // Check if name matches any keyword (word boundary to avoid partial matches)
    const nameMatches = lowerKeywords.some(keyword => {
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
      return pattern.test(itemName);
    });
    
    return nameMatches;
  });
}

/**
 * STRICT: Determines if a menu item is a complete dish (not an ingredient/modifier)
 * Used by ALL search paths (vector search, fast-path, fallback, quick-picks, chat)
 * Returns true ONLY if item is clearly a full meal, false for ingredients/add-ons/sides
 * 
 * @param menuItem - The menu item to check
 * @param dishType - Optional dish type (e.g., 'burritos', 'burgers'). If provided and item name matches dishType keywords, include it even if category might suggest otherwise
 * @returns true if item is a dish, false if it's an ingredient/modifier
 */
function isDishItem(menuItem: any, dishType?: string | null): boolean {
  const category = (menuItem.category || '').toLowerCase().trim();
  const name = (menuItem.name || menuItem.item_name || '').toLowerCase().trim();
  const words = name.split(/\s+/).filter((w: string) => w.length > 0);

  // PRIORITY: If dishType is provided, check if name matches dishType keywords first
  // This ensures items like "Breakfast Burrito" are included when searching for "burritos"
  // even if category is "breakfast" or another category
  if (dishType && DISH_TAXONOMY[dishType]) {
    const { keywords } = DISH_TAXONOMY[dishType];
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    const nameMatchesDishType = lowerKeywords.some(keyword => {
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
      return pattern.test(name);
    });
    
    // If name matches dishType keywords, include it (unless it's clearly an excluded category)
    if (nameMatchesDishType) {
      // Still exclude if category is clearly an ingredient/modifier
      const excludedCategories = [
        'sauce', 'dressing', 'topping', 'extra', 'add-on', 'addon', 'add on',
        'ingredient', 'a la carte', 'condiment', 'condiments',
        'beverage', 'drink', 'beverages', 'modifier', 'mix-in', 'mix in', 'mixin',
        'option', 'choice', 'selection', 'protein-only', 'rice-only', 'utensil', 'utensils'
      ];
      
      // Only exclude if category is clearly an ingredient/modifier
      // Allow "breakfast", "lunch", "dinner" categories even if they're not in mealCategories
      if (!excludedCategories.some(excluded => category.includes(excluded))) {
        return true; // Name matches dishType, include it
      }
    }
  }

  // STRICT: Exclude by category first (most reliable)
  const excludedCategories = [
    'sauce', 'dressing', 'topping', 'extra', 'add-on', 'addon', 'add on',
    'ingredient', 'a la carte', 'kids', 'condiment', 'condiments',
    'beverage', 'drink', 'beverages', 'modifier', 'mix-in', 'mix in', 'mixin',
    'option', 'choice', 'selection', 'protein-only', 'rice-only', 'utensil', 'utensils'
  ];
  
  if (excludedCategories.some(excluded => category.includes(excluded))) {
    return false; // Explicitly excluded category
  }

  // COMPONENT BLACKLIST: Check name for component/ingredient terms BEFORE mealCategories allow-list
  // This ensures items like "Flour Tortilla", "Hard Shell", "Side of Rice" are excluded
  // even if category says "entree/entrees"
  const componentBlacklistPatterns = [
    // Tortillas and shells
    /^(flour|corn|wheat|whole\s+wheat)\s+tortilla(s)?$/i,
    /^tortilla(s)?\s*\(/i,  // "Tortilla (Tacos)"
    /^(hard|soft)\s+shell(s)?$/i,
    /^shell(s)?\s*\(/i,     // "Shell (Tacos)"
    
    // Buns and bread components
    /^(burger|hamburger|brioche|sesame|whole\s+wheat)\s+bun(s)?$/i,
    /^bun(s)?\s+only$/i,
    
    // Patties
    /^(beef|chicken|turkey|veggie|vegetarian)\s+(patty|patties)$/i,
    /^(patty|patties)$/i,
    
    // Rice and beans (standalone, not in meal names)
    /^side\s+of\s+(rice|beans)$/i,
    /^(white|brown|wild|jasmine|basmati)\s+rice$/i,
    /^(black|pinto|refried|kidney)\s+beans$/i,
    /^rice\s+only$/i,
    /^beans\s+only$/i,
    
    // Protein-only items
    /^(steak|chicken|beef|pork|turkey|tofu|tempeh)\s+only$/i,
    /^protein\s+(scoop|only|add-on|addon)$/i,
    
    // Sauces and dressings (standalone or packets)
    /^(sauce|dressing)\s+packet(s)?$/i,
    /^packet(s)?\s+of\s+(sauce|dressing|ketchup|mustard|mayo|mayonnaise)$/i,
    /^(bbq|hot|chipotle|ranch|caesar|italian|balsamic|honey\s+mustard)\s+(sauce|dressing)$/i,
    
    // Toppings and add-ons
    /^(add-on|addon|add\s+on)\s+(cheese|guacamole|salsa|sour\s+cream)$/i,
    /^(extra|additional)\s+(cheese|guacamole|salsa|sour\s+cream|protein|rice|beans)$/i,
    /^(cheese|guacamole|salsa|sour\s+cream)\s+(topping|add-on|addon)$/i,
    
    // Side items
    /^side\s+of\s+(rice|beans|guacamole|salsa|cheese|sour\s+cream|protein)$/i,
    
    // Standalone components (but allow if part of meal name like "Chicken Burrito")
    /^(flour|corn|wheat)\s+tortilla$/i,
    /^(hard|soft)\s+shell$/i,
  ];
  
  // Check if name matches component blacklist patterns
  // But be conservative: if name contains meal keywords (burrito, taco, bowl, etc.), allow it
  const hasMealKeyword = /(burrito|taco|bowl|burger|sandwich|wrap|salad|pizza|pasta|quesadilla|sub|hoagie|panini|calzone|pita|combo|meal|platter|entree|entrée|main|plate)/i.test(name);
  
  if (!hasMealKeyword && componentBlacklistPatterns.some(pattern => pattern.test(name))) {
    return false; // Component blacklist match (and not a meal)
  }

  // STRICT: Include only meal categories (allow-list approach)
  const mealCategories = [
    'entree', 'entrée', 'main', 'bowl', 'plate', 'sandwich', 'burger',
    'salad', 'wrap', 'pasta', 'pizza', 'taco', 'sushi', 'burrito',
    'quesadilla', 'sub', 'hoagie', 'panini', 'calzone', 'pita',
    'signature bowl', 'power bowl', 'protein bowl', 'grain bowl',
    'breakfast', 'lunch', 'dinner', 'combo', 'meal', 'platter',
    'stir-fry', 'stir fry', 'curry', 'noodles', 'ramen', 'pho',
    'omelet', 'omelette', 'skillet', 'hash', 'benedict', 'appetizer'
  ];
  
  // If category explicitly indicates a meal, include it
  if (mealCategories.some(mealCat => category.includes(mealCat))) {
    return true;
  }

  // STRICT: Exclude items with modifier patterns in name
  const excludedPatterns = [
    /^add\s+/i,           // "add ..."
    /^extra\s+/i,         // "extra ..."
    /^side\s+of\s+/i,     // "side of ..."
    /^cup\s+of\s+/i,      // "cup of ..."
    /^serving\s+of\s+/i,  // "serving of ..."
    /^with\s+/i,          // "with ..."
    /^\+\s+/i,            // "+ ..."
    /^plus\s+/i,          // "plus ..."
    /^additional\s+/i,    // "additional ..."
    /\s+add-on$/i,        // "... add-on"
    /\s+topping$/i,       // "... topping"
    /\s+sauce$/i,         // "... sauce"
    /\s+dressing$/i,      // "... dressing"
    /protein\s+scoop/i,   // "protein scoop"
    /^rice$/i,            // Just "rice"
    /^tortilla$/i,        // Just "tortilla"
  ];
  
  if (excludedPatterns.some(pattern => pattern.test(name))) {
    return false;
  }

  // STRICT: Exclude common single-word ingredients (even if no category)
  const singleWordIngredients = [
    'lettuce', 'spinach', 'kale', 'arugula', 'chicken', 'rice', 'avocado',
    'egg', 'eggs', 'steak', 'bacon', 'cheese', 'sauce', 'dressing', 'fries',
    'bread', 'tortilla', 'tomato', 'tomatoes', 'onion', 'onions', 'pepper',
    'peppers', 'beans', 'salsa', 'guacamole', 'mayo', 'mayonnaise',
    'ketchup', 'mustard', 'ranch', 'protein', 'quinoa', 'couscous'
  ];
  
  if (words.length === 1 && singleWordIngredients.includes(name.trim())) {
    return false;
  }

  // STRICT: Exclude two-word ingredient combinations
  const twoWordIngredients = [
    'sour cream', 'bbq sauce', 'hot sauce', 'chipotle sauce', 'ranch dressing',
    'black beans', 'pinto beans', 'white rice', 'brown rice', 'wild rice',
    'grilled chicken', 'chicken breast', 'ground beef', 'extra protein',
    'romaine lettuce', 'iceberg lettuce', 'red onion', 'green pepper',
    'bell pepper', 'jalapeño', 'jalapeno', 'cheddar cheese', 'swiss cheese'
  ];
  
  if (words.length === 2 && twoWordIngredients.includes(name.trim())) {
    return false;
  }

  // Use classifyMenuItem as additional check
  const classification = classifyMenuItem({ category, name });
  if (!classification.isDish) {
    return false;
  }

  // STRICT: For items without clear meal indicators, require 3+ words
  // (multi-word descriptions are more likely to be full meals)
  if (words.length < 3 && !mealCategories.some(mealCat => category.includes(mealCat))) {
    // Additional check: exclude if it's clearly a list of ingredients
    const ingredientListPattern = /^(with|and|plus|\+)\s+/i;
    if (ingredientListPattern.test(name)) {
      return false; // Starts with "with", "and", "plus" = likely ingredient list
    }
    // If unsure and short name without meal category, exclude
    return false;
  }

  // STRICT: Include items with meal keywords in name (even if category is unclear)
  const mealKeywords = [
    'bowl', 'salad', 'sandwich', 'wrap', 'plate', 'entree', 'combo',
    'meal', 'pizza', 'burrito', 'taco', 'quesadilla', 'pasta',
    'burger', 'sub', 'hoagie', 'panini', 'calzone', 'pita',
    'breakfast', 'lunch', 'dinner', 'platter', 'skillet', 'hash',
    'benedict', 'omelet', 'omelette', 'stir-fry', 'stir fry',
    'curry', 'ramen', 'pho', 'noodles', 'sushi', 'roll'
  ];
  
  if (mealKeywords.some(keyword => name.includes(keyword))) {
    return true; // Name contains meal keyword
  }

  // STRICT: Default to exclude if we can't confidently say it's a meal
  return false;
}

/**
 * Filters items to only include dishes (not ingredients/modifiers)
 * Shared function used by ALL search paths
 * Returns filtered array and logs excluded items for debugging
 * 
 * @param items - Array of menu items to filter
 * @param dishType - Optional dish type. If provided, items matching dishType keywords are prioritized for inclusion
 */
function filterToDishes(items: any[], dishType?: string | null): any[] {
  if (!items || items.length === 0) return [];
  
  const beforeCount = items.length;
  const excluded: Array<{ name: string; category: string; reason: string }> = [];
  
  const filtered = items.filter((item: any) => {
    const isDish = isDishItem(item, dishType);
    
    if (!isDish) {
      // Determine exclusion reason for debugging
      const category = (item.category || '').toLowerCase().trim();
      const name = (item.name || item.item_name || '').toLowerCase().trim();
      const words = name.split(/\s+/).filter((w: string) => w.length > 0);
      
      let reason = 'unknown';
      
      // Check exclusion reasons in order of priority
      const excludedCategories = [
        'sauce', 'dressing', 'topping', 'extra', 'add-on', 'addon', 'add on',
        'ingredient', 'a la carte', 'kids', 'condiment', 'condiments',
        'beverage', 'drink', 'beverages', 'modifier', 'mix-in', 'mix in', 'mixin',
        'option', 'choice', 'selection', 'protein-only', 'rice-only', 'utensil', 'utensils'
      ];
      
      if (excludedCategories.some(excluded => category.includes(excluded))) {
        reason = `excluded category: ${category}`;
      } else {
        // Check component blacklist (runs before mealCategories)
        const componentBlacklistPatterns = [
          /^(flour|corn|wheat|whole\s+wheat)\s+tortilla(s)?$/i,
          /^tortilla(s)?\s*\(/i,
          /^(hard|soft)\s+shell(s)?$/i,
          /^shell(s)?\s*\(/i,
          /^(burger|hamburger|brioche|sesame|whole\s+wheat)\s+bun(s)?$/i,
          /^bun(s)?\s+only$/i,
          /^(beef|chicken|turkey|veggie|vegetarian)\s+(patty|patties)$/i,
          /^(patty|patties)$/i,
          /^side\s+of\s+(rice|beans)$/i,
          /^(white|brown|wild|jasmine|basmati)\s+rice$/i,
          /^(black|pinto|refried|kidney)\s+beans$/i,
          /^rice\s+only$/i,
          /^beans\s+only$/i,
          /^(steak|chicken|beef|pork|turkey|tofu|tempeh)\s+only$/i,
          /^protein\s+(scoop|only|add-on|addon)$/i,
          /^(sauce|dressing)\s+packet(s)?$/i,
          /^packet(s)?\s+of\s+(sauce|dressing|ketchup|mustard|mayo|mayonnaise)$/i,
          /^(bbq|hot|chipotle|ranch|caesar|italian|balsamic|honey\s+mustard)\s+(sauce|dressing)$/i,
          /^(add-on|addon|add\s+on)\s+(cheese|guacamole|salsa|sour\s+cream)$/i,
          /^(extra|additional)\s+(cheese|guacamole|salsa|sour\s+cream|protein|rice|beans)$/i,
          /^(cheese|guacamole|salsa|sour\s+cream)\s+(topping|add-on|addon)$/i,
          /^side\s+of\s+(rice|beans|guacamole|salsa|cheese|sour\s+cream|protein)$/i,
          /^(flour|corn|wheat)\s+tortilla$/i,
          /^(hard|soft)\s+shell$/i,
        ];
        
        const hasMealKeyword = /(burrito|taco|bowl|burger|sandwich|wrap|salad|pizza|pasta|quesadilla|sub|hoagie|panini|calzone|pita|combo|meal|platter|entree|entrée|main|plate)/i.test(name);
        
        if (!hasMealKeyword && componentBlacklistPatterns.some(pattern => pattern.test(name))) {
          reason = 'component blacklist: name contains component/ingredient term';
        } else {
          const excludedPatterns = [
            /^add\s+/i, /^extra\s+/i, /^side\s+of\s+/i, /^cup\s+of\s+/i,
            /^serving\s+of\s+/i, /^with\s+/i, /^\+\s+/i, /^plus\s+/i,
            /^additional\s+/i, /\s+add-on$/i, /\s+topping$/i, /\s+sauce$/i,
            /\s+dressing$/i, /protein\s+scoop/i, /^rice$/i, /^tortilla$/i,
            /^(flour|corn|wheat)\s+tortilla$/i,
            /^tortilla\s*\(/i,
            /^(hard|soft)\s+shell$/i,
            /^shell\s*\(/i,
            /^(burger|hamburger)\s+bun$/i,
            /^side\s+of\s+rice$/i,
            /^protein\s+scoop$/i,
            /^sauce\s+packet$/i,
          ];
          
          if (excludedPatterns.some(pattern => pattern.test(name))) {
            reason = 'excluded pattern in name';
          } else {
            const singleWordIngredients = [
              'lettuce', 'spinach', 'kale', 'arugula', 'chicken', 'rice', 'avocado',
              'egg', 'eggs', 'steak', 'bacon', 'cheese', 'sauce', 'dressing', 'fries',
              'bread', 'tortilla', 'tomato', 'tomatoes', 'onion', 'onions', 'pepper',
              'peppers', 'beans', 'salsa', 'guacamole', 'mayo', 'mayonnaise',
              'ketchup', 'mustard', 'ranch', 'protein', 'quinoa', 'couscous'
            ];
            
            if (words.length === 1 && singleWordIngredients.includes(name.trim())) {
              reason = 'single-word ingredient';
            } else {
              const twoWordIngredients = [
                'sour cream', 'bbq sauce', 'hot sauce', 'chipotle sauce', 'ranch dressing',
                'black beans', 'pinto beans', 'white rice', 'brown rice', 'wild rice',
                'grilled chicken', 'chicken breast', 'ground beef', 'extra protein',
                'romaine lettuce', 'iceberg lettuce', 'red onion', 'green pepper',
                'bell pepper', 'jalapeño', 'jalapeno', 'cheddar cheese', 'swiss cheese'
              ];
              
              if (words.length === 2 && twoWordIngredients.includes(name.trim())) {
                reason = 'two-word ingredient';
              } else {
                const mealCategories = [
                  'entree', 'entrée', 'main', 'bowl', 'plate', 'sandwich', 'burger',
                  'salad', 'wrap', 'pasta', 'pizza', 'taco', 'sushi', 'burrito',
                  'quesadilla', 'sub', 'hoagie', 'panini', 'calzone', 'pita',
                  'signature bowl', 'power bowl', 'protein bowl', 'grain bowl',
                  'breakfast', 'lunch', 'dinner', 'combo', 'meal', 'platter',
                  'stir-fry', 'stir fry', 'curry', 'noodles', 'ramen', 'pho',
                  'omelet', 'omelette', 'skillet', 'hash', 'benedict', 'appetizer'
                ];
                
                if (words.length < 3 && !mealCategories.some(mealCat => category.includes(mealCat))) {
                  reason = 'short name without meal category';
                } else {
                  reason = 'failed classification check or no meal keywords';
                }
              }
            }
          }
        }
      }
      
      // Track exclusion for debug logging (first 10 only)
      if (excluded.length < 10) {
        excluded.push({
          name: item.name || item.item_name || 'unknown',
          category: item.category || 'unknown',
          reason
        });
      }
    }
    
    return isDish;
  });
  
  const afterCount = filtered.length;
  const removedCount = beforeCount - afterCount;
  
  console.log(`[searchHandler] Dish filter: ${beforeCount} → ${afterCount} items (removed ${removedCount} ingredients/modifiers)`);
  
  if (excluded.length > 0) {
    console.log(`[searchHandler] Top ${excluded.length} excluded samples:`, excluded.slice(0, 10));
  }
  
  return filtered;
}

/**
 * Normalizes item name for deduplication
 * Rules: lowercase, trim, collapse whitespace, remove punctuation like "™ ® ( )"
 */
function normalizeItemName(name: string): string {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/[™®()]/g, '') // Remove punctuation like "™ ® ( )"
    .replace(/[^\w\s-]/g, '') // Remove other special characters, keep alphanumeric, spaces, hyphens
    .trim();
}

/**
 * Creates a stable dedupe key for a meal item
 * Prefers id if present, otherwise uses (restaurant_name + normalized_item_name)
 */
function getDedupeKey(item: any): string {
  // Prefer id if present
  if (item.id) {
    return `id:${String(item.id)}`;
  }
  
  // Fallback to restaurant_name + normalized_item_name
  const restaurant = (item.restaurant_name || '').trim();
  const normalizedName = normalizeItemName(item.name || item.item_name || '');
  return `name:${restaurant}|${normalizedName}`;
}

export interface SearchParams {
  query: string;
  calorieCap?: number;
  minProtein?: number;
  maxCarbs?: number;
  maxFat?: number;
  diet?: string;
  restaurant?: string;
  location?: string;
  userContext?: any;
  offset?: number;
  limit?: number;
  searchKey?: string;
  isPagination?: boolean;
}

/**
 * Detects if the user explicitly requested a restaurant
 * Only treats restaurant as explicit if:
 * - A restaurant entity was extracted in params.restaurant, OR
 * - Query contains "from/at/in <restaurant>" pattern
 */
function isRestaurantExplicitlyRequested(params: SearchParams): boolean {
  // Check if restaurant was extracted as an entity
  if (params.restaurant) {
    return true;
  }

  // Check query for explicit restaurant patterns
  const queryLower = (params.query || '').toLowerCase();
  const explicitPatterns = [
    /\bfrom\s+([a-z\s]+?)(?:\s|$)/i,
    /\bat\s+([a-z\s]+?)(?:\s|$)/i,
    /\bin\s+([a-z\s]+?)(?:\s|$)/i,
  ];

  return explicitPatterns.some(pattern => pattern.test(queryLower));
}

/**
 * Detects if the query contains explicit numeric constraints that can be handled via JSON filtering
 * Returns true if query has numeric constraints (calories, protein, carbs, fat) and no restaurant name
 */
function hasStructuredConstraints(params: SearchParams): boolean {
  // Check if we have explicit numeric constraints in params
  const hasParamsConstraints = !!(
    params.calorieCap ||
    params.minProtein ||
    params.maxCarbs ||
    params.maxFat
  );

  // Check if there's no restaurant filter (fast-path only works without restaurant)
  const hasNoRestaurant = !params.restaurant;

  // Also check the query text for common constraint patterns
  const queryLower = (params.query || '').toLowerCase();
  const hasConstraintKeywords = !!(
    // Calories: "under 700 calories", "below 500 cal", "less than 600 calories"
    queryLower.match(/\b(under|below|less than|at most|max|maximum)\s+(\d+)\s*(calories?|cal)\b/) ||
    // Protein: "at least 30 grams protein", "over 40g protein", "minimum 25 protein"
    queryLower.match(/\b(at least|over|above|min|minimum)\s+(\d+)\s*(grams?\s+)?(protein|pro)\b/) ||
    // Carbs: "under 50 grams carbs", "below 30g carbs", "max 40 carbs"
    queryLower.match(/\b(under|below|less than|at most|max|maximum)\s+(\d+)\s*(grams?\s+)?(carbs?|carbohydrates?)\b/) ||
    // Fat: "under 20 grams fat", "below 15g fat", "max 25 fat"
    queryLower.match(/\b(under|below|less than|at most|max|maximum)\s+(\d+)\s*(grams?\s+)?(fat|fats)\b/)
  );

  return (hasParamsConstraints || hasConstraintKeywords) && hasNoRestaurant;
}

/**
 * Normalizes dietary tags to a consistent lowercase format with synonym handling
 * Handles dietary_tags, tags, and items[].dietary_tags
 */
function normalizeDietaryTags(tags: any): string[] {
  if (!tags) return [];
  
  // Handle array of strings
  if (Array.isArray(tags)) {
    return tags
      .filter(tag => typeof tag === 'string' && tag.trim().length > 0)
      .map(tag => normalizeDietaryTag(tag.trim()));
  }
  
  // Handle single string
  if (typeof tags === 'string') {
    return [normalizeDietaryTag(tags.trim())].filter(Boolean);
  }
  
  return [];
}

/**
 * Normalizes a single dietary tag to lowercase with synonym handling
 */
function normalizeDietaryTag(tag: string): string {
  if (!tag || typeof tag !== 'string') return '';
  
  let normalized = tag.toLowerCase().trim();
  
  // Handle synonyms
  const synonyms: Record<string, string> = {
    'dairy free': 'dairy-free',
    'gluten free': 'gluten-free',
    'nut free': 'nut-free',
    'pescetarian': 'pescatarian',
    'plant based': 'plant-based',
    'sugar free': 'sugar-free',
    'low carb': 'low-carb',
    'high protein': 'high-protein',
    'egg free': 'egg-free',
    'soy free': 'soy-free',
    'shellfish free': 'shellfish-free',
    'fish free': 'fish-free',
  };
  
  // Check for exact synonym match
  if (synonyms[normalized]) {
    return synonyms[normalized];
  }
  
  // Check for partial matches (e.g., "dairy free option" -> "dairy-free")
  for (const [key, value] of Object.entries(synonyms)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  
  return normalized;
}

/**
 * DIET LOGIC REMOVED - All diet/dietary tag filtering is disabled
 * This function is kept for compatibility but returns empty arrays
 */
function extractDietaryConstraints(params: SearchParams): { requiredTags: string[]; excludedTags: string[] } {
  // All diet logic removed - return empty arrays
  return { requiredTags: [], excludedTags: [] };
}

/**
 * DIET LOGIC REMOVED - All diet/dietary tag filtering is disabled
 * This function is kept for compatibility but returns items unchanged
 */
function applyDietaryFilter(items: any[], requiredTags: string[], excludedTags: string[]): any[] {
  // All diet logic removed - return items unchanged
  return items;
}

/**
 * Canonical normalization: single source of truth
 * Extracts data from real schema columns and macros jsonb ONLY
 * STRICT: Discards items if macros missing or calories/protein/carbs/fat missing or not numeric
 */
function normalizeMeal(item: any): any | null {
  // Extract from real schema columns (guaranteed to exist)
  const restaurantName = item.restaurant_name || null;
  const itemName = item.name || null;
  const category = item.category || null;
  const imageUrl = item.image_url || null; // Allow null
  const priceEstimate = item.price_estimate || null; // Allow null

  // Extract macros STRICTLY from macros jsonb column
  const macrosJson = item.macros;
  
  // STRICT: macros must exist and be an object
  if (!macrosJson || typeof macrosJson !== 'object') {
    return null; // Discard - no macros jsonb
  }

  // Extract macros with strict validation
  // Support keys: calories, protein, carbs, fat (numbers only)
  const calories = typeof macrosJson.calories === 'number' ? macrosJson.calories : null;
  const protein = typeof macrosJson.protein === 'number' ? macrosJson.protein : null;
  const carbs = typeof macrosJson.carbs === 'number' ? macrosJson.carbs : null;
  const fat = typeof macrosJson.fat === 'number' ? macrosJson.fat : null;

  // STRICT: Discard if calories missing or not numeric or 0
  if (calories === null || calories === 0 || isNaN(calories)) {
    return null; // Discard - invalid calories
  }

  // STRICT: Discard if other macros missing or not numeric (all must be present and valid)
  // Allow 0 values for protein/carbs/fat, but not null/NaN
  if (protein === null || isNaN(protein) || 
      carbs === null || isNaN(carbs) || 
      fat === null || isNaN(fat)) {
    return null; // Discard - incomplete macros
  }

  // Extract and normalize dietary tags from multiple possible sources
  const dietaryTagsRaw = item.dietary_tags || item.tags || item.items?.[0]?.dietary_tags || [];
  const normalizedTags = normalizeDietaryTags(dietaryTagsRaw);
  
  // Return canonical meal object (single source of truth)
  return {
    id: item.id,
    restaurant_name: restaurantName,
    name: itemName,
    category: category || '',
    image_url: imageUrl,
    price_estimate: priceEstimate,
    calories: calories,
    protein: protein,
    carbs: carbs,
    fat: fat,
    // Include aliases for UI compatibility
    protein_g: protein,
    carbs_g: carbs,
    fats_g: fat,
    fats: fat,
    fat_g: fat,
    price: priceEstimate,
    // Preserve original for reference
    restaurant: restaurantName,
    item_name: itemName,
    // Normalized dietary tags (single source of truth)
    normalized_tags: normalizedTags,
    dietary_tags: normalizedTags // Also include for UI compatibility
  };
}

/**
 * Simple seeded random number generator for deterministic shuffling
 */
function seededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

/**
 * Deterministic shuffle using a seed
 */
function deterministicShuffle<T>(array: T[], seed: number): T[] {
  const shuffled = [...array];
  const rng = seededRandom(seed);
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
}

/**
 * Generates a deterministic seed from searchKey, userId, and dayOfYear
 */
function generateShuffleSeed(searchKey: string, userId?: string, dayOfYear?: number): number {
  const user = userId || 'guest';
  const day = dayOfYear ?? (() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  })();
  
  // Combine into a string and hash it
  const seedString = `${searchKey}|${user}|${day}`;
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    const char = seedString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash);
}

/**
 * Restaurant Diversity Selector
 * Reorders items to maximize restaurant diversity across the entire list
 * This creates a diverse ordering that pagination can slice from
 * 
 * Rules for ordering:
 * - Interleave items from different restaurants (round-robin style)
 * - Use deterministic shuffling within each restaurant to prevent repeated results
 * - Prioritize restaurant diversity: prefer showing different restaurants before repeats
 * 
 * The result is a reordered list where:
 * - First 5 items ideally come from 5 different restaurants (max 1 each, or 2 if <5 restaurants exist)
 * - Subsequent items continue diversity but allow more per restaurant
 */
function applyRestaurantDiversity(
  items: any[],
  searchKey: string,
  userId?: string
): any[] {
  if (!items || items.length === 0) return [];
  
  // Group items by restaurant
  const restaurantGroups = new Map<string, any[]>();
  for (const item of items) {
    const restaurant = item.restaurant_name || 'unknown';
    if (!restaurantGroups.has(restaurant)) {
      restaurantGroups.set(restaurant, []);
    }
    restaurantGroups.get(restaurant)!.push(item);
  }
  
  const uniqueRestaurants = Array.from(restaurantGroups.keys());
  const totalRestaurants = uniqueRestaurants.length;
  
  // Generate deterministic seed for shuffling
  const dayOfYear = (() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  })();
  const seed = generateShuffleSeed(searchKey, userId, dayOfYear);
  
  // Shuffle restaurants deterministically
  const shuffledRestaurants = deterministicShuffle(uniqueRestaurants, seed);
  
  // Shuffle items within each restaurant deterministically
  const shuffledRestaurantGroups = new Map<string, any[]>();
  for (const restaurant of shuffledRestaurants) {
    const restaurantItems = restaurantGroups.get(restaurant) || [];
    const restaurantSeed = generateShuffleSeed(`${searchKey}|${restaurant}`, userId, dayOfYear);
    shuffledRestaurantGroups.set(restaurant, deterministicShuffle(restaurantItems, restaurantSeed));
  }
  
  // Round-robin interleaving: take 1 from each restaurant in turn
  // This creates a diverse ordering where first 5 items come from 5 different restaurants
  const diverseItems: any[] = [];
  const maxPerRestaurantFirstPass = totalRestaurants >= 5 ? 1 : 2; // Max 1 if 5+ restaurants, else max 2
  
  // First pass: interleave up to maxPerRestaurantFirstPass items from each restaurant
  let allExhausted = false;
  let passCount = 0;
  
  while (!allExhausted && passCount < maxPerRestaurantFirstPass) {
    allExhausted = true;
    for (const restaurant of shuffledRestaurants) {
      const restaurantItems = shuffledRestaurantGroups.get(restaurant) || [];
      const itemsUsed = diverseItems.filter(item => item.restaurant_name === restaurant).length;
      
      if (itemsUsed < maxPerRestaurantFirstPass && restaurantItems.length > itemsUsed) {
        diverseItems.push(restaurantItems[itemsUsed]);
        allExhausted = false;
      }
    }
    passCount++;
  }
  
  // Second pass: continue interleaving with relaxed limits (max 3 per restaurant total)
  const maxPerRestaurantTotal = 3;
  let secondPassCount = 0;
  allExhausted = false;
  
  while (!allExhausted && secondPassCount < 10) { // Safety limit
    allExhausted = true;
    for (const restaurant of shuffledRestaurants) {
      const restaurantItems = shuffledRestaurantGroups.get(restaurant) || [];
      const itemsUsed = diverseItems.filter(item => item.restaurant_name === restaurant).length;
      
      if (itemsUsed < maxPerRestaurantTotal && restaurantItems.length > itemsUsed) {
        diverseItems.push(restaurantItems[itemsUsed]);
        allExhausted = false;
      }
    }
    secondPassCount++;
  }
  
  // Add any remaining items that didn't fit (shouldn't happen often, but handle edge cases)
  for (const restaurant of shuffledRestaurants) {
    const restaurantItems = shuffledRestaurantGroups.get(restaurant) || [];
    const itemsUsed = diverseItems.filter(item => item.restaurant_name === restaurant).length;
    
    for (let i = itemsUsed; i < restaurantItems.length; i++) {
      if (!diverseItems.some(item => item.id === restaurantItems[i].id)) {
        diverseItems.push(restaurantItems[i]);
      }
    }
  }
  
  const firstPageRestaurants = new Set(diverseItems.slice(0, 5).map(item => item.restaurant_name)).size;
  console.log(`[searchHandler] Restaurant diversity: reordered ${diverseItems.length} items, first 5 from ${firstPageRestaurants} restaurants`);
  
  return diverseItems;
}

/**
 * Applies restaurant filter only
 * Dish filtering is handled separately by filterToDishes() which is called earlier
 */
function applyRestaurantFilter(items: any[], restaurantFilter?: string): any[] {
  if (!restaurantFilter) return items;
  
  return items.filter((item: any) => {
    return item.restaurant_name === restaurantFilter;
  });
}

/**
 * Decodes searchKey to reconstruct original search parameters
 * Returns reconstructed params or null if decoding fails
 */
function decodeSearchKey(searchKey: string): {
  q: string;
  cal?: number;
  pro?: number;
  carb?: number;
  fat?: number;
  rest?: string;
  dishType?: string | null;
} | null {
  try {
    const decoded = Buffer.from(searchKey, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    return parsed;
  } catch (error) {
    console.warn('[searchHandler] Failed to decode searchKey:', error);
    return null;
  }
}

export async function searchHandler(params: SearchParams) {
  const supabase = await createClient();
  
  // Defensive check to ensure Supabase client is properly initialized
  if (!supabase || typeof (supabase as any).rpc !== "function") {
    throw new Error("Supabase client missing rpc(). Did you forget to await createClient()?");
  }
  
  // For meal searches: always return exactly 5 on first response
  const limit = params.limit || 5;
  const offset = params.offset || 0;

  // RECONSTRUCT PARAMETERS FROM SEARCHKEY IF PRESENT (for pagination)
  // searchKey is the single source of truth for pagination
  let reconstructedParams: {
    query?: string;
    calorieCap?: number;
    minProtein?: number;
    maxCarbs?: number;
    maxFat?: number;
    restaurant?: string;
    dishType?: string | null;
  } = {};
  
  let currentSearchKey: string;
  let reconstructedQuery: string | undefined;
  let reconstructedDishType: string | null | undefined;
  
  if (params.searchKey) {
    // Decode searchKey to reconstruct original parameters
    const decoded = decodeSearchKey(params.searchKey);
    if (decoded) {
      reconstructedParams = {
        query: decoded.q || '',
        calorieCap: decoded.cal,
        minProtein: decoded.pro,
        maxCarbs: decoded.carb,
        maxFat: decoded.fat,
        restaurant: decoded.rest,
        dishType: decoded.dishType || null
      };
      reconstructedQuery = reconstructedParams.query;
      reconstructedDishType = reconstructedParams.dishType;
      currentSearchKey = params.searchKey; // Use provided searchKey as-is
      
      console.log('[searchHandler] Pagination request - decoded searchKey:', {
        searchKey: params.searchKey,
        reconstructedQuery,
        reconstructedDishType,
        reconstructedConstraints: {
          calorieCap: reconstructedParams.calorieCap,
          minProtein: reconstructedParams.minProtein,
          maxCarbs: reconstructedParams.maxCarbs,
          maxFat: reconstructedParams.maxFat,
          restaurant: reconstructedParams.restaurant
        }
      });
    } else {
      // Decoding failed, fall back to generating new key
      console.warn('[searchHandler] Failed to decode searchKey, generating new key');
      currentSearchKey = '';
    }
  } else {
    // No searchKey provided, use params as-is
    reconstructedQuery = undefined;
    reconstructedDishType = undefined;
    currentSearchKey = '';
  }

  // Use reconstructed params if available, otherwise use provided params
  // Priority: reconstructed (from searchKey) > provided params
  const effectiveQuery = reconstructedParams.query !== undefined 
    ? reconstructedParams.query 
    : (params.query?.trim() || '');
  const effectiveCalorieCap = reconstructedParams.calorieCap !== undefined 
    ? reconstructedParams.calorieCap 
    : params.calorieCap;
  const effectiveMinProtein = reconstructedParams.minProtein !== undefined 
    ? reconstructedParams.minProtein 
    : params.minProtein;
  const effectiveMaxCarbs = reconstructedParams.maxCarbs !== undefined 
    ? reconstructedParams.maxCarbs 
    : params.maxCarbs;
  const effectiveMaxFat = reconstructedParams.maxFat !== undefined 
    ? reconstructedParams.maxFat 
    : params.maxFat;
  const effectiveRestaurant = reconstructedParams.restaurant !== undefined 
    ? reconstructedParams.restaurant 
    : params.restaurant;

  // Extract dish type: use reconstructed if available, otherwise extract from query
  const dishType = reconstructedDishType !== undefined
    ? reconstructedDishType
    : (effectiveQuery ? extractDishType(effectiveQuery) : null);

  // Extract restaurant name (fuzzy normalized) if present
  let restaurantName: string | undefined = undefined;
  if (effectiveRestaurant) {
    restaurantName = effectiveRestaurant.trim();
  }

  // 1. GENERATE SEARCH KEY (Deterministic from normalized query + constraints + dish type + restaurant)
  // Must be deterministic so pagination uses same result set
  // Diet logic removed - no dietary tags in cache key
  // If searchKey was provided, use it; otherwise generate new one
  if (!currentSearchKey) {
    currentSearchKey = Buffer.from(JSON.stringify({
      q: effectiveQuery.toLowerCase() || '',
      cal: effectiveCalorieCap,
      pro: effectiveMinProtein,
      carb: effectiveMaxCarbs,
      fat: effectiveMaxFat,
      rest: restaurantName,
      dishType: dishType || null
    })).toString('base64');
  }

  // 2. PREPARE RESTAURANT FILTER (fuzzy normalized)
  let restaurantFilter: string | undefined = undefined;
  if (restaurantName) {
    try {
      const { data: restMatches } = await supabase.rpc('search_restaurants_trgm', {
        query_text: restaurantName
      });
      if (restMatches && restMatches.length > 0) {
        restaurantFilter = restMatches[0].name;
        console.log(`[searchHandler] Restaurant filter: ${restaurantFilter}`);
      }
    } catch (rpcError) {
      console.warn('[searchHandler] Restaurant RPC failed, continuing without restaurant filter:', rpcError);
      restaurantFilter = undefined;
    }
  }

  /**
   * Detects if query is generic meal discovery (should skip vector search)
   */
  function isGenericMealDiscovery(query: string): boolean {
    if (!query || query.trim().length === 0) return true;
    
    const lowerQuery = query.toLowerCase().trim();
    const genericPhrases = [
      'find meals',
      'what should i eat',
      'options',
      'food ideas',
      'food',
      'meals',
      'meal',
      'lunch',
      'dinner',
      'breakfast',
    ];
    
    // Check if query is exactly or starts with generic phrase
    return genericPhrases.some(phrase => {
      return lowerQuery === phrase || lowerQuery.startsWith(phrase + ' ');
    });
  }

  // 3. RETRIEVAL STRATEGY: Explicit modes
  // A) DB_FILTERED: dishType or restaurant present
  // B) DB_GENERIC: generic meal discovery (no OpenAI)
  // C) VECTOR: specific query (requires OpenAI)
  // D) VECTOR_FALLBACK: vector returned 0, fallback to DB_GENERIC
  
  let allItems: any[] = [];
  let retrievalStrategy: 'DB_FILTERED' | 'DB_GENERIC' | 'VECTOR' | 'VECTOR_FALLBACK' = 'DB_GENERIC';
  const candidatesBeforeFiltering = 0; // Will be set after retrieval
  
  if (dishType || restaurantFilter) {
    // STRATEGY A: DB_FILTERED - dishType or restaurant present
    retrievalStrategy = 'DB_FILTERED';
    console.log(`[searchHandler] Retrieval strategy: DB_FILTERED (dishType: ${dishType || 'none'}, restaurant: ${restaurantFilter || 'none'})`);
    
    try {
      let query = supabase
        .from('menu_items')
        .select(`
          id,
          restaurant_name,
          name,
          category,
          image_url,
          price_estimate,
          macros
        `);
      
      // Apply restaurant filter if present
      if (restaurantFilter) {
        query = query.ilike('restaurant_name', `%${restaurantFilter}%`);
      }
      
      // Fetch large candidate pool (500-1000 items) to cover whole DB
      const { data: dbItems, error: dbError } = await query.limit(1000);
      
      if (dbError) {
        console.error('[searchHandler] DB query error:', dbError);
        allItems = [];
      } else if (dbItems && dbItems.length > 0) {
        allItems = dbItems;
        console.log(`[searchHandler] DB_FILTERED returned ${allItems.length} candidates`);
      } else {
        console.log('[searchHandler] DB_FILTERED returned 0 items');
        allItems = [];
      }
    } catch (dbError) {
      console.error('[searchHandler] DB query exception:', dbError);
      allItems = [];
    }
  } else if (isGenericMealDiscovery(effectiveQuery)) {
    // STRATEGY B: DB_GENERIC - generic meal discovery, skip vector search entirely
    retrievalStrategy = 'DB_GENERIC';
    console.log(`[searchHandler] Retrieval strategy: DB_GENERIC (generic query: "${effectiveQuery}")`);
    
    try {
      // Deterministic DB query - no OpenAI required
      const { data: dbItems, error: dbError } = await supabase
        .from('menu_items')
        .select(`
          id,
          restaurant_name,
          name,
          category,
          image_url,
          price_estimate,
          macros
        `)
        .order('id', { ascending: true }) // Deterministic ordering
        .limit(1000);
      
      if (dbError) {
        console.error('[searchHandler] DB_GENERIC query error:', dbError);
        allItems = [];
      } else if (dbItems && dbItems.length > 0) {
        allItems = dbItems;
        console.log(`[searchHandler] DB_GENERIC returned ${allItems.length} candidates`);
      } else {
        console.log('[searchHandler] DB_GENERIC returned 0 items');
        allItems = [];
      }
    } catch (dbError) {
      console.error('[searchHandler] DB_GENERIC query exception:', dbError);
      allItems = [];
    }
  } else {
    // STRATEGY C: VECTOR - specific query, use vector search
    retrievalStrategy = 'VECTOR';
    console.log(`[searchHandler] Retrieval strategy: VECTOR (specific query: "${effectiveQuery}")`);
    
    if (effectiveQuery && effectiveQuery.trim().length > 0) {
      try {
        // Generate embedding
        let embedding: number[] = [];
        try {
          const { embedding: generatedEmbedding } = await embed({
            model: openai.embedding('text-embedding-3-small'),
            value: effectiveQuery,
          });
          embedding = generatedEmbedding;
        } catch (embedError) {
          console.warn('[searchHandler] Embedding generation failed:', embedError);
        }

        // Execute vector search if we have an embedding
        if (embedding.length > 0) {
          const { data: rawItems, error } = await supabase.rpc('match_menu_items', {
            query_embedding: embedding,
            match_threshold: 0.5,
            match_count: 1000
          });

          if (!error && rawItems && rawItems.length > 0) {
            allItems = rawItems;
            console.log(`[searchHandler] VECTOR returned ${allItems.length} candidates`);
          } else if (error) {
            console.warn('[searchHandler] Vector search RPC error:', error);
            allItems = [];
          } else {
            console.log('[searchHandler] VECTOR returned 0 items');
            allItems = [];
          }
        } else {
          allItems = [];
        }
        
        // STRATEGY D: VECTOR_FALLBACK - vector returned 0, fallback to DB_GENERIC
        if (allItems.length === 0) {
          retrievalStrategy = 'VECTOR_FALLBACK';
          console.log('[searchHandler] Vector returned 0 → fallback DB query used');
          console.log(`[searchHandler] Retrieval strategy: VECTOR_FALLBACK`);
          
          try {
            // Fallback to generic DB query - no OpenAI required
            const { data: fallbackItems, error: fallbackError } = await supabase
              .from('menu_items')
              .select(`
                id,
                restaurant_name,
                name,
                category,
                image_url,
                price_estimate,
                macros
              `)
              .order('id', { ascending: true }) // Deterministic ordering
              .limit(1000);
            
            if (fallbackError) {
              console.error('[searchHandler] VECTOR_FALLBACK query error:', fallbackError);
              allItems = [];
            } else if (fallbackItems && fallbackItems.length > 0) {
              allItems = fallbackItems;
              console.log(`[searchHandler] VECTOR_FALLBACK returned ${allItems.length} candidates`);
            } else {
              console.log('[searchHandler] VECTOR_FALLBACK returned 0 items');
              allItems = [];
            }
          } catch (fallbackException) {
            console.error('[searchHandler] VECTOR_FALLBACK query exception:', fallbackException);
            allItems = [];
          }
        }
      } catch (vectorError) {
        console.warn('[searchHandler] Vector search failed:', vectorError);
        allItems = [];
        
        // FALLBACK: If vector search exception occurred, use DB_GENERIC
        retrievalStrategy = 'VECTOR_FALLBACK';
        console.log('[searchHandler] Vector returned 0 → fallback DB query used');
        console.log(`[searchHandler] Retrieval strategy: VECTOR_FALLBACK`);
        
        try {
          const { data: fallbackItems, error: fallbackError } = await supabase
            .from('menu_items')
            .select(`
              id,
              restaurant_name,
              name,
              category,
              image_url,
              price_estimate,
              macros
            `)
            .order('id', { ascending: true })
            .limit(1000);
          
          if (fallbackError) {
            console.error('[searchHandler] VECTOR_FALLBACK query error:', fallbackError);
            allItems = [];
          } else if (fallbackItems && fallbackItems.length > 0) {
            allItems = fallbackItems;
            console.log(`[searchHandler] VECTOR_FALLBACK returned ${allItems.length} candidates`);
          } else {
            console.log('[searchHandler] VECTOR_FALLBACK returned 0 items');
            allItems = [];
          }
        } catch (fallbackException) {
          console.error('[searchHandler] VECTOR_FALLBACK query exception:', fallbackException);
          allItems = [];
        }
      }
    } else {
      allItems = [];
    }
  }
  
  // 4. APPLY DISH FILTER FIRST (before normalization to catch raw items)
  // Filter out ingredients/modifiers early
  // Pass dishType to filterToDishes so it can prioritize items matching dishType keywords
  const candidatesAfterRetrieval = allItems.length;
  const dishFilteredItems = filterToDishes(allItems, dishType);
  const candidatesAfterDishFilter = dishFilteredItems.length;
  
  // Log retrieval strategy and candidate count
  console.log('[searchHandler] Retrieval summary:', {
    retrievalStrategy,
    candidatesBeforeFiltering: candidatesAfterRetrieval
  });

  // 5. APPLY DISH-TYPE CONSTRAINT FILTER (if dish type detected in query)
  // Run BEFORE macro filtering per requirements
  // If dishType exists: only keep items whose name matches dish keywords
  let dishTypeFilteredItems = dishFilteredItems;
  
  if (dishType) {
    const beforeDishTypeCount = dishFilteredItems.length;
    dishTypeFilteredItems = applyDishTypeFilter(dishFilteredItems, dishType);
    const afterDishTypeCount = dishTypeFilteredItems.length;
    
    if (beforeDishTypeCount > afterDishTypeCount) {
      console.log(`[searchHandler] Dish-type filter (${dishType}): ${beforeDishTypeCount} → ${afterDishTypeCount} items`);
    }
    
    // Debug: Log excluded examples for dishType searches
    if (beforeDishTypeCount > afterDishTypeCount) {
      const excludedItems = dishFilteredItems.filter((item: any) => {
        const itemName = (item.name || item.item_name || '').toLowerCase();
        const { keywords } = DISH_TAXONOMY[dishType];
        const lowerKeywords = keywords.map(k => k.toLowerCase());
        const nameMatches = lowerKeywords.some(keyword => {
          const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const pattern = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
          return pattern.test(itemName);
        });
        return !nameMatches;
      });
      
      // Log up to 5 excluded examples with reasons
      const excludedExamples = excludedItems.slice(0, 5).map((item: any) => {
        const itemName = item.name || item.item_name || 'unknown';
        const itemCategory = item.category || 'unknown';
        return {
          name: itemName,
          category: itemCategory,
          reason: `Name does not contain ${dishType} keywords (${DISH_TAXONOMY[dishType].keywords.join(', ')})`
        };
      });
      
      if (excludedExamples.length > 0) {
        console.log(`[searchHandler] DishType (${dishType}) search - excluded examples:`, excludedExamples);
      }
    }
    
    // If dish-type filtering results in 0 items, return early with message
    if (dishTypeFilteredItems.length === 0) {
      const dishTypeDisplay = dishType.charAt(0).toUpperCase() + dishType.slice(1);
      const message = `No ${dishTypeDisplay} match your request yet.`;
      
      return {
        meals: [],
        hasMore: false,
        nextOffset: 0,
        searchKey: currentSearchKey,
        message
      };
    }
  }

  // 6. NORMALIZE ALL ITEMS (from dish-type filtered items)
  // This converts raw items to canonical meal objects and discards items with missing/invalid macros
  // STRICT: Discards items if macros missing or calories/protein/carbs/fat missing or not numeric
  const normalizedItems = dishTypeFilteredItems
    .map((item: any) => normalizeMeal(item))
    .filter((item): item is any => item !== null); // Remove null items (discarded due to missing/invalid macros)

  const candidatesAfterNormalization = normalizedItems.length;
  console.log(`[searchHandler] Normalized ${normalizedItems.length} items (discarded ${dishTypeFilteredItems.length - normalizedItems.length} items with missing/invalid macros)`);

  // 7. APPLY STRICT MACRO FILTERS (from JSONB)
  // All macro filtering uses JSON macros (from normalized object)
  // Macros are in menu_items.macros jsonb: calories, protein, carbs, fat
  // Use effective parameters (reconstructed from searchKey if available)
  const macroFilteredItems = normalizedItems.filter((item: any) => {
    // Calorie cap filter (from macros jsonb)
    if (effectiveCalorieCap && item.calories > effectiveCalorieCap) return false;
    
    // Protein minimum filter (from macros jsonb)
    if (effectiveMinProtein && item.protein < effectiveMinProtein) return false;
    
    // Carbs maximum filter (from macros jsonb)
    if (effectiveMaxCarbs && item.carbs > effectiveMaxCarbs) return false;
    
    // Fat maximum filter (from macros jsonb)
    if (effectiveMaxFat && item.fat > effectiveMaxFat) return false;
    
    return true;
  });
  
  const candidatesAfterMacroFilter = macroFilteredItems.length;
  console.log(`[searchHandler] Macro filters: ${normalizedItems.length} → ${macroFilteredItems.length} items`);
  
  // Log filtering summary with candidate counts before/after filtering
  console.log('[searchHandler] Filtering summary:', {
    retrievalStrategy,
    candidatesAfterRetrieval,
    candidatesAfterDishFilter,
    candidatesAfterNormalization,
    candidatesAfterMacroFilter
  });
  
  // Diet filtering removed - use macroFilteredItems directly
  const itemsForRemainingFilters = macroFilteredItems;

  // 8. APPLY RESTAURANT FILTER (if restaurant filter exists)
  const filteredItems = restaurantFilter 
    ? applyRestaurantFilter(itemsForRemainingFilters, restaurantFilter)
    : itemsForRemainingFilters;

  // 9. RESTAURANT DIVERSITY SELECTOR (only when restaurant is NOT specified)
  // Reorders items to maximize restaurant diversity across the entire list
  // Creates a diverse ordering that pagination can slice from
  // Uses deterministic shuffling to prevent repeated results while maintaining stability
  let diverseItems = filteredItems;
  if (!restaurantFilter) {
    const userId = params.userContext?.userId || undefined;
    diverseItems = applyRestaurantDiversity(filteredItems, currentSearchKey, userId);
  }

  // 15. CONVERT TO FINAL MEAL FORMAT (for UI compatibility)
  // Use normalized canonical object directly - it already has all fields from schema
  const finalMeals = diverseItems.map((item: any) => ({
    id: item.id,
    name: item.name,
    restaurant: item.restaurant_name,
    restaurant_name: item.restaurant_name, // Keep for logo logic
    calories: item.calories,
    protein: item.protein,
    carbs: item.carbs,
    fats: item.fat, // Use fat from macros jsonb
    image: item.image_url || '/placeholder-food.jpg',
    description: '', // Not in schema, leave empty
    category: item.category || '',
    dietary_tags: item.normalized_tags || [], // Use normalized dietary tags
    price: item.price_estimate || null,
  }));

  // 11. DEDUPLICATE RESULTS (before pagination)
  // Use stable dedupe key: restaurant_name + name (case-insensitive)
  const dedupeMap = new Map<string, any>();
  const itemsBeforeDedupe = finalMeals.length;

  for (const item of finalMeals) {
    // Create dedupe key: restaurant_name + name (case-insensitive)
    const restaurant = (item.restaurant_name || '').toLowerCase().trim();
    const name = (item.name || '').toLowerCase().trim();
    const dedupeKey = `${restaurant}|${name}`;
    
    // If we haven't seen this key, add it
    if (!dedupeMap.has(dedupeKey)) {
      dedupeMap.set(dedupeKey, item);
    }
  }

  const deduplicatedMeals = Array.from(dedupeMap.values());
  const itemsRemovedByDedupe = itemsBeforeDedupe - deduplicatedMeals.length;
  
  if (itemsRemovedByDedupe > 0) {
    console.log(`[searchHandler] Deduplication: removed ${itemsRemovedByDedupe} duplicate items (${itemsBeforeDedupe} -> ${deduplicatedMeals.length})`);
  }

  // 12. PAGINATION SLICING (diversity already applied above)
  // Always return exactly 5 unique options if possible
  // Diversity rule: prefer max 1 per restaurant until you can't fill 5
  // If fewer than 5 exist after strict constraints, return fewer (don't pad)
  const targetLimit = limit || 5;
  const slicedItems = deduplicatedMeals.slice(offset, offset + targetLimit);
  const hasMore = deduplicatedMeals.length > (offset + targetLimit);
  const mealsReturned = slicedItems.length;
  const nextOffset = hasMore ? offset + mealsReturned : 0;

  // PART 5: Generate truthful summary - must match meals.length exactly
  // Server always returns truthful summary, client never invents its own
  // Summary must match slicedItems.length (actual meals returned)
  let summary: string | undefined = undefined;
  const mealCount = slicedItems.length; // Always use actual count
  
  if (dishType) {
    // Summary with dish type: "Found 5 burgers under 700 calories."
    const dishTypeDisplay = dishType.charAt(0).toUpperCase() + dishType.slice(1) + (mealCount !== 1 ? 's' : '');
    const constraints: string[] = [];
    if (effectiveCalorieCap) constraints.push(`under ${effectiveCalorieCap} calories`);
    if (effectiveMinProtein) constraints.push(`with at least ${effectiveMinProtein}g protein`);
    if (effectiveMaxCarbs) constraints.push(`under ${effectiveMaxCarbs}g carbs`);
    if (effectiveMaxFat) constraints.push(`under ${effectiveMaxFat}g fat`);
    
    if (mealCount === 0) {
      summary = `Found 0 ${dishTypeDisplay.toLowerCase()}`;
    } else {
      summary = `Found ${mealCount} ${dishTypeDisplay.toLowerCase()}`;
      if (constraints.length > 0) {
        summary += ` ${constraints.join(', ')}`;
      }
    }
    summary += '.';
  } else if (mealCount > 0) {
    // Generic summary when no dish type
    const constraints: string[] = [];
    if (effectiveCalorieCap) constraints.push(`under ${effectiveCalorieCap} calories`);
    if (effectiveMinProtein) constraints.push(`with at least ${effectiveMinProtein}g protein`);
    if (effectiveMaxCarbs) constraints.push(`under ${effectiveMaxCarbs}g carbs`);
    if (effectiveMaxFat) constraints.push(`under ${effectiveMaxFat}g fat`);
    
    if (constraints.length > 0) {
      summary = `Found ${mealCount} meal${mealCount !== 1 ? 's' : ''} ${constraints.join(', ')}.`;
    } else {
      summary = `Found ${mealCount} meal${mealCount !== 1 ? 's' : ''}.`;
    }
  } else {
    // Zero results
    summary = 'No meals match your request yet.';
  }
  
  // Response shape: { meals, hasMore, nextOffset, searchKey, message?, summary? }
  // UI derives count from meals.length - no server-side count text
  // meals.length may be less than 5 if fewer dishes match (this is correct behavior)
  
  // Log pagination details as requested
  console.log('[searchHandler] Pagination summary:', {
    searchKey: currentSearchKey,
    reconstructedQuery: reconstructedQuery || effectiveQuery || '(none)',
    dishType: dishType || '(none)',
    offset,
    returnedCount: slicedItems.length,
    hasMore,
    totalAvailable: deduplicatedMeals.length,
    effectiveConstraints: {
      calorieCap: effectiveCalorieCap,
      minProtein: effectiveMinProtein,
      maxCarbs: effectiveMaxCarbs,
      maxFat: effectiveMaxFat,
      restaurant: effectiveRestaurant || '(none)'
    }
  });
  
  return {
    meals: slicedItems,
    hasMore,
    nextOffset,
    searchKey: currentSearchKey,
    ...(summary && { summary })
  };
}
