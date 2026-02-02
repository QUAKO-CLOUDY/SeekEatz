import { createClient } from '@/utils/supabase/server';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';
import { classifyMenuItem } from '@/lib/menu-item-classifier';

// Dev-only counter for hard guard exclusions (tracks first 10)
let hardGuardExclusionCount = 0;

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
    keywords: ['sandwich', 'sandwiches', 'sandwhich', 'sandwiche', 'sandwhiches', 'sub', 'subs', 'hoagie', 'hoagies', 'hero', 'heroes']
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
 * Protein keywords mapping: protein → { keywords[] }
 * Maps protein types to name keywords for filtering menu items
 */
const PROTEIN_KEYWORDS: Record<string, string[]> = {
  fish: ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'mahi', 'halibut', 'trout', 'bass', 'seabass', 'sea bass'],
  steak: ['steak', 'beef', 'ribeye', 'sirloin', 'filet', 'filet mignon', 'porterhouse', 't-bone', 'new york strip'],
  chicken: ['chicken', 'poultry', 'breast', 'thigh', 'wing', 'drumstick'],
  pork: ['pork', 'bacon', 'ham', 'sausage', 'chorizo', 'pancetta', 'prosciutto'],
  turkey: ['turkey'],
  shrimp: ['shrimp', 'prawn', 'prawns'],
  tofu: ['tofu'],
  vegetarian: ['vegetarian', 'veggie', 'vegan', 'plant-based']
};

/**
 * Extracts protein keyword from query if present
 * Returns protein keyword string or null
 * Only matches if protein keyword appears as a whole word in the query
 */
function extractProteinKeyword(query: string): string | null {
  if (!query || typeof query !== 'string') return null;
  
  const lowerQuery = query.toLowerCase().trim();
  
  // Check each protein type
  for (const [protein, keywords] of Object.entries(PROTEIN_KEYWORDS)) {
    // Check if any keyword matches (word boundary to avoid partial matches)
    for (const keyword of keywords) {
      // Escape special regex characters in keyword
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
      if (pattern.test(lowerQuery)) {
        return protein;
      }
    }
  }
  
  return null;
}

/**
 * Applies protein filtering
 * Keeps only items where menu name contains the protein keyword
 * Applied after normalization to filter on meal names
 */
