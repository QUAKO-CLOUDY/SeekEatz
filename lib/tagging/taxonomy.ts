/**
 * SeekEatz Taxonomy System
 * Canonical tags, synonyms, and cuisine mappings for retrieval
 *
 * RULES:
 * - Cuisine types must match restaurants.cuisine_type exactly
 * - Normalized categories must match menu_items.normalized_category exactly
 * - Synonym expansion happens at query-parse time, never at storage time
 */

// ─── Normalized Category → Display Label ────────────────────────────────────
export const CATEGORY_LABELS: Record<string, string> = {
  entree:        'Entrée',
  burger:        'Burger',
  sandwich:      'Sandwich',
  wrap:          'Wrap',
  salad:         'Salad',
  bowl:          'Bowl',
  pizza:         'Pizza',
  pasta:         'Pasta',
  taco:          'Taco',
  burrito:       'Burrito',
  quesadilla:    'Quesadilla',
  chicken:       'Chicken',
  wings:         'Wings',
  seafood:       'Seafood',
  soup:          'Soup',
  appetizer:     'Appetizer',
  breakfast_item:'Breakfast',
  smoothie:      'Smoothie',
  coffee:        'Coffee',
  hot_dog:       'Hot Dog',
  snack:         'Snack',
  side:          'Side',
  modifier:      'Modifier',
  drink:         'Drink',
};

// ─── Cuisine Types ────────────────────────────────────────────────────────────
export const CUISINE_TYPES = [
  'american', 'mexican', 'italian', 'asian', 'mediterranean',
  'healthy', 'smoothie_juice', 'sandwiches', 'seafood', 'bbq',
  'steakhouse', 'pizza', 'cafe', 'breakfast', 'caribbean',
] as const;

export type CuisineType = typeof CUISINE_TYPES[number];

// ─── Chain Types ──────────────────────────────────────────────────────────────
export const CHAIN_TYPES = [
  'fast_food', 'fast_casual', 'casual_dining',
  'fine_dining', 'cafe', 'bar_grill', 'buffet', 'food_truck',
] as const;

// ─── Cuisine Synonym Map ──────────────────────────────────────────────────────
// Maps user language → cuisine_type for retrieval
export const CUISINE_SYNONYMS: Record<string, CuisineType> = {
  // American / burgers
  'american':       'american',
  'usa':            'american',
  'burgers':        'american',
  'burger':         'american',
  'bbq':            'bbq',
  'barbecue':       'bbq',
  'ribs':           'bbq',
  'brisket':        'bbq',
  'pulled pork':    'bbq',
  'smoked':         'bbq',

  // Mexican
  'mexican':        'mexican',
  'tex-mex':        'mexican',
  'tacos':          'mexican',
  'taco':           'mexican',
  'burrito':        'mexican',
  'burritos':       'mexican',
  'quesadilla':     'mexican',
  'enchilada':      'mexican',
  'fajita':         'mexican',
  'tamale':         'mexican',

  // Italian
  'italian':        'italian',
  'pasta':          'italian',
  'pizza':          'pizza',
  'calzone':        'pizza',
  'risotto':        'italian',

  // Asian
  'asian':          'asian',
  'chinese':        'asian',
  'japanese':       'asian',
  'thai':           'asian',
  'korean':         'asian',
  'vietnamese':     'asian',
  'sushi':          'asian',
  'ramen':          'asian',
  'pho':            'asian',
  'pad thai':       'asian',
  'stir fry':       'asian',
  'fried rice':     'asian',
  'noodles':        'asian',
  'dumplings':      'asian',

  // Mediterranean
  'mediterranean':  'mediterranean',
  'greek':          'mediterranean',
  'middle eastern': 'mediterranean',
  'pita':           'mediterranean',
  'falafel':        'mediterranean',
  'hummus':         'mediterranean',
  'gyro':           'mediterranean',
  'shawarma':       'mediterranean',
  'kebab':          'mediterranean',

  // Healthy
  'healthy':        'healthy',
  'clean':          'healthy',
  'whole':          'healthy',
  'organic':        'healthy',
  'nutritious':     'healthy',
  'bowls':          'healthy',
  'grain bowl':     'healthy',
  'power bowl':     'healthy',
  'acai':           'healthy',

  // Seafood
  'seafood':        'seafood',
  'fish':           'seafood',
  'salmon':         'seafood',
  'shrimp':         'seafood',
  'lobster':        'seafood',
  'crab':           'seafood',
  'tuna':           'seafood',

  // Sandwiches / subs
  'sandwich':       'sandwiches',
  'sandwiches':     'sandwiches',
  'sub':            'sandwiches',
  'subs':           'sandwiches',
  'hoagie':         'sandwiches',

  // Smoothie / juice
  'smoothie':       'smoothie_juice',
  'juice':          'smoothie_juice',
  'acai bowl':      'smoothie_juice',

  // Cafe
  'cafe':           'cafe',
  'coffee':         'cafe',
  'bakery':         'cafe',
  'bagel':          'cafe',

  // Breakfast
  'breakfast':      'breakfast',
  'brunch':         'breakfast',
};

