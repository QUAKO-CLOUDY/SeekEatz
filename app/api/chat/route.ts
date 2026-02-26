import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { ROUTER_SYSTEM_PROMPT } from '@/lib/chat-prompts';
import { searchHandler } from '@/app/api/search/handler';
import { buildSearchParams } from '@/lib/search-utils';
import { resolveRestaurantFromText, extractRestaurantPhrase, resolveRestaurantUniversal } from '@/lib/restaurant-resolver';
import { extractMacroConstraintsFromText, hasConstraints } from '@/lib/extractMacroConstraintsFromText';
import { hasRemainingUsage, incrementUsageCount } from '@/lib/usage-cookie';

export const maxDuration = 30;

/**
 * Helper function to create response headers for tracking LLM router usage
 */
function createResponseHeaders(
  usedLLMRouter: boolean,
  routerMode: string,
  heuristicMode: string
): Record<string, string> {
  return {
    'x-used-llm-router': usedLLMRouter ? 'true' : 'false',
    'x-router-mode': routerMode,
    'x-heuristic-mode': heuristicMode || 'none'
  };
}

const routerSchema = z.object({
  mode: z.enum(['MEAL_SEARCH', 'NUTRITION_TEXT', 'CLARIFY']),
  query: z.string().optional(),
  constraints: z.object({
    calorieCap: z.number().optional(),
    minProtein: z.number().optional(),
    maxCarbs: z.number().optional(),
    maxFat: z.number().optional(),
    diet: z.string().optional(),
    restaurant: z.string().optional(),
    nearMe: z.boolean().optional(),
  }).optional(),
  structuredIntent: z.object({
    restaurantName: z.string().nullable().optional(),
    dietaryRestrictions: z.array(z.string()).optional(),
    excludedIngredients: z.array(z.string()).optional(),
    minProtein: z.number().nullable().optional(),
    maxCalories: z.number().nullable().optional(),
    minCalories: z.number().nullable().optional(),
    maxCarbs: z.number().nullable().optional(),
    maxFat: z.number().nullable().optional(),
    calorieRange: z.object({
      min: z.number(),
      max: z.number(),
    }).nullable().optional(),
    sortingIntent: z.string().nullable().optional(),
    mealType: z.string().nullable().optional(),
    cuisineType: z.string().nullable().optional(),
  }).optional(),
  answer: z.string().optional(),
  question: z.string().optional(),
});

/**
 * Maps structuredIntent fields from the enhanced router schema
 * into the downstream-compatible constraints format.
 * structuredIntent fields take priority over constraints when both exist.
 */
function mergeStructuredIntent(
  constraints: {
    calorieCap?: number;
    minProtein?: number;
    maxCarbs?: number;
    maxFat?: number;
    diet?: string;
    restaurant?: string;
    nearMe?: boolean;
  } | undefined,
  structuredIntent: {
    restaurantName?: string | null;
    dietaryRestrictions?: string[];
    excludedIngredients?: string[];
    minProtein?: number | null;
    maxCalories?: number | null;
    minCalories?: number | null;
    maxCarbs?: number | null;
    maxFat?: number | null;
    calorieRange?: { min: number; max: number } | null;
    sortingIntent?: string | null;
    mealType?: string | null;
    cuisineType?: string | null;
  } | undefined
): {
  calorieCap?: number;
  minProtein?: number;
  maxCarbs?: number;
  maxFat?: number;
  minCalories?: number;
  diet?: string;
  restaurant?: string;
  nearMe?: boolean;
  sortingIntent?: string;
  excludedIngredients?: string[];
  mealType?: string;
  cuisineType?: string;
} {
  const base = constraints || {};
  if (!structuredIntent) return base;

  const merged: any = { ...base };

  // Macro constraints from structuredIntent take priority
  if (structuredIntent.maxCalories != null) {
    merged.calorieCap = structuredIntent.maxCalories;
  }
  if (structuredIntent.minProtein != null) {
    merged.minProtein = structuredIntent.minProtein;
  }
  if (structuredIntent.maxCarbs != null) {
    merged.maxCarbs = structuredIntent.maxCarbs;
  }
  if (structuredIntent.maxFat != null) {
    merged.maxFat = structuredIntent.maxFat;
  }
  if (structuredIntent.minCalories != null) {
    merged.minCalories = structuredIntent.minCalories;
  }

  // Calorie range: apply as calorieCap (max) and minCalories (min)
  if (structuredIntent.calorieRange) {
    merged.minCalories = structuredIntent.calorieRange.min;
    merged.calorieCap = structuredIntent.calorieRange.max;
  }

  // Dietary restrictions → diet field (use first restriction)
  if (structuredIntent.dietaryRestrictions && structuredIntent.dietaryRestrictions.length > 0) {
    merged.diet = structuredIntent.dietaryRestrictions[0];
  }

  // Restaurant from structuredIntent
  if (structuredIntent.restaurantName) {
    merged.restaurant = structuredIntent.restaurantName;
  }

  // Pass through new fields
  if (structuredIntent.sortingIntent) {
    merged.sortingIntent = structuredIntent.sortingIntent;
  }
  if (structuredIntent.excludedIngredients && structuredIntent.excludedIngredients.length > 0) {
    merged.excludedIngredients = structuredIntent.excludedIngredients;
  }
  if (structuredIntent.mealType) {
    merged.mealType = structuredIntent.mealType;
  }
  if (structuredIntent.cuisineType) {
    merged.cuisineType = structuredIntent.cuisineType;
  }

  return merged;
}

/**
 * Detects if message is ONLY location phrases (no other content)
 */
function isLocationOnly(message: string): boolean {
  const lowerMessage = message.toLowerCase().trim();

  // Location-only patterns
  const locationOnlyPatterns = [
    /^near\s+me$/i,
    /^nearby$/i,
    /^close\s+to\s+me$/i,
    /^around\s+here$/i,
    /^in\s+my\s+area$/i,
    /^within\s+\d+\s*(mile|miles|mi)$/i,
  ];

  return locationOnlyPatterns.some(pattern => pattern.test(lowerMessage));
}

/**
 * Detects generic meal discovery phrases
 * Returns true if message is a generic meal discovery query (no restaurant intent)
 * Returns false if message contains explicit restaurant markers ("from", "at", "in")
 */