function applyProteinFilter(items: any[], proteinKeyword: string): any[] {
  if (!proteinKeyword || !PROTEIN_KEYWORDS[proteinKeyword]) {
    return items; // No protein constraint
  }
  
  const keywords = PROTEIN_KEYWORDS[proteinKeyword];
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  
  return items.filter((item: any) => {
    const itemName = (item.name || item.item_name || '').toLowerCase();
    
    // Check if name contains any protein keyword (word boundary to avoid partial matches)
    const nameMatches = lowerKeywords.some(keyword => {
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
      return pattern.test(itemName);
    });
    
    return nameMatches;
  });
}

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

  // COMPONENT BLACKLIST: Check name for component tokens/phrases BEFORE all other checks
  // This runs first to catch components even if category says "Entrees"
  // Blacklist tokens: tortilla, shell, bun, bread, pita, wrap (plain only), rice, beans, protein, 
  // steak only, chicken only, guacamole, salsa, sauce, dressing, cheese, packet, add-on, topping, 
  // side of, side, fries, chips, cup of, serving of, scoop, mix-in, condiment, beverage, drink, utensil
  const componentBlacklistTokens = [
    'tortilla', 'tortillas',
    'shell', 'shells',
    'bun', 'buns',
    'bread',
    'pita',
    'rice',
    'beans',
    'protein',
    'guacamole',
    'salsa',
    'sauce',
    'dressing',
    'cheese',
    'packet',
    'add-on', 'addon', 'add on',
    'topping',
    'side',
    'fries',
    'chips',
    'scoop',
    'mix-in', 'mix in', 'mixin',
    'condiment',
    'beverage',
    'drink',
    'utensil', 'utensils'
  ];
  
  // Normalize name for matching: remove punctuation, handle hyphens, collapse spaces
  const normalizedName = name
    .replace(/[^\w\s-]/g, ' ')  // Replace punctuation with spaces
    .replace(/-/g, ' ')          // Replace hyphens with spaces
    .replace(/\s+/g, ' ')         // Collapse multiple spaces
    .trim();
  
  // Check for word-boundary matches of blacklist tokens
  let matchedToken: string | null = null;
  for (const token of componentBlacklistTokens) {
    // Create pattern with word boundaries, case-insensitive
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escapedToken}\\b`, 'i');
    
    if (pattern.test(normalizedName)) {
      matchedToken = token;
      break;
    }
  }
  
  // Special handling for "wrap" - only blacklist if it's a plain wrap, not a wrap meal
  // A wrap meal typically has additional descriptors (e.g., "Chicken Wrap", "Turkey Wrap")
  if (!matchedToken) {
    const wrapPattern = /\bwrap\b/i;
    if (wrapPattern.test(normalizedName)) {
      // Check if it's a plain wrap (just "wrap" or "tortilla wrap" or similar)
      // If it has meal descriptors (chicken, turkey, veggie, etc.), it's a wrap meal
      const hasMealDescriptor = /\b(chicken|turkey|beef|steak|pork|veggie|vegetarian|grilled|roasted|spicy|buffalo|caesar|club|blt|bbq|ranch|italian|greek|mediterranean|asian|mexican|southwest)\b/i.test(normalizedName);
      if (!hasMealDescriptor) {
        matchedToken = 'wrap';
      }
    }
  }
  
  // Special handling for "steak only" and "chicken only"
  if (!matchedToken) {
    if (/\bsteak\s+only\b/i.test(normalizedName)) {
      matchedToken = 'steak only';
    } else if (/\bchicken\s+only\b/i.test(normalizedName)) {
      matchedToken = 'chicken only';
    }
  }
  
  // STRENGTHENED: Single ingredient patterns - exclude if name is extremely short AND category indicates modifier
  // Examples: "Chicken" (alone), "Steak" (alone), "Shrimp" (alone) - only if category suggests modifier
  if (!matchedToken && words.length <= 2) {
    const singleIngredientPatterns = [
      /^(chicken|steak|beef|pork|turkey|shrimp|fish|salmon|tuna|tofu|tempeh|seitan)$/i,
      /^(chicken|steak|beef|pork|turkey|shrimp|fish|salmon|tuna|tofu|tempeh|seitan)\s+(only|plain|alone)$/i
    ];
    
    const isSingleIngredient = singleIngredientPatterns.some(pattern => pattern.test(normalizedName));
    if (isSingleIngredient) {
      // Only exclude if category indicates modifier/add-on
      const modifierCategories = ['add-on', 'addon', 'add on', 'modifier', 'extra', 'topping', 'protein-only', 'ingredient'];
      if (modifierCategories.some(modCat => category.includes(modCat))) {
        matchedToken = 'single ingredient';
      }
    }
  }
  
  // Special handling for "side of" and "cup of" and "serving of"
  if (!matchedToken) {
    if (/\bside\s+of\b/i.test(normalizedName)) {
      matchedToken = 'side of';
    } else if (/\bcup\s+of\b/i.test(normalizedName)) {
      matchedToken = 'cup of';
    } else if (/\bserving\s+of\b/i.test(normalizedName)) {
      matchedToken = 'serving of';
    }
  }
  
  // If component blacklist matched, check if dishType can override it
  if (matchedToken) {
    // If dishType is provided and name matches dishType keywords, allow it to pass
    // BUT only if the matched token is not a strict component (e.g., allow "Chicken Burrito" even if it contains "chicken")
    // However, if the name is clearly just a component (e.g., "Flour Tortilla"), exclude it even with dishType
    if (dishType && DISH_TAXONOMY[dishType]) {
      const { keywords } = DISH_TAXONOMY[dishType];
      const lowerKeywords = keywords.map(k => k.toLowerCase());
      const nameMatchesDishType = lowerKeywords.some(keyword => {
        const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
        return pattern.test(name);
      });
      
      // If name matches dishType AND has meal structure, allow it
      // But if name is clearly just a component (e.g., "Tortilla", "Shell", "Rice"), exclude it
      const strictComponentTokens = ['tortilla', 'tortillas', 'shell', 'shells', 'bun', 'buns', 'bread', 'pita', 'rice', 'beans', 'packet', 'add-on', 'addon', 'add on', 'topping', 'scoop', 'utensil', 'utensils'];
      const isStrictComponent = strictComponentTokens.includes(matchedToken.toLowerCase());
      
      if (nameMatchesDishType && !isStrictComponent) {
        // Name matches dishType and is not a strict component, allow it
        // Example: "Chicken Burrito" contains "chicken" (blacklist token) but also "burrito" (dishType keyword)
        return true;
      }
    }
    
    // Component blacklist matched and dishType doesn't override - exclude it
    const originalName = menuItem.name || menuItem.item_name || 'unknown';
    // Log removed to reduce terminal output clutter
    return false;
  }

  // PRIORITY: If dishType is provided, check if name matches dishType keywords
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
  // Must exclude: tortilla, shell, bun, rice, beans, salsa, sauce, dressing, topping, add-on, packet, guacamole, cheese, sour cream, protein scoop, "side of …", "extra …"
  // Must NOT block real meals like "Chicken Burrito", "Steak Bowl", "Breakfast Burrito", "Smashburger", "Chicken Sandwich"
  const componentBlacklistPatterns = [
    // Tortillas and shells
    /^(flour|corn|wheat|whole\s+wheat)\s+tortilla(s)?$/i,
    /^tortilla(s)?\s*\(/i,
    /^(hard|soft)\s+shell(s)?$/i,
    /^shell(s)?\s*\(/i,
    
    // Buns
    /^(burger|hamburger|brioche|sesame|whole\s+wheat)\s+bun(s)?$/i,
    /^bun(s)?\s+only$/i,
    
    // Rice (standalone, not in meal names)
    /^side\s+of\s+rice$/i,
    /^(white|brown|wild|jasmine|basmati)\s+rice$/i,
    /^rice\s+only$/i,
    /^rice$/i,  // Just "rice" by itself
    
    // Beans (standalone, not in meal names)
    /^side\s+of\s+beans$/i,
    /^(black|pinto|refried|kidney)\s+beans$/i,
    /^beans\s+only$/i,
    /^beans$/i,  // Just "beans" by itself
    
    // Salsa (standalone or as component)
    /^salsa$/i,  // Just "salsa" by itself
    /^side\s+of\s+salsa$/i,
    /^(add-on|addon|add\s+on)\s+salsa$/i,
    /^extra\s+salsa$/i,
    /^salsa\s+(topping|add-on|addon)$/i,
    
    // Sauce (standalone or as component)
    /^sauce$/i,  // Just "sauce" by itself (but not "BBQ Sauce" which is caught by pattern below)
    /^(sauce|dressing)\s+packet(s)?$/i,
    /^packet(s)?\s+of\s+(sauce|dressing|ketchup|mustard|mayo|mayonnaise)$/i,
    /^(bbq|hot|chipotle|ranch|caesar|italian|balsamic|honey\s+mustard)\s+(sauce|dressing)$/i,
    /^side\s+of\s+sauce$/i,
    /^(add-on|addon|add\s+on)\s+sauce$/i,
    /^extra\s+sauce$/i,
    /^sauce\s+(topping|add-on|addon)$/i,
    
    // Dressing (standalone or as component)
    /^dressing$/i,  // Just "dressing" by itself
    /^side\s+of\s+dressing$/i,
    /^(add-on|addon|add\s+on)\s+dressing$/i,
    /^extra\s+dressing$/i,
    /^dressing\s+(topping|add-on|addon)$/i,
    
    // Topping
    /^topping$/i,  // Just "topping" by itself
    /^(add-on|addon|add\s+on)\s+topping$/i,
    /^extra\s+topping$/i,
    
    // Add-on
    /^add-on$/i,
    /^addon$/i,
    /^add\s+on$/i,
    
    // Packet
    /^packet$/i,  // Just "packet" by itself
    
    // Guacamole (standalone or as component)
    /^guacamole$/i,  // Just "guacamole" by itself
    /^side\s+of\s+guacamole$/i,
    /^(add-on|addon|add\s+on)\s+guacamole$/i,
    /^extra\s+guacamole$/i,
    /^guacamole\s+(topping|add-on|addon)$/i,
    
    // Cheese (standalone or as component, but not "Cheese Pizza")
    /^cheese$/i,  // Just "cheese" by itself
    /^side\s+of\s+cheese$/i,
    /^(add-on|addon|add\s+on)\s+cheese$/i,
    /^extra\s+cheese$/i,
    /^cheese\s+(topping|add-on|addon)$/i,
    
    // Sour cream (standalone or as component)
    /^sour\s+cream$/i,
    /^side\s+of\s+sour\s+cream$/i,
    /^(add-on|addon|add\s+on)\s+sour\s+cream$/i,
    /^extra\s+sour\s+cream$/i,
    /^sour\s+cream\s+(topping|add-on|addon)$/i,
    
    // Protein scoop
    /^protein\s+scoop$/i,
    /^protein\s+(scoop|only|add-on|addon)$/i,
    
    // "Side of ..." patterns
    /^side\s+of\s+(rice|beans|guacamole|salsa|cheese|sour\s+cream|protein|sauce|dressing)$/i,
    
    // "Extra ..." patterns
    /^extra\s+(cheese|guacamole|salsa|sour\s+cream|protein|rice|beans|sauce|dressing|topping)$/i,
    
    // Additional component patterns
    /^(beef|chicken|turkey|veggie|vegetarian)\s+(patty|patties)$/i,
    /^(patty|patties)$/i,
    /^(steak|chicken|beef|pork|turkey|tofu|tempeh)\s+only$/i,
  ];
  
  // Check if name matches component blacklist patterns
  // But be conservative: if name contains meal keywords (burrito, taco, bowl, burger, sandwich, etc.), allow it
  // This ensures "Chicken Burrito", "Steak Bowl", "Breakfast Burrito", "Smashburger", "Chicken Sandwich" pass through
  // NOTE: "steak" and "chicken" removed from hasMealKeyword to prevent component blacklist bypass
  const hasMealKeyword = /(burrito|taco|bowl|burger|sandwich|wrap|salad|pizza|pasta|quesadilla|sub|hoagie|panini|calzone|pita|combo|meal|platter|entree|entrée|main|plate|smashburger|breakfast)/i.test(name);
  
  if (!hasMealKeyword && componentBlacklistPatterns.some(pattern => pattern.test(name))) {
    return false; // Component blacklist match (and not a meal)
  }

  // HARD GUARD: Prevent ingredient-like items from passing via category allow-list
  // Check if name is ingredient-like (single word ingredient, common 2-word ingredient, or modifier patterns)
  // Return false UNLESS the name also contains a real meal term
  const realMealTerms = /(burrito|taco|bowl|burger|sandwich|wrap|salad|pizza|pasta|quesadilla|sub|hoagie|panini|calzone|pita|combo|meal|platter|entree|entrée|main|plate|smashburger|breakfast)/i;
  const hasRealMealTerm = realMealTerms.test(normalizedName);
  
  // Single-word ingredient check
  const singleWordIngredientList = [
    'chicken', 'steak', 'beef', 'pork', 'turkey', 'tofu', 'tempeh', 
    'rice', 'beans', 'cheese', 'salsa', 'guacamole', 'bacon', 'eggs', 
    'egg', 'avocado', 'lettuce', 'spinach', 'kale', 'arugula', 'sauce', 
    'dressing', 'fries', 'bread', 'tortilla', 'tomato', 'tomatoes', 
    'onion', 'onions', 'pepper', 'peppers', 'mayo', 'mayonnaise',
    'ketchup', 'mustard', 'ranch', 'protein', 'quinoa', 'couscous'
  ];
  
  // Two-word ingredient combinations
  const twoWordIngredientList = [
    'sour cream', 'bbq sauce', 'hot sauce', 'chipotle sauce', 'ranch dressing',
    'black beans', 'pinto beans', 'white rice', 'brown rice', 'wild rice',
    'grilled chicken', 'chicken breast', 'ground beef', 'extra protein',
    'romaine lettuce', 'iceberg lettuce', 'red onion', 'green pepper',
    'bell pepper', 'jalapeño', 'jalapeno', 'cheddar cheese', 'swiss cheese'
  ];
  
  // Modifier patterns
  const modifierPatterns = [
    /^side\s+of\s+/i,
    /^extra\s+/i,
    /^add\s+/i,
    /^cup\s+of\s+/i,
    /^serving\s+of\s+/i
  ];
  
  const isSingleWordIngredient = words.length === 1 && singleWordIngredientList.includes(normalizedName.trim());
  const isTwoWordIngredient = words.length === 2 && twoWordIngredientList.includes(normalizedName.trim());
  const hasModifierPattern = modifierPatterns.some(pattern => pattern.test(normalizedName));
  
  if ((isSingleWordIngredient || isTwoWordIngredient || hasModifierPattern) && !hasRealMealTerm) {
    // Dev-only logging: track first 10 items excluded by hard guard
    if (process.env.NODE_ENV === 'development' && hardGuardExclusionCount < 10) {
      const originalName = menuItem.name || menuItem.item_name || 'unknown';
      const reason = isSingleWordIngredient ? 'single-word ingredient' :
                     isTwoWordIngredient ? 'two-word ingredient' :
                     'modifier pattern';
      console.log(`[isDishItem] Hard guard excluded: "${originalName}" (category: ${category}) — reason: ${reason}`);
      hardGuardExclusionCount++;
    }
    return false;
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
  
  const filtered = items.filter((item: any): boolean => {
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
    // Filter component blacklist exclusions for separate logging
    const componentBlacklistExclusions = excluded.filter(e => e.reason === 'component blacklist: name contains component/ingredient term');
    
    if (componentBlacklistExclusions.length > 0) {
      console.log(`[searchHandler] Component blacklist exclusions (first ${Math.min(10, componentBlacklistExclusions.length)}):`, 
        componentBlacklistExclusions.slice(0, 10).map(e => ({ name: e.name, category: e.category, reason: 'component blacklist' }))
      );
    }
    
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
  calorieCap?: number; // Legacy: max calories (use maxCalories instead)
  minCalories?: number;
  maxCalories?: number;
  minProtein?: number;
  maxProtein?: number;
  minCarbs?: number;
  maxCarbs?: number;
  minFat?: number; // Legacy: use minFats
  maxFat?: number; // Legacy: use maxFats
  minFats?: number;
  maxFats?: number;
  diet?: string;
  restaurant?: string; // Canonical restaurant name (for backward compatibility)
  restaurantId?: string; // UUID of restaurant (preferred when available)
  restaurantVariants?: string[]; // All restaurant_name variants for filtering (e.g., ["CAVA", "Cava"]) - from universal resolver
  explicitRestaurantQuery?: string; // Raw restaurant query from user (e.g., "cava" from "meals from cava")
  macroFilters?: {
    proteinMin?: number;
    caloriesMax?: number;
    carbsMax?: number;
    fatsMax?: number;
    proteinMax?: number;
    caloriesMin?: number;
    carbsMin?: number;
    fatsMin?: number;
  } | null;
  location?: string;
  userContext?: any;
  offset?: number;
  limit?: number;
  searchKey?: string;
  isPagination?: boolean;
  isHomepage?: boolean;
  calorieMode?: "UNDER" | "OVER";
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
 * Detects meal time from query string (breakfast or dinner)
 * Returns "breakfast" if query contains "breakfast" (whole word)
 * Returns "dinner" if query contains "dinner" (whole word)
 * If both are present, prefers "breakfast" (more restrictive)
 * Returns null if neither is found
 */
function detectMealTime(query: string): "breakfast" | "dinner" | null {
  if (!query || typeof query !== 'string') return null;
  
  const hasBreakfast = /\bbreakfast\b/i.test(query);
  const hasDinner = /\bdinner\b/i.test(query);
  
  // If both are present, prefer breakfast (more restrictive)
  if (hasBreakfast) return "breakfast";
  if (hasDinner) return "dinner";
  
  return null;
}

/**
 * Checks if a name contains "breakfast" (case-insensitive)
 * Safe string coercion - handles undefined, null, and non-string values
 */
function nameHasBreakfast(name: unknown): boolean {
  if (name === undefined || name === null) return false;
  
  const nameStr = String(name).toLowerCase();
  return nameStr.includes("breakfast");
}

/**
 * Checks if an item should be included in breakfast results
 * Returns true if:
 * - Item name contains "breakfast", OR
 * - Item is from Starbucks (Starbucks items are considered breakfast items)
 */
function isBreakfastItem(item: any): boolean {
  // Check if name contains "breakfast"
  if (nameHasBreakfast(item.name)) {
    return true;
  }
  
  // Also include Starbucks items (case-insensitive comparison)
  const restaurantName = (item.restaurant_name || '').toLowerCase().trim();
  if (restaurantName === 'starbucks') {
    return true;
  }
  
  return false;
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
  // DB canonical: fat (singular), but support fallback from fats (plural)
  const calories = typeof macrosJson.calories === 'number' ? macrosJson.calories : null;
  const protein = typeof macrosJson.protein === 'number' ? macrosJson.protein : null;
  const carbs = typeof macrosJson.carbs === 'number' ? macrosJson.carbs : null;
  
  // Normalize fat: prefer fat (singular) from DB, fallback to fats (plural)
  // Meal object uses fats (plural) to match Meal type
  const fatValue = typeof macrosJson.fat === 'number' ? macrosJson.fat : 
                   (typeof macrosJson.fats === 'number' ? macrosJson.fats : null);
  
  // Defensive logging: detect rows with both fat and fats with different values
  if (typeof macrosJson.fat === 'number' && typeof macrosJson.fats === 'number' && 
      macrosJson.fat !== macrosJson.fats) {
    console.warn(`[normalizeMeal] Macro mismatch detected for item ${item.id || item.name}: fat=${macrosJson.fat}, fats=${macrosJson.fats}. Using fat (singular) value.`);
  }
  
  const fats = fatValue;

  // STRICT: Discard if calories missing or not numeric or 0
  if (calories === null || calories === 0 || isNaN(calories)) {
    return null; // Discard - invalid calories
  }

  // STRICT: Discard if other macros missing or not numeric (all must be present and valid)
  // Allow 0 values for protein/carbs/fats, but not null/NaN
  if (protein === null || isNaN(protein) || 
      carbs === null || isNaN(carbs) || 
      fats === null || isNaN(fats)) {
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
    fats: fats, // Use "fats" (plural) as primary field to match Meal type
    // Include aliases for UI compatibility (database may use different field names)
    protein_g: protein,
    carbs_g: carbs,
    fats_g: fats,
    fat: fats, // Legacy alias for database compatibility
    fat_g: fats, // Legacy alias for database compatibility
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
  calMin?: number;
  calMax?: number;
  proMin?: number;
  proMax?: number;
  carbMin?: number;
  carbMax?: number;
  fatMin?: number;
  fatMax?: number;
  rest?: string;
  dishType?: string | null;
  // Legacy support
  cal?: number;
  pro?: number;
  carb?: number;
  fat?: number;
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
    minCalories?: number;
    maxCalories?: number;
    minProtein?: number;
    maxProtein?: number;
    minCarbs?: number;
    maxCarbs?: number;
    minFats?: number;
    maxFats?: number;
    restaurant?: string;
    dishType?: string | null;
    // Legacy support
    calorieCap?: number;
    minFat?: number;
    maxFat?: number;
  } = {};
  
  let currentSearchKey: string;
  let reconstructedQuery: string | undefined;
  let reconstructedDishType: string | null | undefined;
  
  if (params.searchKey && params.isPagination) {
    // Only use searchKey for pagination requests (isPagination=true)
    // For new searches, params override searchKey to prevent stale constraints
    const decoded = decodeSearchKey(params.searchKey);
    if (decoded) {
      reconstructedParams = {
        query: decoded.q || '',
        // New format: min/max for each macro
        minCalories: decoded.calMin,
        maxCalories: decoded.calMax ?? decoded.cal, // Legacy support
        minProtein: decoded.proMin,
        maxProtein: decoded.proMax,
        minCarbs: decoded.carbMin,
        maxCarbs: decoded.carbMax ?? decoded.carb, // Legacy support
        minFats: decoded.fatMin,
        maxFats: decoded.fatMax ?? decoded.fat, // Legacy support
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
          minCalories: reconstructedParams.minCalories,
          maxCalories: reconstructedParams.maxCalories,
          minProtein: reconstructedParams.minProtein,
          maxProtein: reconstructedParams.maxProtein,
          minCarbs: reconstructedParams.minCarbs,
          maxCarbs: reconstructedParams.maxCarbs,
          minFats: reconstructedParams.minFats,
          maxFats: reconstructedParams.maxFats,
          restaurant: reconstructedParams.restaurant
        }
      });
    } else {
      // Decoding failed, fall back to generating new key
      console.warn('[searchHandler] Failed to decode searchKey, generating new key');
      currentSearchKey = '';
    }
  } else {
    // No searchKey provided OR isPagination=false (new search with changed filters)
    // Use params as-is, ignore any searchKey
    if (params.searchKey && !params.isPagination) {
      console.log('[searchHandler] New search detected (isPagination=false) - ignoring searchKey, using params');
    }
    reconstructedQuery = undefined;
    reconstructedDishType = undefined;
    currentSearchKey = '';
  }

  // Use reconstructed params if available, otherwise use provided params
  // Priority: reconstructed (from searchKey) > provided params
  const effectiveQuery = reconstructedParams.query !== undefined 
    ? reconstructedParams.query 
    : (params.query?.trim() || '');
  
  // Normalize constraints to numbers (handle string inputs)
  // For min constraints, allow 0; for max constraints, must be > 0
  const normalizeNumeric = (value: number | string | undefined | null, allowZero = false): number | undefined => {
    if (value === undefined || value === null) return undefined;
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return undefined;
    return (allowZero ? num >= 0 : num > 0) ? num : undefined;
  };
  
  // Calories: support both min and max (legacy calorieCap = maxCalories)
  const effectiveMinCalories = normalizeNumeric(
    reconstructedParams.minCalories !== undefined 
      ? reconstructedParams.minCalories 
      : params.minCalories,
    true // Allow 0 for min
  );
  const effectiveMaxCalories = normalizeNumeric(
    reconstructedParams.maxCalories !== undefined 
      ? reconstructedParams.maxCalories 
      : (reconstructedParams.calorieCap !== undefined 
          ? reconstructedParams.calorieCap 
          : (params.maxCalories ?? params.calorieCap))
  );
  
  // Protein: support both min and max
  const effectiveMinProtein = normalizeNumeric(
    reconstructedParams.minProtein !== undefined 
      ? reconstructedParams.minProtein 
      : params.minProtein,
    true // Allow 0 for min
  );
  const effectiveMaxProtein = normalizeNumeric(
    reconstructedParams.maxProtein !== undefined 
      ? reconstructedParams.maxProtein 
      : params.maxProtein,
    true // Allow 0 for max (though unusual)
  );
  
  // Carbs: support both min and max
  const effectiveMinCarbs = normalizeNumeric(
    reconstructedParams.minCarbs !== undefined 
      ? reconstructedParams.minCarbs 
      : params.minCarbs,
    true // Allow 0 for min
  );
  const effectiveMaxCarbs = normalizeNumeric(
    reconstructedParams.maxCarbs !== undefined 
      ? reconstructedParams.maxCarbs 
      : params.maxCarbs,
    true // Allow 0 for max (though unusual)
  );
  
  // Fats: support both min and max (prefer fats plural, fallback to fat singular)
  const effectiveMinFats = normalizeNumeric(
    reconstructedParams.minFats !== undefined 
      ? reconstructedParams.minFats 
      : (reconstructedParams.minFat !== undefined 
          ? reconstructedParams.minFat 
          : (params.minFats ?? params.minFat)),
    true // Allow 0 for min
  );
  const effectiveMaxFats = normalizeNumeric(
    reconstructedParams.maxFats !== undefined 
      ? reconstructedParams.maxFats 
      : (reconstructedParams.maxFat !== undefined 
          ? reconstructedParams.maxFat 
          : (params.maxFats ?? params.maxFat)),
    true // Allow 0 for max (though unusual)
  );
  
  // HARD GUARDRAIL: Check for explicit restaurant constraint
  // Get restaurant from searchKey (pagination) or from explicitRestaurantQuery (new search)
  const restaurantNameFromSearchKey = reconstructedParams.restaurant;
  const explicitRestaurantQuery = params.explicitRestaurantQuery;
  const macroFiltersDetected = params.macroFilters !== null && params.macroFilters !== undefined;
  
  // Log intent detection results
  console.log('[searchHandler] Intent detection:', {
    explicitRestaurantQuery: explicitRestaurantQuery || undefined,
    restaurantNameFromSearchKey: restaurantNameFromSearchKey || undefined,
    macroFiltersDetected,
    macroFilters: macroFiltersDetected ? params.macroFilters : undefined
  });
  
  // HARD GUARD: Only resolve restaurant if explicitRestaurantQuery exists OR restaurantNameFromSearchKey exists
  // DO NOT call restaurant trigram candidates/resolver otherwise
  if (!explicitRestaurantQuery && !restaurantNameFromSearchKey) {
    console.log('[searchHandler] SKIP restaurant resolver (no explicit restaurant constraint)');
  }
  
  const effectiveRestaurant = restaurantNameFromSearchKey !== undefined 
    ? restaurantNameFromSearchKey 
    : params.restaurant;
  
  // Get restaurant_id if available (preferred over restaurant name)
  const effectiveRestaurantId = params.restaurantId;
  
  // Get restaurant variants for filtering (from universal resolver)
  const restaurantVariants = params.restaurantVariants;
  
  // Log effective constraints (what will actually be used for filtering)
  const effectiveConstraintsForLog = {
    minCalories: effectiveMinCalories,
    maxCalories: effectiveMaxCalories,
    minProtein: effectiveMinProtein,
    maxProtein: effectiveMaxProtein,
    minCarbs: effectiveMinCarbs,
    maxCarbs: effectiveMaxCarbs,
    minFats: effectiveMinFats,
    maxFats: effectiveMaxFats,
    restaurant: effectiveRestaurant,
  };
  console.log('[searchHandler] Effective constraints (will be enforced):', {
    calories: effectiveMinCalories !== undefined || effectiveMaxCalories !== undefined 
      ? `${effectiveMinCalories ?? 'min'} - ${effectiveMaxCalories ?? 'max'}`
      : 'none',
    protein: effectiveMinProtein !== undefined || effectiveMaxProtein !== undefined
      ? `${effectiveMinProtein ?? 'min'} - ${effectiveMaxProtein ?? 'max'}`
      : 'none',
    carbs: effectiveMinCarbs !== undefined || effectiveMaxCarbs !== undefined
      ? `${effectiveMinCarbs ?? 'min'} - ${effectiveMaxCarbs ?? 'max'}`
      : 'none',
    fats: effectiveMinFats !== undefined || effectiveMaxFats !== undefined
      ? `${effectiveMinFats ?? 'min'} - ${effectiveMaxFats ?? 'max'}`
      : 'none',
    restaurant: effectiveRestaurant || 'none',
    fullConstraints: effectiveConstraintsForLog
  });

  // Extract dish type: use reconstructed if available, otherwise extract from query
  const dishType = reconstructedDishType !== undefined
    ? reconstructedDishType
    : (effectiveQuery ? extractDishType(effectiveQuery) : null);

  // Extract restaurant name/ID - ONLY resolve if explicitRestaurantQuery exists
  let restaurantName: string | undefined = undefined;
  let restaurantId: string | undefined = undefined;
  
  // If we have explicitRestaurantQuery, resolve it against database
  if (explicitRestaurantQuery && !restaurantNameFromSearchKey) {
    // Resolve explicit restaurant query against menu_items distinct restaurant_name FIRST
    const queryLength = explicitRestaurantQuery.trim().length;
    
    if (queryLength <= 4) {
      // For short queries (<=4 chars), use exact/prefix/contains match on menu_items
      console.log('[searchHandler] Resolving short restaurant query:', explicitRestaurantQuery);
      
      const { data: restaurantMatches, error: restaurantError } = await supabase
        .from('menu_items')
        .select('restaurant_name')
        .ilike('restaurant_name', `%${explicitRestaurantQuery}%`)
        .limit(10);
      
      if (!restaurantError && restaurantMatches && restaurantMatches.length > 0) {
        // Check for exact match first
        const exactMatch = restaurantMatches.find((r: any) => 
          r.restaurant_name.toLowerCase().trim() === explicitRestaurantQuery.toLowerCase().trim()
        );
        
        if (exactMatch) {
          restaurantName = exactMatch.restaurant_name;
          console.log('[searchHandler] Restaurant resolved (exact match):', restaurantName);
        } else if (restaurantMatches.length === 1) {
          // Single match - use it
          restaurantName = restaurantMatches[0].restaurant_name;
          console.log('[searchHandler] Restaurant resolved (single match):', restaurantName);
        } else {
          // Multiple matches - return NOT_FOUND (don't show ambiguous options for short queries)
          console.log('[searchHandler] Restaurant NOT_FOUND: multiple matches for short query');
          return {
            meals: [],
            hasMore: false,
            nextOffset: 0,
            searchKey: currentSearchKey || '',
            message: `We don't have ${explicitRestaurantQuery} in our database yet.`
          };
        }
      } else {
        // No matches found
        console.log('[searchHandler] Restaurant NOT_FOUND: no matches');
        return {
          meals: [],
          hasMore: false,
          nextOffset: 0,
          searchKey: currentSearchKey || '',
          message: `We don't have ${explicitRestaurantQuery} in our database yet.`
        };
      }
    } else {
      // For longer queries (>=5 chars), use trigram with strict threshold
      console.log('[searchHandler] Resolving longer restaurant query with trigram:', explicitRestaurantQuery);
      
      try {
        const { data: candidates } = await supabase.rpc('search_restaurants_trgm', {
          query_text: explicitRestaurantQuery
        });
        
        if (candidates && candidates.length > 0) {
          const topCandidate = candidates[0];
          const topScore = topCandidate.similarity ?? 0;
          const topMatchType = topCandidate.match_type || 'fuzzy';
          
          // Only accept if exact/contains match OR fuzzy with high similarity (>= 0.6)
          if (topMatchType === 'exact' || topMatchType === 'contains' || topScore >= 0.6) {
            restaurantName = topCandidate.name;
            restaurantId = topCandidate.id;
            console.log('[searchHandler] Restaurant resolved (trigram):', restaurantName, {
              match_type: topMatchType,
              similarity: topScore
            });
          } else {
            // Low similarity - treat as NOT_FOUND
            console.log('[searchHandler] Restaurant NOT_FOUND: low similarity', {
              top_score: topScore,
              threshold: 0.6
            });
            return {
              meals: [],
              hasMore: false,
              nextOffset: 0,
              searchKey: currentSearchKey || '',
              message: `We don't have ${explicitRestaurantQuery} in our database yet.`
            };
          }
        } else {
          // No candidates
          console.log('[searchHandler] Restaurant NOT_FOUND: no trigram candidates');
          return {
            meals: [],
            hasMore: false,
            nextOffset: 0,
            searchKey: currentSearchKey || '',
            message: `We don't have ${explicitRestaurantQuery} in our database yet.`
          };
        }
      } catch (rpcError) {
        console.warn('[searchHandler] Restaurant RPC failed:', rpcError);
        return {
          meals: [],
          hasMore: false,
          nextOffset: 0,
          searchKey: currentSearchKey || '',
          message: `We don't have ${explicitRestaurantQuery} in our database yet.`
        };
      }
    }
  } else if (effectiveRestaurantId) {
    // Use restaurant_id when available (preferred)
    restaurantId = effectiveRestaurantId;
    // Also get canonical name for logging/searchKey
    try {
      const { data: restaurant, error: restaurantError } = await supabase
        .from('restaurants')
        .select('name')
        .eq('id', restaurantId)
        .single();
      
      if (restaurantError) {
        // If restaurants table doesn't exist or restaurant not found, fallback to restaurant_name
        console.warn('[searchHandler] Failed to fetch restaurant name for restaurant_id, falling back to restaurant_name:', restaurantId);
        restaurantId = undefined; // Clear restaurantId, will use restaurant_name instead
      } else if (restaurant) {
        restaurantName = restaurant.name;
        console.log(`[searchHandler] Using restaurant_id: ${restaurantId} (${restaurantName})`);
      }
    } catch (err) {
      console.warn('[searchHandler] Error fetching restaurant name for restaurant_id, falling back to restaurant_name:', restaurantId, err);
      restaurantId = undefined; // Clear restaurantId, will use restaurant_name instead
    }
  }
  
  // If restaurantId is still undefined, use restaurant name (for backward compatibility)
  if (!restaurantId && (effectiveRestaurant || restaurantNameFromSearchKey)) {
    restaurantName = (effectiveRestaurant || restaurantNameFromSearchKey)?.trim();
    console.log(`[searchHandler] Using restaurant name: ${restaurantName} (from searchKey or params, no restaurant_id)`);
  }
  
  // STRICT: Do NOT infer restaurant from query - only use explicit constraints
  // This prevents "find me" from mapping to random restaurants
  if (!restaurantId && !restaurantName) {
    console.log('[searchHandler] No restaurant constraint - searching across all restaurants');
  }

  // 1. GENERATE SEARCH KEY (Deterministic from normalized query + constraints + dish type + restaurant)
  // Must be deterministic so pagination uses same result set
  // Diet logic removed - no dietary tags in cache key
  // If searchKey was provided, use it; otherwise generate new one
  // STRICT: Only include rest in searchKey if restaurantName exists (canonical restaurant)
  if (!currentSearchKey) {
    const searchKeyData: any = {
      q: effectiveQuery.toLowerCase() || '',
      calMin: effectiveMinCalories,
      calMax: effectiveMaxCalories,
      proMin: effectiveMinProtein,
      proMax: effectiveMaxProtein,
      carbMin: effectiveMinCarbs,
      carbMax: effectiveMaxCarbs,
      fatMin: effectiveMinFats,
      fatMax: effectiveMaxFats,
      dishType: dishType || null
    };
    // Only include rest if restaurantName exists (canonical restaurant)
    if (restaurantName) {
      searchKeyData.rest = restaurantName;
    }
    currentSearchKey = Buffer.from(JSON.stringify(searchKeyData)).toString('base64');
  }

  // 2. PREPARE RESTAURANT FILTER
  // Use restaurant_id when available, fallback to restaurant name
  // Only set filter if explicit constraint exists (no inference)
  let restaurantFilter: string | undefined = undefined;
  if (restaurantId) {
    // Prefer restaurant_id - filter will use restaurant_id in queries
    restaurantFilter = restaurantName || restaurantId; // Use name for logging, ID for filtering
    console.log(`[searchHandler] Restaurant filter: ${restaurantName} (restaurant_id: ${restaurantId})`);
  } else if (restaurantName) {
    // Use variants if available, otherwise fallback to single name
    if (restaurantVariants && restaurantVariants.length > 0) {
      restaurantFilter = restaurantName; // Keep for logging
      console.log(`[searchHandler] Restaurant filter: ${restaurantName} with ${restaurantVariants.length} variants`);
    } else {
      // Fallback to restaurant name (for backward compatibility)
      restaurantFilter = restaurantName;
      console.log(`[searchHandler] Restaurant filter: ${restaurantFilter} (using name, no restaurant_id, no variants)`);
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

  /**
   * Normalizes restaurant name for comparison (same as restaurant-resolver)
   */
  function normalizeRestaurantNameForComparison(name: string): string {
    if (!name || typeof name !== 'string') return '';
    return name
      .toLowerCase()
      .trim()
      .replace(/&/g, 'and')
      .replace(/['.,\-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Determines if query is restaurant-only browse query (should bypass vector search)
   * Returns true if:
   * - Must have restaurant set
   * - effectiveQuery trimmed length <= 40
   * - effectiveQuery normalized is very similar to restaurant normalized OR
   *   effectiveQuery is short and contains no dish keywords and no macro keywords
   * - Also treat effectiveQuery in ["find meals","meals","menu","items","popular"] as browse query
   */
  function isRestaurantOnlyBrowseQuery(effectiveQuery: string, restaurant?: string): boolean {
    if (!restaurant) return false;
    if (!effectiveQuery || typeof effectiveQuery !== 'string') return false;
    
    const trimmed = effectiveQuery.trim();
    if (trimmed.length > 40) return false;
    
    const lowerQuery = trimmed.toLowerCase();
    
    // Check for explicit browse phrases
    const browsePhrases = ['find meals', 'meals', 'menu', 'items', 'popular'];
    if (browsePhrases.includes(lowerQuery)) {
      return true;
    }
    
    // Check for dish keywords (guard - if present, not restaurant-only browse)
    const dishKeywords = [
      'burger', 'burgers', 'burrito', 'burritos', 'pizza', 'pizzas', 'taco', 'tacos',
      'salad', 'salads', 'sandwich', 'sandwiches', 'sub', 'subs',
      'bowl', 'bowls', 'wrap', 'wraps', 'fries', 'chicken', 'wings',
      'quesadilla', 'nachos', 'soup', 'soups', 'pasta', 'noodles',
      'breakfast', 'lunch', 'dinner', 'snack', 'sushi', 'poke', 'ramen'
    ];
    
    for (const keyword of dishKeywords) {
      const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (pattern.test(lowerQuery)) {
        return false; // Contains dish keyword, not restaurant-only browse
      }
    }
    
    // Check for macro keywords (guard - if present, not restaurant-only browse)
    const macroKeywords = [
      'calorie', 'calories', 'cal', 'protein', 'carbs', 'carb', 'carbohydrates',
      'fat', 'fats', 'macros', 'macro', 'grams', 'gram', 'g',
      'under', 'over', 'above', 'below', 'at least', 'at most', 'minimum', 'maximum'
    ];
    
    for (const keyword of macroKeywords) {
      const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (pattern.test(lowerQuery)) {
        return false; // Contains macro keyword, not restaurant-only browse
      }
    }
    
    // Check if normalized query is very similar to normalized restaurant name
    const normalizedQuery = normalizeRestaurantNameForComparison(trimmed);
    const normalizedRestaurant = normalizeRestaurantNameForComparison(restaurant);
    
    // Check if query is contained in restaurant or restaurant is contained in query
    if (normalizedRestaurant.includes(normalizedQuery) || normalizedQuery.includes(normalizedRestaurant)) {
      if (Math.min(normalizedRestaurant.length, normalizedQuery.length) >= 3) {
        return true; // Similar enough, treat as restaurant-only browse
      }
    }
    
    // If query is short (<=28 chars) and has no dish/macro keywords, treat as browse
    if (trimmed.length <= 28) {
      return true;
    }
    
    return false;
  }

  // 3. RETRIEVAL STRATEGY: Explicit modes
  // A) DB_FILTERED: dishType or restaurant present OR numeric macro constraints present
  // B) DB_GENERIC: generic meal discovery (no OpenAI) OR numeric constraints without dish/restaurant
  // C) VECTOR: specific query (requires OpenAI) - only if no numeric constraints AND no dish/restaurant
  // D) VECTOR_FALLBACK: vector returned 0, fallback to DB_GENERIC
  
  // Check if user provided ANY numeric macro constraint
  const hasNumericConstraints = effectiveMinCalories !== undefined || 
                                 effectiveMaxCalories !== undefined ||
                                 effectiveMinProtein !== undefined || 
                                 effectiveMaxProtein !== undefined ||
                                 effectiveMinCarbs !== undefined ||
                                 effectiveMaxCarbs !== undefined || 
                                 effectiveMinFats !== undefined ||
                                 effectiveMaxFats !== undefined;
  
  let allItems: any[] = [];
  let retrievalStrategy: 'RESTAURANT_BROWSE' | 'DB_FILTERED' | 'DB_GENERIC' | 'VECTOR' | 'VECTOR_FALLBACK' = 'DB_GENERIC';
  let retrievalReason = '';
  const candidatesBeforeFiltering = 0; // Will be set after retrieval
  
  // Check for RESTAURANT_BROWSE strategy first (before DB_FILTERED)
  if (restaurantFilter && isRestaurantOnlyBrowseQuery(effectiveQuery, restaurantFilter)) {
    retrievalStrategy = 'RESTAURANT_BROWSE';
    retrievalReason = `restaurant-only browse query: "${effectiveQuery}" for restaurant "${restaurantFilter}"`;
    console.log(`[searchHandler] Retrieval strategy: RESTAURANT_BROWSE because ${retrievalReason}`);
    
    try {
      // Direct DB query - use restaurant_id when available, fallback to restaurant_name
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
      
      // Prefer restaurant_id when available (more reliable)
      // Defensive: Try restaurant_id first, fallback to restaurant_name variants on error
      if (restaurantId) {
        query = query.eq('restaurant_id', restaurantId);
        console.log(`[searchHandler] RESTAURANT_BROWSE filtering by restaurant_id: ${restaurantId}`);
      } else if (restaurantVariants && restaurantVariants.length > 0) {
        query = query.in('restaurant_name', restaurantVariants);
        console.log(`[searchHandler] RESTAURANT_BROWSE filtering by restaurant_name variants: ${restaurantVariants.length} variants`);
      } else if (restaurantFilter) {
        // Fallback: use single filter (should not happen for explicit restaurant queries)
        query = query.eq('restaurant_name', restaurantFilter);
        console.log(`[searchHandler] RESTAURANT_BROWSE filtering by restaurant_name (fallback, no variants): ${restaurantFilter}`);
      }
      
      const { data: dbItems, error: dbError } = await query.limit(2000); // Fetch large pool to ensure we get all items
      
      // If restaurant_id query failed (column doesn't exist), retry with restaurant_name
      if (dbError && restaurantId && restaurantFilter) {
        console.warn('[searchHandler] restaurant_id query failed, falling back to restaurant_name:', dbError.message);
        const fallbackQuery = supabase
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
          .in('restaurant_name', restaurantVariants && restaurantVariants.length > 0 ? restaurantVariants : [restaurantFilter])
          .limit(2000);
        
        const { data: fallbackItems, error: fallbackError } = await fallbackQuery;
        if (fallbackError) {
          console.error('[searchHandler] RESTAURANT_BROWSE fallback query error:', fallbackError);
          allItems = [];
        } else {
          allItems = fallbackItems || [];
        }
      } else if (dbError) {
        console.error('[searchHandler] RESTAURANT_BROWSE query error:', dbError);
        allItems = [];
      } else if (dbItems && dbItems.length > 0) {
        allItems = dbItems;
        console.log(`[searchHandler] RESTAURANT_BROWSE returned ${allItems.length} candidates`);
      } else {
        console.log('[searchHandler] RESTAURANT_BROWSE returned 0 items');
        return {
          meals: [],
          hasMore: false,
          nextOffset: 0,
          searchKey: currentSearchKey,
          message: `We don't have ${restaurantFilter} in our database yet.`
        };
      }
    } catch (dbError) {
      console.error('[searchHandler] RESTAURANT_BROWSE query exception:', dbError);
      return {
        meals: [],
        hasMore: false,
        nextOffset: 0,
        searchKey: currentSearchKey,
        message: `We don't have ${restaurantFilter} in our database yet.`
      };
    }
  } else if (dishType || restaurantFilter) {
    // STRATEGY A: DB_FILTERED - dishType or restaurant present
    retrievalStrategy = 'DB_FILTERED';
    if (dishType && restaurantFilter) {
      retrievalReason = `dishType (${dishType}) and restaurant (${restaurantFilter}) present`;
    } else if (dishType) {
      retrievalReason = `dishType (${dishType}) present`;
    } else {
      retrievalReason = `restaurant (${restaurantFilter}) present`;
    }
    console.log(`[searchHandler] Retrieval strategy: DB_FILTERED because ${retrievalReason}`);
    
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
      
      // Apply restaurant filter if present - prefer restaurant_id when available
      // Defensive: Try restaurant_id first, fallback to restaurant_name variants on error
      if (restaurantId) {
        query = query.eq('restaurant_id', restaurantId);
        console.log(`[searchHandler] DB_FILTERED filtering by restaurant_id: ${restaurantId}`);
      } else if (restaurantVariants && restaurantVariants.length > 0) {
        query = query.in('restaurant_name', restaurantVariants);
        console.log(`[searchHandler] DB_FILTERED filtering by restaurant_name variants: ${restaurantVariants.length} variants`);
      } else if (restaurantFilter) {
        // Fallback: use single filter (should not happen for explicit restaurant queries)
        query = query.eq('restaurant_name', restaurantFilter);
        console.log(`[searchHandler] DB_FILTERED filtering by restaurant_name (fallback, no variants): ${restaurantFilter}`);
      }
      
      // Fetch large candidate pool (500-1000 items) to cover whole DB
      const { data: dbItems, error: dbError } = await query.limit(1000);
      
      // If restaurant_id query failed (column doesn't exist), retry with restaurant_name
      if (dbError && restaurantId && restaurantFilter) {
        console.warn('[searchHandler] restaurant_id query failed, falling back to restaurant_name:', dbError.message);
        const fallbackQuery = supabase
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
        
        if (dishType) {
          // Re-apply dish type filter if present
          // (dish type filtering happens later, but we need to preserve the query structure)
        }
        
        if (restaurantVariants && restaurantVariants.length > 0) {
          fallbackQuery.in('restaurant_name', restaurantVariants);
        } else if (restaurantFilter) {
          fallbackQuery.eq('restaurant_name', restaurantFilter);
        }
        
        const { data: fallbackItems, error: fallbackError } = await fallbackQuery.limit(1000);
        if (fallbackError) {
          console.error('[searchHandler] DB_FILTERED fallback query error:', fallbackError);
          allItems = [];
        } else {
          allItems = fallbackItems || [];
        }
      } else if (dbError) {
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
  } else if (hasNumericConstraints) {
    // STRATEGY B (updated): DB_GENERIC - numeric macro constraints present, use DB-first
    // This is cheaper and more accurate for macro-filtered searches
    retrievalStrategy = 'DB_GENERIC';
    retrievalReason = `numeric macro constraints present (calories: ${effectiveMinCalories ?? 'min'} - ${effectiveMaxCalories ?? 'max'}, protein: ${effectiveMinProtein ?? 'min'} - ${effectiveMaxProtein ?? 'max'}, carbs: ${effectiveMinCarbs ?? 'min'} - ${effectiveMaxCarbs ?? 'max'}, fats: ${effectiveMinFats ?? 'min'} - ${effectiveMaxFats ?? 'max'})`;
    console.log(`[searchHandler] Retrieval strategy: DB_GENERIC because ${retrievalReason}`);
    
    try {
      // Build query - we'll filter macros in code after fetching for reliability
      // (Supabase PostgREST JSONB filtering syntax is complex and may vary by version)
      // Fetch a larger pool, then filter in code (still more efficient than fetching everything)
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
        .not('macros', 'is', null) // Ensure macros exist
        .order('id', { ascending: true }) // Deterministic ordering
        .limit(2000); // Fetch larger pool for macro filtering
      
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
  } else if (isGenericMealDiscovery(effectiveQuery)) {
    // STRATEGY B (legacy): DB_GENERIC - generic meal discovery, skip vector search entirely
    retrievalStrategy = 'DB_GENERIC';
    retrievalReason = `generic meal discovery query: "${effectiveQuery}"`;
    console.log(`[searchHandler] Retrieval strategy: DB_GENERIC because ${retrievalReason}`);
    
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
    // Only used if no numeric constraints, no dish/restaurant, and not generic query
    retrievalStrategy = 'VECTOR';
    retrievalReason = `specific query without numeric constraints: "${effectiveQuery}"`;
    console.log(`[searchHandler] Retrieval strategy: VECTOR because ${retrievalReason}`);
    
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

  // 6.5. APPLY MEAL TIME FILTER (breakfast/dinner name-based filtering)
  // Filter based on query containing "breakfast" or "dinner" keywords
  const mealTime = detectMealTime(params.query);
  const itemsBeforeMealTimeFilter = normalizedItems.length;
  let mealTimeFilteredItems = normalizedItems;
  
  if (mealTime === "dinner") {
    // Exclude items whose name contains "breakfast"
    mealTimeFilteredItems = normalizedItems.filter((item: any) => !nameHasBreakfast(item.name));
  } else if (mealTime === "breakfast") {
    // Keep items whose name contains "breakfast" OR items from Starbucks
    mealTimeFilteredItems = normalizedItems.filter((item: any) => isBreakfastItem(item));
  }
  
  const candidatesAfterMealTimeFilter = mealTimeFilteredItems.length;
  
  // Log meal time filtering summary
  if (mealTime) {
    console.log(`[searchHandler] Meal time filter (${mealTime}): ${itemsBeforeMealTimeFilter} → ${candidatesAfterMealTimeFilter} items`, {
      mealTime,
      before: itemsBeforeMealTimeFilter,
      after: candidatesAfterMealTimeFilter,
    });
  }

  // 6.6. APPLY PROTEIN FILTER (if protein keyword detected in query)
  // Filter meals to only return those where protein keyword appears in menu name
  const proteinKeyword = extractProteinKeyword(params.query || '');
  const itemsBeforeProteinFilter = mealTimeFilteredItems.length;
  let proteinFilteredItems = mealTimeFilteredItems;
  let candidatesAfterProteinFilter: number | undefined;
  
  if (proteinKeyword) {
    proteinFilteredItems = applyProteinFilter(mealTimeFilteredItems, proteinKeyword);
    candidatesAfterProteinFilter = proteinFilteredItems.length;
    
    // Log protein filtering summary
    if (itemsBeforeProteinFilter > candidatesAfterProteinFilter) {
      console.log(`[searchHandler] Protein filter (${proteinKeyword}): ${itemsBeforeProteinFilter} → ${candidatesAfterProteinFilter} items`);
    }
    
    // If protein filtering results in 0 items, return early with message
    if (proteinFilteredItems.length === 0) {
      const proteinDisplay = proteinKeyword.charAt(0).toUpperCase() + proteinKeyword.slice(1);
      const message = `No meals with ${proteinDisplay} match your request yet.`;
      
      return {
        meals: [],
        hasMore: false,
        nextOffset: 0,
        searchKey: currentSearchKey,
        message
      };
    }
  }

  // 7. APPLY STRICT MACRO FILTERS (from JSONB)
  // All macro filtering uses JSON macros (from normalized object)
  // Macros are in menu_items.macros jsonb: calories, protein, carbs, fat
  // Use effective parameters (reconstructed from searchKey if available, normalized to numbers)
  // Support both min (>=) and max (<=) constraints for each macro
  const itemsBeforeMacroFilter = proteinFilteredItems.length;
  
  const macroFilteredItems = proteinFilteredItems.filter((item: any) => {
    // Ensure item macros are numbers (should already be normalized, but double-check)
    const itemCalories = typeof item.calories === 'number' ? item.calories : parseFloat(item.calories) || 0;
    const itemProtein = typeof item.protein === 'number' ? item.protein : parseFloat(item.protein) || 0;
    const itemCarbs = typeof item.carbs === 'number' ? item.carbs : parseFloat(item.carbs) || 0;
    // Items are normalized, so they should have fats set, but use defensive fallback
    // Prefer fats (from normalized object), fallback to fat for safety
    const itemFats = typeof item.fats === 'number' ? item.fats : 
                     (typeof item.fat === 'number' ? item.fat : 0);
    
    // Calories constraints: min (>=) and max (<=)
    if (effectiveMinCalories !== undefined && itemCalories < effectiveMinCalories) return false;
    if (effectiveMaxCalories !== undefined && itemCalories > effectiveMaxCalories) return false;
    
    // Protein constraints: min (>=) and max (<=)
    if (effectiveMinProtein !== undefined && itemProtein < effectiveMinProtein) return false;
    if (effectiveMaxProtein !== undefined && itemProtein > effectiveMaxProtein) return false;
    
    // Carbs constraints: min (>=) and max (<=)
    if (effectiveMinCarbs !== undefined && itemCarbs < effectiveMinCarbs) return false;
    if (effectiveMaxCarbs !== undefined && itemCarbs > effectiveMaxCarbs) return false;
    
    // Fats constraints: min (>=) and max (<=)
    if (effectiveMinFats !== undefined && itemFats < effectiveMinFats) return false;
    if (effectiveMaxFats !== undefined && itemFats > effectiveMaxFats) return false;
    
    return true;
  });
  
  const candidatesAfterMacroFilter = macroFilteredItems.length;
  console.log(`[searchHandler] Macro filter step: ${itemsBeforeMacroFilter} → ${candidatesAfterMacroFilter} items`, {
    before: itemsBeforeMacroFilter,
    after: candidatesAfterMacroFilter,
    effectiveConstraints: {
      minCalories: effectiveMinCalories,
      maxCalories: effectiveMaxCalories,
      minProtein: effectiveMinProtein,
      maxProtein: effectiveMaxProtein,
      minCarbs: effectiveMinCarbs,
      maxCarbs: effectiveMaxCarbs,
      minFats: effectiveMinFats,
      maxFats: effectiveMaxFats,
    }
  });

  // HOMEPAGE STRICT FILTERING (no fallback - filters must ALWAYS be satisfied)
  // Ensure dish-only filtering is applied for homepage requests
  let finalMacroFilteredItems: any[] = macroFilteredItems;
  
  // For homepage: ensure dish-only filtering (items should already be dish-only, but double-check for strictness)
  if (params.isHomepage && !params.isPagination) {
    // Apply dish-only filter (items should already be filtered, but ensure strictness)
    const afterMacroFilter = finalMacroFilteredItems.length;
    finalMacroFilteredItems = finalMacroFilteredItems.filter((item: any) => isDishItem(item, dishType));
    const afterDishFilter = finalMacroFilteredItems.length;
    
    // Log filters applied and counts
    console.log('[HOME_FILTERS_APPLIED]', {
      caloriesMin: effectiveMinCalories,
      caloriesMax: effectiveMaxCalories,
      proteinMin: effectiveMinProtein,
      carbsMin: effectiveMinCarbs,
      fatsMin: effectiveMinFats,
    });
    
    console.log('[HOME_COUNTS]', {
      dbRows: candidatesAfterNormalization,
      afterDishFilter: afterDishFilter,
      afterMacroFilter: afterMacroFilter,
      returned: finalMacroFilteredItems.length,
    });
  }
  
  // Runtime assertion in development: ensure all filtered items satisfy constraints
  if (process.env.NODE_ENV === 'development' && macroFilteredItems.length > 0) {
    try {
      const { assertMealsSatisfyConstraints } = await import('@/lib/macro-utils');
      const mealsWithMacros = macroFilteredItems.map((item: any) => ({
        macros: {
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fats: item.fats ?? item.fat ?? 0,
        }
      }));
      assertMealsSatisfyConstraints(mealsWithMacros, {
        minCalories: effectiveMinCalories,
        maxCalories: effectiveMaxCalories,
        minProtein: effectiveMinProtein,
        maxProtein: effectiveMaxProtein,
        minCarbs: effectiveMinCarbs,
        maxCarbs: effectiveMaxCarbs,
        minFats: effectiveMinFats,
        maxFats: effectiveMaxFats,
      }, 'searchHandler macro filter');
    } catch (error) {
      // Don't fail the request if assertion fails, just log
      console.error('[searchHandler] Macro constraint assertion failed:', error);
    }
  }
  
  // Log filtering summary with candidate counts before/after filtering
  console.log('[searchHandler] Filtering summary:', {
    retrievalStrategy,
    candidatesAfterRetrieval,
    candidatesAfterDishFilter,
    candidatesAfterNormalization,
    candidatesAfterMealTimeFilter: mealTime ? candidatesAfterMealTimeFilter : undefined,
    candidatesAfterProteinFilter: proteinKeyword ? candidatesAfterProteinFilter : undefined,
    candidatesAfterMacroFilter
  });
  
  // Diet filtering removed - use final macro filtered items (homepage may have applied fallback)
  const itemsForRemainingFilters = finalMacroFilteredItems;

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
    fats: item.fats || item.fat || 0, // Use "fats" (plural) as primary, fallback to "fat" for backward compatibility
    image: item.image_url || '/placeholder-food.jpg',
    description: '', // Not in schema, leave empty
    category: item.category || '',
    dietary_tags: item.normalized_tags || [], // Use normalized dietary tags
    price: item.price_estimate || null,
  }));
  
  // STRICT RESTAURANT ENFORCEMENT: Dev assertion
  // If restaurant filter is active, ensure ALL returned meals are from that restaurant
  if (process.env.NODE_ENV === 'development' && restaurantFilter) {
    const violations = finalMeals.filter((meal: any) => {
      const mealRestaurant = meal.restaurant_name || meal.restaurant;
      return mealRestaurant !== restaurantFilter;
    });
    
    if (violations.length > 0) {
      const errorMsg = `[searchHandler] CRITICAL: ${violations.length} meal(s) violate restaurant constraint! ` +
        `Expected: ${restaurantFilter}, but found: ${violations.slice(0, 3).map((v: any) => `${v.name} (${v.restaurant_name || v.restaurant})`).join(', ')}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log('[searchHandler] Restaurant constraint verified: all meals from', restaurantFilter);
  }

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
    if (effectiveMinCalories) constraints.push(`at least ${effectiveMinCalories} calories`);
    if (effectiveMaxCalories) constraints.push(`under ${effectiveMaxCalories} calories`);
    if (effectiveMinProtein) constraints.push(`at least ${effectiveMinProtein}g protein`);
    if (effectiveMaxProtein) constraints.push(`under ${effectiveMaxProtein}g protein`);
    if (effectiveMinCarbs) constraints.push(`at least ${effectiveMinCarbs}g carbs`);
    if (effectiveMaxCarbs) constraints.push(`under ${effectiveMaxCarbs}g carbs`);
    if (effectiveMinFats) constraints.push(`at least ${effectiveMinFats}g fat`);
    if (effectiveMaxFats) constraints.push(`under ${effectiveMaxFats}g fat`);
    
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
    if (effectiveMinCalories) constraints.push(`at least ${effectiveMinCalories} calories`);
    if (effectiveMaxCalories) constraints.push(`under ${effectiveMaxCalories} calories`);
    if (effectiveMinProtein) constraints.push(`at least ${effectiveMinProtein}g protein`);
    if (effectiveMaxProtein) constraints.push(`under ${effectiveMaxProtein}g protein`);
    if (effectiveMinCarbs) constraints.push(`at least ${effectiveMinCarbs}g carbs`);
    if (effectiveMaxCarbs) constraints.push(`under ${effectiveMaxCarbs}g carbs`);
    if (effectiveMinFats) constraints.push(`at least ${effectiveMinFats}g fat`);
    if (effectiveMaxFats) constraints.push(`under ${effectiveMaxFats}g fat`);
    
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
        minCalories: effectiveMinCalories,
        maxCalories: effectiveMaxCalories,
        minProtein: effectiveMinProtein,
        maxProtein: effectiveMaxProtein,
        minCarbs: effectiveMinCarbs,
        maxCarbs: effectiveMaxCarbs,
        minFats: effectiveMinFats,
        maxFats: effectiveMaxFats,
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