// ─── Intent Synonym Map ───────────────────────────────────────────────────────
// Maps lifestyle/intent words → structured filter values
// Used by query-parser when deterministic filters aren't enough
export const INTENT_FILTERS: Record<string, {
  minCalories?: number;
  maxCalories?: number;
  minProtein?: number;
  maxProtein?: number;
  maxCarbs?: number;
  maxFat?: number;
  minCarbs?: number;
  label: string;
}> = {
  // Energy / bulk
  'filling':      { minCalories: 500, minProtein: 25,  label: 'filling' },
  'hearty':       { minCalories: 550, minProtein: 25,  label: 'hearty' },
  'bulking':      { minCalories: 700, minProtein: 40,  label: 'bulking' },
  'big':          { minCalories: 600,                  label: 'big' },

  // Light / cut
  'light':        { maxCalories: 450,                  label: 'light' },
  'low calorie':  { maxCalories: 500,                  label: 'low calorie' },
  'low-calorie':  { maxCalories: 500,                  label: 'low calorie' },
  'lite':         { maxCalories: 450,                  label: 'light' },
  'cutting':      { maxCalories: 500, minProtein: 30,  label: 'cutting' },
  'diet':         { maxCalories: 500,                  label: 'diet' },

  // Protein
  'high protein': { minProtein: 30,                    label: 'high protein' },
  'high-protein': { minProtein: 30,                    label: 'high protein' },
  'protein':      { minProtein: 25,                    label: 'high protein' },
  'lean':         { maxFat: 15,  minProtein: 25,       label: 'lean' },
  'clean':        { maxFat: 15,  minProtein: 25,       label: 'clean' },

  // Carb
  'low carb':     { maxCarbs: 30,                      label: 'low carb' },
  'low-carb':     { maxCarbs: 30,                      label: 'low carb' },
  'keto':         { maxCarbs: 25, maxFat: 999,         label: 'keto' },
  'no carbs':     { maxCarbs: 20,                      label: 'no carbs' },

  // Fat
  'low fat':      { maxFat: 15,                        label: 'low fat' },
  'low-fat':      { maxFat: 15,                        label: 'low fat' },

  // Workout
  'pre-workout':  { minProtein: 25, minCarbs: 30,      label: 'pre-workout' },
  'pre workout':  { minProtein: 25, minCarbs: 30,      label: 'pre-workout' },
  'post-workout': { minProtein: 35, maxFat: 15,        label: 'post-workout' },
  'post workout': { minProtein: 35, maxFat: 15,        label: 'post-workout' },
  'gains':        { minProtein: 40, minCalories: 600,  label: 'gains' },

  // Misc
  'indulgent':    { minCalories: 700,                  label: 'indulgent' },
  'cheat':        { minCalories: 700,                  label: 'cheat meal' },
  'comfort':      { minCalories: 600,                  label: 'comfort food' },
  'healthy':      { maxCalories: 600, minProtein: 20, maxFat: 25, label: 'healthy' },
};