function isGenericMealDiscovery(message: string): boolean {
  if (!message || typeof message !== 'string') return false;

  const lowerMessage = message.toLowerCase().trim();

  // Check for explicit restaurant markers first - if present, NOT generic
  const explicitRestaurantMarkers = [
    /\b(from|at|in)\s+[a-z0-9]/i,  // "from X", "at X", "in X"
    /\b[a-z0-9\s&'-]+\s+(menu|restaurant|order|near me)\b/i,  // "X menu", "X restaurant"
  ];

  const hasExplicitMarker = explicitRestaurantMarkers.some(pattern => pattern.test(message));
  if (hasExplicitMarker) {
    return false; // Explicit restaurant marker means NOT generic
  }

  // Generic meal discovery patterns (conservative matching)
  const genericPatterns = [
    /^\s*find\s+me\s+(lunch|dinner|breakfast)\b/i,  // "find me lunch", "find me dinner"
    /\bwhat\s+should\s+i\s+eat\b/i,  // "what should i eat"
    /\bmeal\s+ideas\b/i,  // "meal ideas"
    /\bfood\s+ideas\b/i,  // "food ideas"
    /^\s*find\s+me\b\s*$/i,  // "find me" (standalone)
    /^\s*find\s+(me\s+)?(something|anything)\b/i,  // "find me something", "find anything"
    /^\s*(give\s+me\s+)?(options|option)\s*$/i,  // "options", "give me options"
  ];

  return genericPatterns.some(pattern => pattern.test(message));
}

/**
 * Pre-router heuristic: Detects food intent keywords
 * Returns true if message contains food-related search intent
 */
function hasFoodIntent(message: string): boolean {
  const lowerMessage = message.toLowerCase();

  // Food intent verbs
  const foodVerbs = [
    'find me', 'find', 'show me', 'show', 'recommend', 'suggest',
    'options', 'option', 'give me', 'get me', 'want', 'looking for',
    'search', 'searching', 'looking', 'need', 'what should i eat', 'food ideas'
  ];

  // Meal time keywords
  const mealTimeKeywords = ['meal', 'meals', 'lunch', 'dinner', 'breakfast', 'snack', 'snacks', 'food'];

  // Dish type keywords
  const dishKeywords = [
    'burger', 'burgers', 'bowl', 'bowls', 'sandwich', 'sandwiches',
    'burrito', 'burritos', 'taco', 'tacos', 'salad', 'salads',
    'wrap', 'wraps', 'pizza', 'pizzas', 'sushi', 'pasta', 'noodles'
  ];

  // Macro keywords
  const macroKeywords = [
    'calories', 'calorie', 'cal', 'protein', 'carbs', 'carb',
    'carbohydrates', 'fat', 'fats', 'macros', 'macro'
  ];

  // Check for any food intent indicators
  const hasFoodVerb = foodVerbs.some(verb => lowerMessage.includes(verb));
  const hasMealTime = mealTimeKeywords.some(keyword => lowerMessage.includes(keyword));
  const hasDishType = dishKeywords.some(keyword => lowerMessage.includes(keyword));
  const hasMacro = macroKeywords.some(keyword => lowerMessage.includes(keyword));

  return hasFoodVerb || hasMealTime || hasDishType || hasMacro;
}

/**
 * Validates restaurant name against database
 * Returns validated restaurant name if found, undefined otherwise
 */
async function validateRestaurant(restaurantName: string | undefined): Promise<string | undefined> {
  if (!restaurantName) return undefined;

  try {
    const supabase = await createClient();

    // Try fuzzy matching using search_restaurants_trgm RPC (same as searchHandler)
    const { data: restMatches } = await supabase.rpc('search_restaurants_trgm', {
      query_text: restaurantName
    });

    if (restMatches && restMatches.length > 0) {
      // Return the first match (best match)
      return restMatches[0].name;
    }

    // If RPC fails or returns no results, restaurant is invalid
    return undefined;
  } catch (error) {
    console.warn('[api/chat] Restaurant validation error:', error);
    return undefined;
  }
}

/**
 * Normalizes constraints to ensure all numeric fields are actual numbers (not strings)
 * Handles conversion from string to number and validates values
 * Returns a single normalized constraints object with numeric fields as numbers
 */
function normalizeConstraints(constraints: {
  calorieCap?: number | string;
  minProtein?: number | string;
  maxCarbs?: number | string;
  maxFat?: number | string;
  restaurant?: string;
}): {
  calorieCap?: number;
  minProtein?: number;
  maxCarbs?: number;
  maxFat?: number;
  restaurant?: string;
} {
  const normalized: {
    calorieCap?: number;
    minProtein?: number;
    maxCarbs?: number;
    maxFat?: number;
    restaurant?: string;
  } = {};

  // Normalize calorieCap
  if (constraints.calorieCap !== undefined && constraints.calorieCap !== null) {
    const value = typeof constraints.calorieCap === 'string'
      ? parseFloat(constraints.calorieCap)
      : constraints.calorieCap;
    if (!isNaN(value) && value > 0) {
      normalized.calorieCap = value;
    }
  }

  // Normalize minProtein
  if (constraints.minProtein !== undefined && constraints.minProtein !== null) {
    const value = typeof constraints.minProtein === 'string'
      ? parseFloat(constraints.minProtein)
      : constraints.minProtein;
    if (!isNaN(value) && value > 0) {
      normalized.minProtein = value;
    }
  }

  // Normalize maxCarbs
  if (constraints.maxCarbs !== undefined && constraints.maxCarbs !== null) {
    const value = typeof constraints.maxCarbs === 'string'
      ? parseFloat(constraints.maxCarbs)
      : constraints.maxCarbs;
    if (!isNaN(value) && value > 0) {
      normalized.maxCarbs = value;
    }
  }

  // Normalize maxFat
  if (constraints.maxFat !== undefined && constraints.maxFat !== null) {
    const value = typeof constraints.maxFat === 'string'
      ? parseFloat(constraints.maxFat)
      : constraints.maxFat;
    if (!isNaN(value) && value > 0) {
      normalized.maxFat = value;
    }
  }

  // Restaurant (string, no conversion needed)
  if (constraints.restaurant) {
    normalized.restaurant = constraints.restaurant;
  }

  return normalized;
}

/**
 * Deterministic parser: Extracts meal constraints from user message using regex (no LLM)
 * Returns an object with extracted constraints that can be merged with routerResult.constraints
 */
function parseMealConstraintsFromText(message: string): {
  calorieCap?: number;
  minProtein?: number;
  maxCarbs?: number;
  maxFat?: number;
  restaurant?: string;
  breakfast?: boolean;
} {
  const lowerMessage = message.toLowerCase();
  const constraints: {
    calorieCap?: number;
    minProtein?: number;
    maxCarbs?: number;
    maxFat?: number;
    restaurant?: string;
    breakfast?: boolean;
  } = {};

  // Extract calorieCap from patterns like:
  // "under 700 calories", "below 650 cal", "max 500", "less than 600 calories", "under 700"
  const caloriePatterns = [
    /\b(under|below|less\s+than|max|maximum|at\s+most)\s+(\d+)\s*(calories?|cal|kcal)\b/i,
    /\b(under|below|less\s+than|max|maximum|at\s+most)\s+(\d+)\b/i, // "under 700" (assume calories)
  ];

  for (const pattern of caloriePatterns) {
    const match = message.match(pattern);
    if (match) {
      const value = parseInt(match[2], 10);
      if (!isNaN(value) && value > 0) {
        constraints.calorieCap = value;
        break; // Take first match
      }
    }
  }

  // Extract minProtein from patterns like:
  // "at least 35g protein", "35 grams of protein", "35g of protein", "35g protein", "minimum 30g protein"
  const proteinPatterns = [
    /\b(at\s+least|minimum|min)\s+(\d+)\s*(g|grams?|gram)\s+(of\s+)?protein\b/i, // match[2] is the number
    /\b(\d+)\s*(g|grams?|gram)\s+(of\s+)?protein\b/i, // match[1] is the number
  ];

  for (const pattern of proteinPatterns) {
    const match = message.match(pattern);
    if (match) {
      // For first pattern: match[2] is the number, match[1] is "at least"/"minimum"/"min"
      // For second pattern: match[1] is the number
      const value = parseInt(match[2] || match[1], 10);
      if (!isNaN(value) && value > 0) {
        constraints.minProtein = value;
        break; // Take first match
      }
    }
  }

  // Extract maxCarbs from patterns like:
  // "under 40g carbs", "below 50g carbohydrates", "max 30g carbs", "less than 40g carbs"
  const carbsPatterns = [
    /\b(under|below|less\s+than|max|maximum|at\s+most)\s+(\d+)\s*(g|grams?|gram)\s+(carbs?|carbohydrates?)\b/i,
  ];

  for (const pattern of carbsPatterns) {
    const match = message.match(pattern);
    if (match) {
      const value = parseInt(match[2], 10);
      if (!isNaN(value) && value > 0) {
        constraints.maxCarbs = value;
        break; // Take first match
      }
    }
  }

  // Extract maxFat from patterns like:
  // "under 20g fat", "below 25g fat", "max 15g fat", "less than 20g fat"
  const fatPatterns = [
    /\b(under|below|less\s+than|max|maximum|at\s+most)\s+(\d+)\s*(g|grams?|gram)\s+fat\b/i,
  ];

  for (const pattern of fatPatterns) {
    const match = message.match(pattern);
    if (match) {
      const value = parseInt(match[2], 10);
      if (!isNaN(value) && value > 0) {
        constraints.maxFat = value;
        break; // Take first match
      }
    }
  }

  // Extract restaurant name from patterns like:
  // "from McDonald's", "at Chipotle", "from X", "at X"
  // Basic extraction - takes the word/phrase after "from" or "at"
  // BUT: exclude forbidden tokens that should never be interpreted as restaurants
  const forbiddenRestaurantTokens = [
    'least', 'most', 'under', 'over', 'above', 'below', 'at', 'and', 'with', 'near',
    'nearby', 'me', 'my', 'the', 'a', 'an', 'or', 'for', 'to', 'from', 'in', 'on',
    'by', 'calories', 'calorie', 'cal', 'protein', 'carbs', 'carb', 'fat', 'fats',
    'grams', 'gram', 'g', 'lunch', 'dinner', 'breakfast', 'snack', 'meal', 'meals',
    'food', 'find', 'show', 'get', 'want', 'looking', 'search', 'options',
    // Generic restaurant/cuisine types (should not be treated as specific restaurants)
    'steakhouse', 'restaurant', 'diner', 'cafe', 'cafeteria', 'bistro', 'pizzeria',
    'bakery', 'grill', 'bar', 'pub', 'tavern', 'eatery', 'joint', 'spot', 'chain',
    'place', 'shop', 'stand', 'counter',
    'italian', 'mexican', 'chinese', 'japanese', 'asian', 'indian', 'thai',
    'greek', 'korean', 'vietnamese', 'french', 'mediterranean', 'american',
    'southern', 'cajun', 'bbq', 'barbecue', 'seafood', 'sushi',
    'burger', 'pizza', 'taco', 'sandwich', 'salad', 'noodle', 'ramen'
  ];

  const restaurantPatterns = [
    /\bfrom\s+([a-z0-9\s&'-]+?)(?:\s|$|,|\.|!|\?)/i, // "from McDonald's" or "from Chipotle"
    /\bat\s+([a-z0-9\s&'-]+?)(?:\s|$|,|\.|!|\?)/i,   // "at McDonald's" or "at Chipotle"
  ];

  for (const pattern of restaurantPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      let restaurantName = match[1].trim();
      // Clean up common trailing words that aren't part of the restaurant name
      restaurantName = restaurantName.replace(/\s+(restaurant|place|location|near|here|there)$/i, '');

      // Check if the extracted name contains forbidden tokens
      const lowerName = restaurantName.toLowerCase();
      const isForbidden = forbiddenRestaurantTokens.some(token => {
        // Check if token appears as a whole word in the restaurant name
        const tokenRegex = new RegExp(`\\b${token}\\b`, 'i');
        return tokenRegex.test(lowerName);
      });

      // Only set restaurant if it's not forbidden and meets length requirements
      if (!isForbidden && restaurantName.length > 0 && restaurantName.length < 50) {
        constraints.restaurant = restaurantName;
        break; // Take first match
      }
    }
  }

  // Extract breakfast boolean ONLY if explicitly says "breakfast"
  // Do NOT treat "lunch" or "dinner" as filters (per requirements)
  if (/\bbreakfast\b/i.test(message)) {
    constraints.breakfast = true;
  }

  return constraints;
}

/**
 * Pre-router heuristic: Detects meta/app questions
 * Returns true if message is clearly about the app itself, not food search
 */
function isMetaQuestion(message: string): boolean {
  const lowerMessage = message.toLowerCase();

  // Meta keywords
  const metaKeywords = [
    'how does this app work',
    'how does seekeatz work',
    'what is seekeatz',
    'what is this app',
    'pricing',
    'price',
    'cost',
    'subscription',
    'help',
    'support',
    'contact',
    'about',
    'features',
    'how to use',
    'tutorial',
    'guide'
  ];

  return metaKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Pre-router heuristic: Determines if we can skip LLM routing
 * Returns { skipLLM: boolean, mode: string | null, answer?: string }
 */
/**
 * Detects if a message is a nutrition/informational question (not a meal search)
 * These should go to the LLM router to be classified as NUTRITION_TEXT
 */
function isNutritionQuestion(message: string): boolean {
  const lowerMessage = message.toLowerCase().trim();
  const nutritionPatterns = [
    /^how\s+many\s+(calories|cal|protein|carbs?|fat)\b/i,
    /^how\s+much\s+(protein|calories|cal|carbs?|fat)\b/i,
    /^what\s+(is|are)\s+the\s+(calories|nutrition|macros|protein|carbs?)\b/i,
    /^is\s+(creatine|sodium|sugar|caffeine|gluten|cholesterol)\s+(safe|bad|good|healthy)\b/i,
    /\bcalories\s+in\s+(a|an|the)?\s*\w/i, // "calories in a big mac"
    /\bprotein\s+in\s+(a|an|the)?\s*\w/i, // "protein in a ..."
    /\bhow\s+much\s+protein\s+do\s+I\s+need\b/i,
    /\bis\s+\w+\s+(safe|bad|good|healthy|harmful|toxic)\b/i,
  ];
  return nutritionPatterns.some(p => p.test(lowerMessage));
}

/**
 * Detects if a message is too vague to route without LLM
 * Very short messages with generic terms should go to LLM for proper CLARIFY routing
 */
function isTooVague(message: string): boolean {
  const trimmed = message.trim();
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  // Single word queries that are just generic food terms
  if (words.length <= 1) {
    const vagueSingleWords = ['food', 'eat', 'hungry', 'meal', 'meals', 'snack', 'dinner', 'lunch', 'breakfast'];
    return vagueSingleWords.includes(trimmed.toLowerCase());
  }
  return false;
}

/**
 * Detects impossible/conflicting macro constraints that should go to LLM for CLARIFY
 * e.g., "80g protein under 300 calories" is nearly impossible for restaurant meals
 */
function hasImpossibleConstraints(message: string): boolean {
  const lower = message.toLowerCase();
  // Extract protein minimum
  const proteinMatch = lower.match(/(\d+)\s*g?\s*protein/);
  const proteinMin = proteinMatch ? parseInt(proteinMatch[1], 10) : 0;
  // Extract calorie maximum
  const calorieMatch = lower.match(/(under|below|less\s+than|max|at\s+most)\s+(\d+)\s*(cal|calories?|kcal)?/i);
  const calorieMax = calorieMatch ? parseInt(calorieMatch[2], 10) : Infinity;
  // Check if ratio is impossible: very high protein + very low calories
  // 80g protein at 4 cal/g = 320 cal minimum from protein alone
  if (proteinMin >= 60 && calorieMax <= 300) {
    return true;
  }
  return false;
}

function preRouterHeuristic(message: string): {
  skipLLM: boolean;
  mode: 'MEAL_SEARCH' | 'NUTRITION_TEXT' | 'CLARIFY' | null;
  answer?: string;
} {
  // Check for meta questions first (highest priority)
  if (isMetaQuestion(message)) {
    return {
      skipLLM: true,
      mode: 'NUTRITION_TEXT',
      answer: "SeekEatz helps you find meals that match your nutrition goals. You can search for meals by type (burgers, bowls, sandwiches), calories, protein, carbs, or restaurant. Just tell me what you're looking for! For pricing and account questions, please check the Settings page."
    };
  }

  // CRITICAL: Nutrition questions must go to LLM (should NOT be routed as MEAL_SEARCH)
  // This check runs BEFORE hasFoodIntent since nutrition questions contain food/macro keywords
  if (isNutritionQuestion(message)) {
    return {
      skipLLM: false,
      mode: null
    };
  }

  // CRITICAL: Very vague queries must go to LLM for proper CLARIFY routing
  if (isTooVague(message)) {
    return {
      skipLLM: false,
      mode: null
    };
  }

  // CRITICAL: Impossible constraint combinations must go to LLM for proper CLARIFY routing
  // e.g., "80g protein under 300 calories" should get a helpful explanation
  if (hasImpossibleConstraints(message)) {
    return {
      skipLLM: false,
      mode: null
    };
  }

  // Check if message is ONLY location phrases - treat as generic meal discovery
  if (isLocationOnly(message)) {
    return {
      skipLLM: true,
      mode: 'MEAL_SEARCH'
    };
  }

  // Check for food intent (includes generic meal discovery, dish types, macros)
  if (hasFoodIntent(message)) {
    return {
      skipLLM: true,
      mode: 'MEAL_SEARCH'
    };
  }

  // Ambiguous - need LLM routing
  return {
    skipLLM: false,
    mode: null
  };
}

export async function POST(req: Request) {
  // Generate short requestId for correlation (first 8 chars of timestamp + random)
  const requestId = Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(-2);

  // Top-level request scope: track whether LLM router was used
  // Defaults to false, set to true ONLY immediately before generateObject() is called
  let usedLLMRouter = false;

  try {
    // 1. Parse request body with error handling
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('Request body parse error:', parseError);
      return NextResponse.json({
        error: true,
        message: "Invalid request format. Please send a valid JSON body with a 'message' field.",
        mode: "text",
        answer: "Invalid request format. Please try again."
      }, {
        status: 400,
        headers: createResponseHeaders(false, 'ERROR', 'none')
      });
    }

    const { message, userContext, history } = body;

    // Validate required fields
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({
        error: true,
        message: "Missing or invalid 'message' field in request body.",
        mode: "text",
        answer: "Please provide a message to continue."
      }, {
        status: 400,
        headers: createResponseHeaders(false, 'ERROR', 'none')
      });
    }

    // 2. Initialize Supabase
    let supabase;
    try {
      supabase = await createClient();
    } catch (supabaseError) {
      console.error('Supabase initialization error:', supabaseError);
      return NextResponse.json({
        error: true,
        message: "Failed to initialize database connection.",
        mode: "text",
        answer: "I'm having trouble connecting to the database. Please try again."
      }, {
        status: 500,
        headers: createResponseHeaders(false, 'ERROR', 'none')
      });
    }

    // 3. Auth & Usage Check
    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    } catch (authError) {
      console.warn('Auth check warning:', authError);
    }

    // If not authenticated, verify usage limit
    if (!user) {
      const allowed = await hasRemainingUsage();
      if (!allowed) {
        return NextResponse.json({
          error: true,
          message: "You have reached the free usage limit.",
          mode: "text",
          answer: "You have reached the free usage limit. Please sign up to continue using SeekEatz.",
          usageLimit: true
        }, {
          status: 403,
          headers: createResponseHeaders(false, 'ERROR', 'none')
        });
      }
    }

    // 4. PRE-ROUTER HEURISTIC (Skip LLM when possible)
    const heuristic = preRouterHeuristic(message);
    const heuristicMode = heuristic.mode || null;

    console.log('[api/chat] Pre-router heuristic:', {
      heuristicMode: heuristicMode || 'AMBIGUOUS',
      usedLLMRouter,
      message: message.substring(0, 100) // Log first 100 chars
    });

    let routerResult;

    if (heuristic.skipLLM) {
      // Use heuristic result directly, skip generateObject
      // usedLLMRouter remains false (heuristic-only path)
      if (heuristic.mode === 'MEAL_SEARCH') {
        console.log(`[NO LLM] requestId=${requestId} heuristic=MEAL_SEARCH`);
        routerResult = {
          mode: 'MEAL_SEARCH',
          query: message,
          constraints: {},
          structuredIntent: undefined
        };
      } else if (heuristic.mode === 'NUTRITION_TEXT' && heuristic.answer) {
        console.log(`[NO LLM] requestId=${requestId} heuristic=NUTRITION_TEXT`);
        routerResult = {
          mode: 'NUTRITION_TEXT',
          answer: heuristic.answer
        };
      } else {
        // Fallback: treat as ambiguous and use LLM
        console.log('[api/chat] Heuristic result unclear, falling back to LLM');
        routerResult = null; // Will trigger generateObject below
      }
    }

    // 5. ROUTER LOGIC (Structured Output) - Only if heuristic didn't skip
    if (!heuristic.skipLLM || !routerResult) {
      // Set usedLLMRouter = true ONLY immediately before generateObject() is called
      usedLLMRouter = true;

      // Unmistakable log when OpenAI router is about to run
      console.log(`[LLM ROUTER CALL] generateObject invoked requestId=${requestId}`);

      try {
        const result = await generateObject({
          model: openai('gpt-4o-mini'),
          system: ROUTER_SYSTEM_PROMPT,
          messages: [
            ...(history || []),
            { role: 'user', content: message }
          ],
          schema: routerSchema,
        });
        routerResult = result.object;
      } catch (generateError) {
        console.error('generateObject error:', generateError);
        // Fallback to CLARIFY if structured output fails
        // This path attempted LLM but failed, so usedLLMRouter = true
        return NextResponse.json({
          error: false,
          message: "Router fallback to clarification.",
          mode: "text",
          answer: "I'm not sure what you're looking for. Could you please clarify? For example, you can ask me to find meals, ask nutrition questions, or search by restaurant."
        }, {
          headers: createResponseHeaders(true, 'CLARIFY', heuristicMode || 'none')
        });
      }
    }

    // Log final routing decision
    console.log('[api/chat] Final routing decision:', {
      mode: routerResult?.mode || 'UNKNOWN',
      usedLLMRouter,
      heuristicMode
    });

    // Validate the result shape manually
    if (!routerResult || typeof routerResult !== 'object') {
      return NextResponse.json({
        error: false,
        message: "Invalid router result shape.",
        mode: "text",
        answer: "I'm not sure what you're looking for. Could you please clarify?"
      }, {
        headers: createResponseHeaders(usedLLMRouter, 'CLARIFY', heuristicMode || 'none')
      });
    }

    // Validate mode field
    const finalRouterMode = routerResult.mode || 'CLARIFY';
    if (!routerResult.mode || !['MEAL_SEARCH', 'NUTRITION_TEXT', 'CLARIFY'].includes(routerResult.mode)) {
      return NextResponse.json({
        error: false,
        message: "Invalid router mode.",
        mode: "text",
        answer: "I'm not sure what you're looking for. Could you please clarify?"
      }, {
        headers: createResponseHeaders(usedLLMRouter, finalRouterMode, heuristicMode || 'none')
      });
    }

    // 5. MANUAL BRANCHING
    if (routerResult.mode === 'MEAL_SEARCH') {
      // PATH A: MEAL SEARCH

      // Merge structuredIntent from enhanced router into constraints (backward-compatible)
      const enhancedConstraints = mergeStructuredIntent(routerResult.constraints, routerResult.structuredIntent);
      // Apply merged constraints back to routerResult for downstream use
      routerResult.constraints = {
        calorieCap: enhancedConstraints.calorieCap,
        minProtein: enhancedConstraints.minProtein,
        maxCarbs: enhancedConstraints.maxCarbs,
        maxFat: enhancedConstraints.maxFat,
        diet: enhancedConstraints.diet,
        restaurant: enhancedConstraints.restaurant,
        nearMe: enhancedConstraints.nearMe,
      };

      // Log enhanced intent extraction
      if (routerResult.structuredIntent) {
        console.log('[api/chat] Enhanced structuredIntent:', {
          dietaryRestrictions: routerResult.structuredIntent.dietaryRestrictions,
          excludedIngredients: routerResult.structuredIntent.excludedIngredients,
          sortingIntent: routerResult.structuredIntent.sortingIntent,
          mealType: routerResult.structuredIntent.mealType,
          cuisineType: routerResult.structuredIntent.cuisineType,
          calorieRange: routerResult.structuredIntent.calorieRange,
          mergedCalorieCap: enhancedConstraints.calorieCap,
          mergedMinProtein: enhancedConstraints.minProtein,
          mergedDiet: enhancedConstraints.diet,
        });
      }

      // STEP 0: Deterministic intent detection (no LLM, regex only)
      const { detectExplicitRestaurantConstraint } = await import('@/lib/intent-detection');

      // Detect explicit restaurant constraint
      const restaurantIntent = detectExplicitRestaurantConstraint(message);
      const explicitRestaurantDetected = restaurantIntent.hasRestaurant;
      const extractedRestaurantQuery = restaurantIntent.restaurantQuery;

      // Extract macro constraints using authoritative extractor
      const extractedConstraints = extractMacroConstraintsFromText(message);
      const macroConstraintsDetected = hasConstraints(extractedConstraints);

      // Log constraint extraction
      console.log('[chat] extractedConstraints', extractedConstraints, 'macroConstraintsDetected', macroConstraintsDetected);

      // Log intent detection results
      console.log('[api/chat] Intent detection:', {
        explicitRestaurantDetected,
        extractedRestaurantQuery: extractedRestaurantQuery || undefined,
        macroConstraintsDetected,
      });

      // HARD GUARDRAIL: Only resolve restaurant if explicit constraint exists
      // Do NOT call restaurant resolver for macro queries or generic discovery
      let restaurantMatch: { status: 'MATCH'; canonicalName: string; restaurantId?: string; variants: string[]; matchType: 'exact' | 'tokenSubset' | 'fuzzy' } | { status: 'NOT_FOUND'; missingRestaurantQuery?: string } | { status: 'AMBIGUOUS'; candidates: Array<{ name: string; score: number }> } | { status: 'NO_RESTAURANT' } | { status: 'NO_MEALS'; canonicalName: string } = { status: 'NO_RESTAURANT' };

      // CRITICAL: Only use routerResult.constraints?.restaurant if explicitRestaurantDetected is true
      // Do NOT trust LLM router's restaurant constraint unless user explicitly requested it
      let restaurantQuery = explicitRestaurantDetected
        ? (routerResult.constraints?.restaurant?.trim() || extractedRestaurantQuery)
        : extractedRestaurantQuery; // Only use extracted query, ignore routerResult

      // STEP 1: Restaurant resolution (ONLY if explicit constraint detected)
      let resolvedCandidates: any[] = [];
      if (!explicitRestaurantDetected) {
        // SKIP restaurant resolver entirely - no explicit restaurant constraint
        restaurantMatch = { status: 'NO_RESTAURANT' };
        restaurantQuery = undefined;
        console.log('[api/chat] SKIP restaurant resolver (no explicit restaurant constraint)', {
          reason: macroConstraintsDetected ? 'macro constraints detected' : 'no explicit restaurant marker'
        });
      } else {
        // Use universal resolver with the EXTRACTED restaurant name, not the full message
        // Pass restaurantQuery as pre-extracted so the resolver skips its internal extraction
        // (which would reject names like 'Burger King' because 'burger' is a generic food term)
        restaurantMatch = await resolveRestaurantUniversal(message, restaurantQuery);

        // Log resolution result
        const isDev = process.env.NODE_ENV === 'development';
        if (isDev) {
          console.log('[api/chat] Restaurant resolution result (universal):', {
            message: message.substring(0, 100),
            status: restaurantMatch.status,
            canonicalName: restaurantMatch.status === 'MATCH' ? restaurantMatch.canonicalName :
              restaurantMatch.status === 'NO_MEALS' ? restaurantMatch.canonicalName : undefined,
            restaurantId: restaurantMatch.status === 'MATCH' ? restaurantMatch.restaurantId : undefined,
            variants: restaurantMatch.status === 'MATCH' ? restaurantMatch.variants : undefined,
            variantsCount: restaurantMatch.status === 'MATCH' ? restaurantMatch.variants?.length : undefined,
            matchType: restaurantMatch.status === 'MATCH' ? restaurantMatch.matchType : undefined,
            candidates: restaurantMatch.status === 'AMBIGUOUS' ? restaurantMatch.candidates : undefined,
          });
        }

        // Store candidates for logging (empty array for non-AMBIGUOUS status)
        resolvedCandidates = restaurantMatch.status === 'AMBIGUOUS'
          ? restaurantMatch.candidates.map(c => ({ name: c.name, score: c.score }))
          : [];
      }

      // STEP 2.5: Determine if this is a restaurant-only query (should use generic search query)
      let restaurantOnly = false;
      if (explicitRestaurantDetected && restaurantMatch.status === 'MATCH') {
        const { isRestaurantOnlyQuery } = await import('@/lib/restaurant-resolver');
        restaurantOnly = isRestaurantOnlyQuery(message, true);
      }

      // STEP 2.6: Explicit restaurant gate - only apply restaurant constraint if user explicitly requested it
      // explicitRestaurant is true if we have explicit constraint AND restaurantMatch is MATCH
      const explicitRestaurant = explicitRestaurantDetected && restaurantMatch.status === 'MATCH';

      // Log restaurant resolution enforcement
      const isDev = process.env.NODE_ENV === 'development';
      if (isDev && explicitRestaurantDetected) {
        console.log('[api/chat] Restaurant enforcement:', {
          restaurantOnly,
          canonicalRestaurant: restaurantMatch.status === 'MATCH' ? restaurantMatch.canonicalName : undefined,
        });
      }

      // Handle NO_RESTAURANT: proceed with normal dish search (no restaurant constraint)
      if (restaurantMatch.status === 'NO_RESTAURANT') {
        // Proceed with normal dish search - no restaurant constraint
        // This happens when no explicit constraint exists (e.g., "burger", macro queries)
      }

      // Handle NO_MEALS: Restaurant exists but no menu_items found
      if (restaurantMatch.status === 'NO_MEALS' && explicitRestaurantDetected) {
        const canonicalName = restaurantMatch.canonicalName;
        if (!user) await incrementUsageCount();
        return NextResponse.json({
          error: false,
          message: `No meals available for ${canonicalName}`,
          mode: "text",
          answer: `We have ${canonicalName} listed but don't have meals for it yet.`
        }, {
          headers: createResponseHeaders(usedLLMRouter, 'MEAL_SEARCH', heuristicMode || 'none')
        });
      }

      // Handle NOT_FOUND: ONLY if explicit constraint exists
      if (restaurantMatch.status === 'NOT_FOUND' && explicitRestaurantDetected) {
        // Extract the restaurant name for the apology message
        const restaurantPatterns = [
          /\b(from|at|in)\s+([a-z0-9\s&'-]+?)(?:\s|$|,|\.|!|\?)/i,
          /\b([a-z0-9\s&'-]+?)\s+(menu|meals?|restaurant|order|near me)\b/i,
        ];

        let restaurantName = message.trim();
        for (const pattern of restaurantPatterns) {
          const match = message.match(pattern);
          if (match && match[2]) {
            restaurantName = match[2].trim();
            break;
          } else if (match && match[1]) {
            restaurantName = match[1].trim();
            break;
          }
        }

        // Clean up restaurant name
        restaurantName = restaurantName.replace(/\s+(restaurant|place|location|near|here|there|menu|meals?)$/i, '').trim();

        // Dev assertion: NOT_FOUND should only happen when explicit constraint exists
        if (isDev && !explicitRestaurantDetected) {
          console.error('[api/chat] CRITICAL: NOT_FOUND returned but explicitRestaurantDetected is false!', {
            message: message.substring(0, 100),
            explicitRestaurantDetected,
          });
        }

        if (!user) await incrementUsageCount();
        return NextResponse.json({
          error: false,
          message: `Restaurant not found: ${restaurantName}`,
          mode: "text",
          answer: `Sorry — we don't have ${restaurantName} in our database yet. Want me to show similar options from restaurants we do have?`
        }, {
          headers: createResponseHeaders(usedLLMRouter, 'MEAL_SEARCH', heuristicMode || 'none')
        });
      }

      // Handle AMBIGUOUS: Ask for disambiguation (only if explicit constraint exists)
      if (restaurantMatch.status === 'AMBIGUOUS' && explicitRestaurantDetected) {
        const candidatesList = restaurantMatch.candidates.slice(0, 5).map(c => c.name).join(', ');
        if (!user) await incrementUsageCount();
        return NextResponse.json({
          error: false,
          message: "Ambiguous restaurant match",
          mode: "text",
          answer: `I found multiple restaurants that might match. Did you mean: ${candidatesList}? Please specify which one.`
        }, {
          headers: createResponseHeaders(usedLLMRouter, 'MEAL_SEARCH', heuristicMode || 'none')
        });
      }

      // If NO_RESTAURANT or NOT_FOUND but no restaurant intent, proceed with normal dish search (don't show NOT_FOUND message)
      // NO_RESTAURANT means no restaurant intent was detected (e.g., "burger")
      // NOT_FOUND without restaurant intent should not happen, but handle gracefully

      // Check for diet requests that are NOT yet supported - return text-only response
      // NOTE: vegetarian, vegan, veggie, plant-based ARE now supported via dietary filtering in searchHandler
      const lowerMessage = message.toLowerCase();
      const unsupportedDietKeywords = ['pescatarian', 'keto', 'dairy-free', 'gluten-free', 'nut-free', 'shellfish-free', 'soy-free', 'egg-free'];
      const hasUnsupportedDietRequest = unsupportedDietKeywords.some(keyword => lowerMessage.includes(keyword));

      if (hasUnsupportedDietRequest) {
        // Return text-only response for unsupported diet requests
        if (!user) await incrementUsageCount();
        return NextResponse.json({
          error: false,
          message: "Diet filter request detected.",
          mode: "text",
          answer: "This specific diet filter is coming soon. For now I can filter by vegetarian/vegan, calories/macros, restaurant name, and dish type like burgers/bowls/sandwiches."
        }, {
          headers: createResponseHeaders(usedLLMRouter, 'MEAL_SEARCH', heuristicMode || 'none')
        });
      }

      // Check for "near me" language - MVP v1: return friendly message but proceed with normal search
      const locationKeywords = [
        'near me', 'nearby', 'close to me', 'within',
        'closest', 'near', 'local', 'in my area', 'around me', 'around here', 'close by'
      ];
      const hasLocationRequest = locationKeywords.some(keyword => {
        if (keyword === 'within') {
          // Check for "within X miles" pattern
          return /\bwithin\s+\d+\s*(mile|miles|mi)\b/i.test(lowerMessage);
        }
        return lowerMessage.includes(keyword);
      });

      // Friendly message for location requests (MVP v1)
      const locationMessage = hasLocationRequest
        ? "Location-based filtering is coming soon — here are some great options from restaurants we support."
        : undefined;

      // MVP v1: Sanitize message by removing location phrases and meal-time words (except breakfast) before search
      // Keep original message for chat history/display, use sanitized for search
      function sanitizeMessageForSearch(originalMessage: string): string {
        let sanitized = originalMessage;

        // Remove location phrases (case-insensitive, with word boundaries where appropriate)
        const locationPhrases = [
          /\bnear\s+me\b/gi,
          /\bnearby\b/gi,
          /\bclose\s+by\b/gi,
          /\bclose\s+to\s+me\b/gi,
          /\baround\s+here\b/gi,
          /\baround\s+me\b/gi,
          /\bin\s+my\s+area\b/gi,
          /\bwithin\s+\d+\s*(mile|miles|mi)\b/gi, // "within X miles" or "within X mi"
          /\bclosest\b/gi,
          /\blocal\b/gi,
        ];

        for (const phrase of locationPhrases) {
          sanitized = sanitized.replace(phrase, '');
        }

        // DO NOT strip meal-time words (lunch, dinner, breakfast) - keep them for search
        // This prevents "find me dinner" from becoming "find me" which triggers restaurant inference

        // Clean up extra whitespace (multiple spaces, leading/trailing)
        sanitized = sanitized.replace(/\s+/g, ' ').trim();

        // If sanitized is empty (e.g., "near me" only), use generic meal discovery query
        if (!sanitized || sanitized.length === 0) {
          sanitized = 'find meals';
        }

        return sanitized;
      }

      // For generic discovery queries, normalize to meal time if present, otherwise keep original
      function normalizeGenericQuery(originalMessage: string): string {
        const lowerMessage = originalMessage.toLowerCase().trim();

        // Extract meal time if present
        if (/\blunch\b/i.test(lowerMessage)) return 'lunch';
        if (/\bdinner\b/i.test(lowerMessage)) return 'dinner';
        if (/\bbreakfast\b/i.test(lowerMessage)) return 'breakfast';

        // Otherwise return original (or a generic fallback)
        return originalMessage.trim() || 'find meals';
      }

      /**
       * Normalizes semantic shorthand slugs like "protein-dish" into human-readable
       * vector search phrases like "high protein meal".
       * This ensures the vector DB gets a meaningful query instead of returning 0 results.
       * The macro constraints are enforced separately by extractMacroConstraintsFromText.
       * 
       * IMPORTANT: Preserves exclusion/negation phrases (e.g., "but not chicken", "no beef")
       * so that extractExcludedKeywords in the search handler can detect them.
       */
      function normalizeSemanticQuery(q: string): string {
        const lower = q.toLowerCase().trim();

        // Extract exclusion phrases BEFORE normalization so we can re-append them
        const exclusionPattern = /\b(but\s+)?(not|no|without|except|exclude|excluding|avoid|don'?t\s+want|anything\s+but|nothing\s+with|hold\s+the)\s+(\w+(?:\s+\w+)?)/gi;
        const exclusionMatches: string[] = [];
        let match;
        while ((match = exclusionPattern.exec(q)) !== null) {
          exclusionMatches.push(match[0].trim());
        }
        const exclusionSuffix = exclusionMatches.length > 0 ? ' ' + exclusionMatches.join(' ') : '';

        // Extract dietary keywords BEFORE normalization so we can re-append them
        // This ensures queries like "vegetarian high protein meal" preserve the dietary keyword
        const dietaryKeywords = ['vegetarian', 'vegetrian', 'vegitarian', 'veggie', 'vegan', 'plant-based', 'plant based', 'meatless', 'meat-free', 'meat free', 'pescatarian', 'halal', 'kosher'];
        const foundDietaryKeywords: string[] = [];
        for (const keyword of dietaryKeywords) {
          const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp(`\\b${escapedKeyword}\\b`, 'i').test(lower)) {
            foundDietaryKeywords.push(keyword);
          }
        }
        const dietarySuffix = foundDietaryKeywords.length > 0 ? ' ' + foundDietaryKeywords.join(' ') : '';

        // "protein-dish", "protein-meal", "protein-bowl", "protein-food", "protein-plate"
        if (/\bprotein[-\s]+(dish|meal|bowl|food|plate|option|item|pick|choice)\b/i.test(lower)) {
          return 'high protein meal' + dietarySuffix + exclusionSuffix;
        }

        // "high-protein-dish", "high-protein-meal", "high-protein-bowl"
        if (/\bhigh[-\s]+protein[-\s]+(dish|meal|bowl|food|plate|option|item|pick|choice)\b/i.test(lower)) {
          return 'high protein meal' + dietarySuffix + exclusionSuffix;
        }

        // "lean-dish", "lean-meal", "lean-bowl", "lean-food"
        if (/\blean[-\s]+(dish|meal|bowl|food|plate|option|item|pick|choice)\b/i.test(lower)) {
          return 'lean healthy meal' + dietarySuffix + exclusionSuffix;
        }

        // "low-cal-dish", "low-cal-meal", "low-cal-bowl", "low cal dish"
        if (/\blow[-\s]+cal(orie)?s?[-\s]+(dish|meal|bowl|food|plate|option|item|pick|choice)\b/i.test(lower)) {
          return 'low calorie meal' + dietarySuffix + exclusionSuffix;
        }

        // "low-carb-dish", "low-carb-meal"
        if (/\blow[-\s]+carbs?[-\s]+(dish|meal|bowl|food|plate|option|item|pick|choice)\b/i.test(lower)) {
          return 'low carb meal' + dietarySuffix + exclusionSuffix;
        }

        // "low-fat-dish", "low-fat-meal"
        if (/\blow[-\s]+fat[-\s]+(dish|meal|bowl|food|plate|option|item|pick|choice)\b/i.test(lower)) {
          return 'low fat meal' + dietarySuffix + exclusionSuffix;
        }

        return q; // No normalization needed — exclusion phrases already present
      }

      // Determine query for search
      // If explicit restaurant constraint exists and restaurant-only, use generic query
      // Otherwise, use sanitized message, then apply semantic normalization
      const sanitizedMessage = sanitizeMessageForSearch(message);
      const queryForSearch = (explicitRestaurantDetected && restaurantOnly)
        ? 'find meals'
        : normalizeSemanticQuery(sanitizedMessage);

      // Log message sanitization and restaurant-only detection
      if (isDev) {
        console.log('[api/chat] Message sanitization:', {
          originalMessage: message,
          sanitizedMessage: sanitizedMessage,
          restaurantOnly,
          queryForSearch,
        });
      }

      // Enforce exact behavior: use sanitized message for search, fixed limit/offset, no searchKey
      // This ensures typed chat uses the same logic as quick-picks
      // MVP v1: Do NOT pass location or distance params to searchHandler
      // Note: routerResult.constraints?.nearMe is ignored - we detect location from message text only

      // Parse constraints from message text (deterministic, regex-based, no LLM)
      const parsedConstraints = parseMealConstraintsFromText(message);

      // Merge constraints: prioritize macro constraints from intent detection, then parsed constraints, then routerResult
      // STRICT: Only apply restaurant constraint if restaurantMatch is MATCH AND explicitRestaurant is true
      // FIXED: Previously had !macroConstraintsDetected which dropped restaurant when macros present
      // Now: if user explicitly says "at Burger King", always apply restaurant constraint
      // For NOT_FOUND, AMBIGUOUS, or NO_RESTAURANT, explicitly set restaurant to undefined
      const canonicalRestaurant = (restaurantMatch.status === 'MATCH' && explicitRestaurant)
        ? restaurantMatch.canonicalName
        : undefined;
      const restaurantId = (restaurantMatch.status === 'MATCH' && explicitRestaurant)
        ? restaurantMatch.restaurantId
        : undefined;
      const restaurantVariants = (restaurantMatch.status === 'MATCH' && explicitRestaurant)
        ? restaurantMatch.variants
        : undefined;

      // Merge macro constraints: extracted constraints (authoritative) > routerResult > parsed constraints
      const mergedConstraints = {
        ...routerResult.constraints,
        // Macro constraints from authoritative extractor (highest priority)
        minProtein: extractedConstraints.minProtein ?? routerResult.constraints?.minProtein ?? parsedConstraints.minProtein,
        calorieCap: extractedConstraints.maxCalories ?? routerResult.constraints?.calorieCap ?? parsedConstraints.calorieCap,
        maxCarbs: extractedConstraints.maxCarbs ?? routerResult.constraints?.maxCarbs ?? parsedConstraints.maxCarbs,
        maxFat: extractedConstraints.maxFats ?? routerResult.constraints?.maxFat ?? parsedConstraints.maxFat,
        // Also handle minimum calories, carbs, fats from extracted constraints
        ...(extractedConstraints.minCalories && { minCalories: extractedConstraints.minCalories }),
        ...(extractedConstraints.minCarbs && { minCarbs: extractedConstraints.minCarbs }),
        ...(extractedConstraints.minFats && { minFats: extractedConstraints.minFats }),
        // Handle max protein from extracted constraints
        ...(extractedConstraints.maxProtein && { maxProtein: extractedConstraints.maxProtein }),
        // STRICT: Only set restaurant if we have a canonical match AND no macro constraints
        // Do NOT use routerResult.constraints?.restaurant or parsedConstraints.restaurant
        // when status is NOT_FOUND, AMBIGUOUS, NO_RESTAURANT, or when macro constraints are detected
        restaurant: canonicalRestaurant,
      };

      // Normalize all constraints to ensure numeric fields are numbers (not strings)
      // This ensures constraints are always in the correct format before passing to searchHandler
      const normalizedConstraints = normalizeConstraints(mergedConstraints);

      // Restaurant is already set to canonicalRestaurant (only when status === 'MATCH' && explicitRestaurant)
      // No additional validation needed since canonicalRestaurant comes from database match
      const validatedConstraints = {
        ...normalizedConstraints,
        restaurant: normalizedConstraints.restaurant, // Already canonicalRestaurant or undefined
      };

      // Log when restaurant param is omitted (NOT_FOUND, AMBIGUOUS, or NO_RESTAURANT)
      if (restaurantMatch.status !== 'MATCH' && isDev) {
        console.log('[api/chat] Restaurant param omitted:', {
          status: restaurantMatch.status,
          reason: restaurantMatch.status === 'NOT_FOUND' ? 'NOT_FOUND - no canonical restaurant' :
            restaurantMatch.status === 'AMBIGUOUS' ? 'AMBIGUOUS - multiple candidates' :
              restaurantMatch.status === 'NO_RESTAURANT' ? 'NO_RESTAURANT - no restaurant intent' :
                restaurantMatch.status === 'NO_MEALS' ? 'NO_MEALS - restaurant exists but no menu_items' :
                  'unknown',
          explicitRestaurant,
        });
      }

      // Log constraint parsing, merging, and validation
      console.log('[api/chat] Constraint parsing:', {
        message: message,
        parsedConstraints: parsedConstraints,
        mergedConstraints: mergedConstraints,
        normalizedConstraints: normalizedConstraints,
        validatedConstraints: validatedConstraints,
        restaurantFromResolver: restaurantMatch.status === 'MATCH' ? restaurantMatch.canonicalName : undefined,
        explicitRestaurant,
        canonicalRestaurant: canonicalRestaurant || undefined,
      });

      try {
        // Log state flags before building search params
        console.log('[api/chat] State flags before buildSearchParams:', {
          explicitRestaurantDetected,
          explicitRestaurant,
          restaurantOnly,
          macroConstraintsDetected,
          restaurantMatchStatus: restaurantMatch.status,
          canonicalRestaurant: canonicalRestaurant || undefined,
          finalRestaurantConstraint: canonicalRestaurant || undefined,
        });

        // Build normalized SearchParams using unified function
        // CRITICAL: Merge extracted constraints into search params BEFORE calling buildSearchParams
        // This ensures extracted constraints are always applied (authoritative)
        const searchParams = await buildSearchParams({
          query: queryForSearch, // Use generic query for restaurant-only, else sanitized message
          // Merge extracted constraints (authoritative) with validated constraints
          calorieCap: extractedConstraints.maxCalories ?? validatedConstraints.calorieCap,
          minCalories: extractedConstraints.minCalories,
          maxCalories: extractedConstraints.maxCalories ?? validatedConstraints.calorieCap,
          minProtein: extractedConstraints.minProtein ?? validatedConstraints.minProtein,
          maxProtein: extractedConstraints.maxProtein,
          minCarbs: extractedConstraints.minCarbs,
          maxCarbs: extractedConstraints.maxCarbs ?? validatedConstraints.maxCarbs,
          minFats: extractedConstraints.minFats,
          maxFat: extractedConstraints.maxFats ?? validatedConstraints.maxFat,
          maxFats: extractedConstraints.maxFats ?? validatedConstraints.maxFat,
          restaurantId: restaurantId, // Pass restaurant_id when available
          restaurant: validatedConstraints.restaurant,
          restaurantVariants: restaurantVariants, // Pass variants for filtering
          // MVP v1: Location filtering disabled - explicitly do NOT pass location
          // location is undefined (not passed) - this ensures no location filtering
          limit: 5, // Fixed pagination parameters (same as quick-picks)
          offset: 0,
          searchKey: undefined, // Let searchHandler generate it
          isPagination: false,
          // MVP v1: userContext explicitly not passed - contains location fields
          // userContext is undefined (not passed) - this ensures no location-based filtering
        });

        // Debug log: Log final constraints being passed to searchHandler
        if (isDev) {
          console.log('[api/chat] Final constraints passed to searchHandler:', {
            calorieCap: searchParams.calorieCap,
            minProtein: searchParams.minProtein,
            maxCarbs: searchParams.maxCarbs,
            maxFat: searchParams.maxFat,
            restaurant: searchParams.restaurant,
            query: searchParams.query,
            restaurantOnly,
            queryForSearch,
          });
        }

        // Call searchHandler and return response directly with consistent shape:
        // { mode: "meals", meals, hasMore, nextOffset, searchKey, summary?, message? }
        const result = await searchHandler(searchParams);

        // Add debug log: log keys of response object and restaurant-only info
        if (isDev) {
          console.log('[api/chat] Meal search response:', {
            keys: Object.keys(result),
            mealsLength: result.meals?.length,
            restaurantOnly,
            queryForSearch,
            canonicalRestaurant: restaurantMatch.status === 'MATCH' ? restaurantMatch.canonicalName : undefined,
          });
        }


        // STRICT RESTAURANT ENFORCEMENT: Dev assertion
        // If restaurantMatch is MATCH, ensure ALL returned meals are from that restaurant
        if (process.env.NODE_ENV === 'development' && restaurantMatch.status === 'MATCH') {
          const canonicalRestaurant = restaurantMatch.canonicalName;
          const violations = (result.meals || []).filter((meal: any) => {
            const mealRestaurant = meal.restaurant_name || meal.restaurant;
            return mealRestaurant !== canonicalRestaurant;
          });

          if (violations.length > 0) {
            const errorMsg = `[api/chat] CRITICAL: ${violations.length} meal(s) violate restaurant constraint! ` +
              `Expected: ${canonicalRestaurant}, but found: ${violations.slice(0, 3).map((v: any) => `${v.name} (${v.restaurant_name || v.restaurant})`).join(', ')}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
          }

          console.log('[api/chat] Restaurant constraint verified: all meals from', canonicalRestaurant);
        }

        // Standardize response shape: add mode field for meal results
        // Include restaurant metadata if restaurantMatch is MATCH
        const responseData: any = {
          mode: 'meals',
          ...result,
          // Prepend location message if present (MVP v1 behavior)
          ...(locationMessage && { message: locationMessage })
        };

        // Add restaurant metadata for UI display
        if (restaurantMatch.status === 'MATCH') {
          responseData.restaurant = restaurantMatch.canonicalName;
        }

        // Log final result summary
        console.log('[api/chat] Final result summary:', {
          message: message.substring(0, 100),
          explicitRestaurantDetected,
          macroConstraintsDetected,
          restaurantResolverSkipped: !explicitRestaurantDetected,
          finalStrategy: 'MEAL_SEARCH',
          resultCounts: {
            mealsReturned: result.meals?.length || 0,
            hasMore: result.hasMore || false
          },
          restaurantMatchStatus: restaurantMatch.status
        });

        if (!user) await incrementUsageCount();
        return NextResponse.json(responseData, {
          headers: createResponseHeaders(usedLLMRouter, 'MEAL_SEARCH', heuristicMode || 'none')
        });
      } catch (searchError) {
        console.error('searchHandler error:', searchError);
        return NextResponse.json({
          error: true,
          message: "Failed to search for meals.",
          mode: "text",
          answer: "I encountered an error while searching for meals. Please try again."
        }, {
          status: 500,
          headers: createResponseHeaders(usedLLMRouter, 'MEAL_SEARCH', heuristicMode || 'none')
        });
      }
    }

    if (routerResult.mode === 'NUTRITION_TEXT') {
      // PATH B: NUTRITION TEXT
      if (!routerResult.answer) {
        return NextResponse.json({
          error: false,
          message: "Missing nutrition answer from router.",
          mode: "text",
          answer: "I couldn't generate a nutrition answer for that question."
        }, {
          headers: createResponseHeaders(usedLLMRouter, 'NUTRITION_TEXT', heuristicMode || 'none')
        });
      }
      if (!user) await incrementUsageCount();
      return NextResponse.json({
        error: false,
        message: "Nutrition text response.",
        mode: "text",
        answer: routerResult.answer
      }, {
        headers: createResponseHeaders(usedLLMRouter, 'NUTRITION_TEXT', heuristicMode || 'none')
      });
    }

    if (routerResult.mode === 'CLARIFY') {
      // PATH C: CLARIFY
      if (!routerResult.question) {
        return NextResponse.json({
          error: false,
          message: "Missing clarification question from router.",
          mode: "text",
          answer: "Could you please clarify your request?"
        }, {
          headers: createResponseHeaders(usedLLMRouter, 'CLARIFY', heuristicMode || 'none')
        });
      }
      if (!user) await incrementUsageCount();
      return NextResponse.json({
        error: false,
        message: "Clarification requested.",
        mode: "text",
        answer: routerResult.question
      }, {
        headers: createResponseHeaders(usedLLMRouter, 'CLARIFY', heuristicMode || 'none')
      });
    }

    // Fallback (should never reach here, but ensure JSON response)
    return NextResponse.json({
      error: false,
      message: "Unknown router mode fallback.",
      mode: "text",
      answer: "I couldn't process that request. Please try rephrasing."
    }, {
      headers: createResponseHeaders(usedLLMRouter, 'CLARIFY', heuristicMode || 'none')
    });

  } catch (error) {
    // Top-level catch for any unhandled errors
    console.error('Chat Router Error (unhandled):', error);
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      error: error
    });

    return NextResponse.json({
      error: true,
      message: error instanceof Error ? error.message : "An unexpected error occurred.",
      mode: "text",
      answer: "I'm having trouble processing your request. Please try again."
    }, {
      status: 500,
      headers: createResponseHeaders(false, 'ERROR', 'none')
    });
  }
}