// ─── Dish Taxonomy (item name → normalized_category) ─────────────────────────
// Used for keyword-based search and dish-type detection
export const DISH_TAXONOMY: Record<string, { keywords: string[]; normalized: string }> = {
  burger: {
    normalized: 'burger',
    keywords: [
      'burger', 'burgers', 'cheeseburger', 'hamburger', 'patty',
      'whopper', 'big mac', 'smashburger',
    ],
  },
  sandwich: {
    normalized: 'sandwich',
    keywords: [
      'sandwich', 'sandwiches', 'sub', 'subs', 'hoagie', 'hero',
      'panini', 'melt', 'club', 'grinder', 'torpedo',
    ],
  },
  wrap: {
    normalized: 'wrap',
    keywords: ['wrap', 'wraps', 'flatbread wrap'],
  },
  salad: {
    normalized: 'salad',
    keywords: ['salad', 'salads', 'chopped salad', 'caesar', 'greens'],
  },
  bowl: {
    normalized: 'bowl',
    keywords: [
      'bowl', 'bowls', 'grain bowl', 'power bowl', 'protein bowl',
      'acai bowl', 'pitaya bowl', 'smoothie bowl',
    ],
  },
  pizza: {
    normalized: 'pizza',
    keywords: ['pizza', 'flatbread', 'calzone', 'stromboli'],
  },
  pasta: {
    normalized: 'pasta',
    keywords: [
      'pasta', 'spaghetti', 'fettuccine', 'penne', 'rigatoni',
      'linguine', 'lasagna', 'ravioli', 'tortellini', 'gnocchi',
    ],
  },
  taco: {
    normalized: 'taco',
    keywords: ['taco', 'tacos'],
  },
  burrito: {
    normalized: 'burrito',
    keywords: ['burrito', 'burritos'],
  },
  quesadilla: {
    normalized: 'quesadilla',
    keywords: ['quesadilla', 'quesadillas', 'dilla', "'dilla"],
  },
  mexican: {
    normalized: 'entree',
    keywords: [
      'enchilada', 'fajita', 'nachos', 'carnitas',
      'barbacoa', 'tamale', 'chalupa', 'gordita',
    ],
  },
  chicken: {
    normalized: 'chicken',
    keywords: [
      'chicken', 'tender', 'tenders', 'nugget', 'nuggets',
      'drumstick', 'thigh', 'breast',
    ],
  },
  wings: {
    normalized: 'wings',
    keywords: ['wing', 'wings', 'boneless wings', 'bone-in'],
  },
  breakfast: {
    normalized: 'breakfast_item',
    keywords: [
      'breakfast', 'pancake', 'waffle', 'omelet', 'omelette',
      'scrambled egg', 'hash brown', 'hashbrown', 'biscuit',
      'bagel', 'morning', 'brunch',
    ],
  },
  smoothie: {
    normalized: 'smoothie',
    keywords: [
      'smoothie', 'smoothies', 'shake', 'blend', 'acai',
      'pitaya', 'dragon fruit',
    ],
  },
  soup: {
    normalized: 'soup',
    keywords: ['soup', 'chowder', 'bisque', 'stew', 'chili', 'broth'],
  },
  sushi: {
    normalized: 'entree',
    keywords: ['sushi', 'roll', 'rolls', 'sashimi', 'nigiri', 'maki'],
  },
  ramen: {
    normalized: 'entree',
    keywords: ['ramen', 'pho', 'noodle', 'noodles', 'udon', 'soba', 'pad thai'],
  },
  steak: {
    normalized: 'entree',
    keywords: [
      'steak', 'ribeye', 'sirloin', 'filet', 'filet mignon',
      'strip steak', 'new york strip', 't-bone', 'porterhouse',
    ],
  },
  seafood: {
    normalized: 'seafood',
    keywords: [
      'salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'mahi',
      'shrimp', 'lobster', 'crab', 'scallop', 'oyster', 'clam',
    ],
  },
};

// ─── Meal Type Labels ─────────────────────────────────────────────────────────
export const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch:     'Lunch',
  dinner:    'Dinner',
  all_day:   'All Day',
  snack:     'Snack',
  dessert:   'Dessert',
  drink:     'Drink',
  brunch:    'Brunch',
};

// ─── Modifier categories (excluded from food search by default) ───────────────
export const MODIFIER_CATEGORIES = ['modifier'] as const;
export const NON_MEAL_ITEM_TYPES = ['modifier', 'side', 'snack', 'drink'] as const;
