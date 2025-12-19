import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { getMealImageUrl } from '@/lib/image-utils';

export const dynamic = 'force-dynamic';

/**
 * Normalizes radius to a bucket for caching (0.5, 1, 2, 5, 10)
 */
function getRadiusBucket(radiusMiles?: number): string {
  if (!radiusMiles) return 'none';
  if (radiusMiles <= 0.5) return '0.5';
  if (radiusMiles <= 1) return '1';
  if (radiusMiles <= 2) return '2';
  if (radiusMiles <= 5) return '5';
  if (radiusMiles <= 10) return '10';
  return '10+';
}

/**
 * Generates a unique searchKey from query parameters for pagination
 */
function generateSearchKey(
  query: string,
  calorieCap: number | null,
  radiusBucket: string,
  isMealIntent: boolean
): string {
  const normalizedQuery = query.toLowerCase().trim();
  const cap = calorieCap ? `_cap${calorieCap}` : '';
  const intent = isMealIntent ? '_meal' : '_search';
  return `${normalizedQuery}${cap}_radius${radiusBucket}${intent}`;
}

/**
 * Generates a summary line for meal results
 */
function generateMealSummary(query: string, mealCount: number): string {
  const lowerQuery = query.toLowerCase();
  
  // Extract calorie constraint
  const calorieMatch = lowerQuery.match(/(?:under|below|less than|max|maximum|up to)\s*(\d+)\s*(?:calories?|cal)/i);
  const maxCalories = calorieMatch ? parseInt(calorieMatch[1]) : null;
  
  // Extract meal type
  const hasLunch = lowerQuery.includes('lunch');
  const hasDinner = lowerQuery.includes('dinner');
  const hasBreakfast = lowerQuery.includes('breakfast');
  const mealType = hasBreakfast ? 'breakfast' : hasLunch ? 'lunch' : hasDinner ? 'dinner' : null;
  
  // Build summary
  if (mealType && maxCalories) {
    return `Found ${mealCount} ${mealType} option${mealCount !== 1 ? 's' : ''} under ${maxCalories} calories.`;
  } else if (mealType) {
    return `Here are ${mealCount} ${mealType} option${mealCount !== 1 ? 's' : ''}.`;
  } else if (maxCalories) {
    return `Found ${mealCount} option${mealCount !== 1 ? 's' : ''} under ${maxCalories} calories.`;
  } else {
    return `Here are ${mealCount} option${mealCount !== 1 ? 's' : ''} that match your request.`;
  }
}

/**
 * Comprehensive meal intent detection
 * Returns true if query is clearly a meal-finding request
 */
function isMealIntentQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  
  // Meal keywords
  const mealKeywords = ['lunch', 'dinner', 'breakfast', 'meal', 'bowl', 'entree', 'entrée', 'food'];
  if (mealKeywords.some(keyword => lowerQuery.includes(keyword))) {
    return true;
  }
  
  // Calorie constraints
  const caloriePatterns = [
    /under\s+(\d+)\s*cal/i,
    /less\s+than\s+(\d+)\s*cal/i,
    /below\s+(\d+)\s*cal/i,
    /<(\d+)\s*cal/i,
    /(\d+)\s*cal/i, // Any number followed by "cal" suggests calorie constraint
  ];
  if (caloriePatterns.some(pattern => pattern.test(lowerQuery))) {
    return true;
  }
  
  // Protein constraints
  const proteinPatterns = [
    /high\s+protein/i,
    /(\d+)\s*g?\s*protein/i,
    /protein\s+rich/i,
  ];
  if (proteinPatterns.some(pattern => pattern.test(lowerQuery))) {
    return true;
  }
  
  // Carb constraints
  const carbPatterns = [
    /low\s+carb/i,
    /low\s+carbs/i,
    /keto/i,
    /low\s+carbohydrate/i,
  ];
  if (carbPatterns.some(pattern => pattern.test(lowerQuery))) {
    return true;
  }
  
  return false;
}

/**
 * Extracts calorie cap from query if present
 */
function extractCalorieCap(query: string): number | null {
  const lowerQuery = query.toLowerCase();
  const patterns = [
    /under\s+(\d+)\s*cal/i,
    /less\s+than\s+(\d+)\s*cal/i,
    /below\s+(\d+)\s*cal/i,
    /<(\d+)\s*cal/i,
    /(\d+)\s*cal/i,
  ];
  
  for (const pattern of patterns) {
    const match = lowerQuery.match(pattern);
    if (match) {
      const value = parseInt(match[1] || match[0], 10);
      if (value > 0 && value < 5000) {
        return value;
      }
    }
  }
  
  return null;
}

/**
 * Extracts minimum protein requirement from query (e.g., "40g+ protein", "high protein 40g")
 */
function extractMinProtein(query: string): number | null {
  const lowerQuery = query.toLowerCase();
  const patterns = [
    /(\d+)\s*g?\s*\+?\s*protein/i,           // "40g+ protein", "40 protein"
    /high\s+protein\s+(\d+)\s*g?/i,           // "high protein 40g"
    /protein\s+(\d+)\s*g?\s*\+?/i,           // "protein 40g+"
    /at\s+least\s+(\d+)\s*g?\s*protein/i,    // "at least 40g protein"
    /minimum\s+(\d+)\s*g?\s*protein/i,        // "minimum 40g protein"
    /(\d+)\s*g?\s*protein\s+minimum/i,       // "40g protein minimum"
  ];
  
  for (const pattern of patterns) {
    const match = lowerQuery.match(pattern);
    if (match) {
      const value = parseInt(match[1], 10);
      if (value > 0 && value < 500) {
        return value;
      }
    }
  }
  
  // Check for "high protein" without specific number (default to 30g)
  if (lowerQuery.includes('high protein') && !lowerQuery.match(/\d+\s*g?\s*protein/i)) {
    return 30; // Default threshold for "high protein"
  }
  
  return null;
}

/**
 * Extracts maximum carbs requirement from query (e.g., "under 30g carbs", "low carb")
 */
function extractMaxCarbs(query: string): number | null {
  const lowerQuery = query.toLowerCase();
  const patterns = [
    /under\s+(\d+)\s*g?\s*carbs?/i,           // "under 30g carbs"
    /less\s+than\s+(\d+)\s*g?\s*carbs?/i,    // "less than 30g carbs"
    /below\s+(\d+)\s*g?\s*carbs?/i,          // "below 30g carbs"
    /<(\d+)\s*g?\s*carbs?/i,                 // "<30g carbs"
    /max\s+(\d+)\s*g?\s*carbs?/i,            // "max 30g carbs"
    /maximum\s+(\d+)\s*g?\s*carbs?/i,        // "maximum 30g carbs"
    /(\d+)\s*g?\s*carbs?\s*max/i,            // "30g carbs max"
  ];
  
  for (const pattern of patterns) {
    const match = lowerQuery.match(pattern);
    if (match) {
      const value = parseInt(match[1], 10);
      if (value > 0 && value < 500) {
        return value;
      }
    }
  }
  
  // Check for "low carb" or "keto" without specific number
  if ((lowerQuery.includes('low carb') || lowerQuery.includes('keto')) && !lowerQuery.match(/\d+\s*g?\s*carbs?/i)) {
    return 30; // Default threshold for "low carb"
  }
  
  return null;
}

/**
 * Extracts maximum fats requirement from query (e.g., "under 20g fat", "low fat")
 */
function extractMaxFats(query: string): number | null {
  const lowerQuery = query.toLowerCase();
  const patterns = [
    /under\s+(\d+)\s*g?\s*fats?/i,           // "under 20g fat"
    /less\s+than\s+(\d+)\s*g?\s*fats?/i,     // "less than 20g fat"
    /below\s+(\d+)\s*g?\s*fats?/i,           // "below 20g fat"
    /<(\d+)\s*g?\s*fats?/i,                  // "<20g fat"
    /max\s+(\d+)\s*g?\s*fats?/i,             // "max 20g fat"
    /maximum\s+(\d+)\s*g?\s*fats?/i,         // "maximum 20g fat"
    /(\d+)\s*g?\s*fats?\s*max/i,             // "20g fat max"
  ];
  
  for (const pattern of patterns) {
    const match = lowerQuery.match(pattern);
    if (match) {
      const value = parseInt(match[1], 10);
      if (value > 0 && value < 500) {
        return value;
      }
    }
  }
  
  // Check for "low fat" without specific number
  if (lowerQuery.includes('low fat') && !lowerQuery.match(/\d+\s*g?\s*fats?/i)) {
    return 20; // Default threshold for "low fat"
  }
  
  return null;
}

/**
 * Interface for macro constraints extracted from query
 */
interface MacroConstraints {
  minProtein?: number | null;
  maxCarbs?: number | null;
  maxFats?: number | null;
  maxCalories?: number | null;
}

/**
 * Extracts all macro constraints from a query
 */
function extractMacroConstraints(query: string): MacroConstraints {
  return {
    minProtein: extractMinProtein(query),
    maxCarbs: extractMaxCarbs(query),
    maxFats: extractMaxFats(query),
    maxCalories: extractCalorieCap(query),
  };
}

/**
 * Checks if a meal meets all macro constraints
 * Returns true if meal passes all constraints, false otherwise
 * Missing/null macro data = fails the constraint (strict filtering)
 */
function meetsMacroConstraints(item: any, constraints: MacroConstraints): boolean {
  // For macro-filtered queries, missing data means the item is not eligible
  // Only check constraints that were explicitly requested
  
  // Check minimum protein
  if (constraints.minProtein !== null && constraints.minProtein !== undefined) {
    const protein = item.protein_g ?? item.protein;
    // If protein is null/undefined, item fails the constraint
    if (protein === null || protein === undefined) {
      return false;
    }
    if (protein < constraints.minProtein) {
      return false;
    }
  }
  
  // Check maximum carbs
  if (constraints.maxCarbs !== null && constraints.maxCarbs !== undefined) {
    const carbs = item.carbs_g ?? item.carbs;
    // If carbs is null/undefined, item fails the constraint
    if (carbs === null || carbs === undefined) {
      return false;
    }
    if (carbs > constraints.maxCarbs) {
      return false;
    }
  }
  
  // Check maximum fats
  if (constraints.maxFats !== null && constraints.maxFats !== undefined) {
    const fats = item.fats_g ?? item.fat_g ?? item.fats ?? item.fat;
    // If fats is null/undefined, item fails the constraint
    if (fats === null || fats === undefined) {
      return false;
    }
    if (fats > constraints.maxFats) {
      return false;
    }
  }
  
  // Check maximum calories (already handled elsewhere, but include for completeness)
  if (constraints.maxCalories !== null && constraints.maxCalories !== undefined) {
    const calories = item.calories;
    if (calories === null || calories === undefined) {
      return false;
    }
    if (calories > constraints.maxCalories) {
      return false;
    }
  }
  
  return true;
}

/**
 * Determines if a query implies a full meal (e.g., 'Lunch', 'Dinner', 'Bowl')
 */
function impliesFullMeal(query: string): boolean {
  const mealKeywords = ['lunch', 'dinner', 'breakfast', 'meal', 'bowl', 'entree', 'entrée'];
  const lowerQuery = query.toLowerCase();
  return mealKeywords.some(keyword => lowerQuery.includes(keyword));
}

/**
 * Determines if a query specifically requests side dishes, toppings, or sauces
 */
function requestsSideItems(query: string): boolean {
  const sideKeywords = ['side', 'topping', 'sauce', 'dressing', 'condiment', 'add-on'];
  const lowerQuery = query.toLowerCase();
  return sideKeywords.some(keyword => lowerQuery.includes(keyword));
}

/**
 * Filters and prioritizes results based on category relevance
 */
function applyCategoryFiltering(results: any[], query: string): any[] {
  if (!results || results.length === 0) return results;

  const isFullMealQuery = impliesFullMeal(query);
  const isSideItemQuery = requestsSideItems(query);

  // If user specifically asks for sides/toppings/sauces, return all results
  if (isSideItemQuery) {
    return results;
  }

  // If query implies a full meal, prioritize Entree and Signature Bowl
  if (isFullMealQuery) {
    const priorityCategories = ['Entree', 'Signature Bowl'];
    const excludedCategories = ['Side', 'Topping', 'Sauce'];

    // Separate items into priority and others
    const priorityItems: any[] = [];
    const otherItems: any[] = [];

    results.forEach(item => {
      const category = (item.category || '').toLowerCase();
      if (priorityCategories.some(priority => category.includes(priority.toLowerCase()))) {
        priorityItems.push(item);
      } else if (!excludedCategories.some(excluded => category.includes(excluded.toLowerCase()))) {
        // Include other categories that aren't explicitly excluded
        otherItems.push(item);
      }
      // Exclude Side/Topping/Sauce items
    });

    // Return priority items first, then others
    return [...priorityItems, ...otherItems];
  }

  // For other queries, return all results as-is
  return results;
}

/**
 * STRICT: Determines if an item is a complete meal (entree/bowl/salad/sandwich/etc.)
 * Returns true ONLY if item is clearly a full meal, false for ingredients/add-ons/sides
 */
function isCompleteMeal(item: any): boolean {
  const itemName = (item.item_name || item.name || '').trim();
  const category = (item.category || '').toLowerCase();
  const lowerName = itemName.toLowerCase().trim();
  const words = lowerName.split(/\s+/);

  // STRICT: Exclude by category first (most reliable)
  const excludedCategories = [
    'side', 'sauce', 'topping', 'extra', 'add-on', 'addon', 'add on',
    'ingredient', 'a la carte', 'kids', 'dressing', 'condiment',
    'condiments', 'beverage', 'drink', 'beverages', 'modifier',
    'mix-in', 'mix in', 'mixin', 'option', 'choice', 'selection',
    'protein', 'base', 'grain', 'vegetable', 'vegetables'
  ];
  
  if (excludedCategories.some(excluded => category.includes(excluded))) {
    return false; // Explicitly excluded category
  }

  // STRICT: Include only meal categories
  const mealCategories = [
    'entree', 'entrée', 'main', 'bowl', 'plate', 'sandwich', 'burger',
    'salad', 'wrap', 'pasta', 'pizza', 'taco', 'sushi', 'burrito',
    'quesadilla', 'sub', 'hoagie', 'panini', 'calzone', 'pita',
    'signature bowl', 'power bowl', 'protein bowl', 'grain bowl',
    'breakfast', 'lunch', 'dinner', 'combo', 'meal', 'platter',
    'stir-fry', 'stir fry', 'curry', 'noodles', 'ramen', 'pho',
    'omelet', 'omelette', 'skillet', 'hash', 'benedict'
  ];
  
  // If category explicitly indicates a meal, include it
  if (mealCategories.some(mealCat => category.includes(mealCat))) {
    return true;
  }

  // STRICT: Exclude items with add-on/modifier patterns in name
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
    /\s+sauce$/i,         // "... sauce" (unless it's a meal name)
    /\s+dressing$/i,      // "... dressing"
  ];
  
  if (excludedPatterns.some(pattern => pattern.test(lowerName))) {
    return false;
  }

  // STRICT: Exclude common single-word ingredients (even if no category)
  const singleWordIngredients = [
    'lettuce', 'spinach', 'kale', 'arugula', 'baby spinach', 'chicken', 
    'rice', 'avocado', 'egg', 'eggs', 'steak', 'bacon', 'cheese',
    'sauce', 'dressing', 'fries', 'bread', 'tortilla', 'tomato',
    'tomatoes', 'onion', 'onions', 'pepper', 'peppers', 'beans',
    'salsa', 'guacamole', 'mayo', 'mayonnaise', 'ketchup', 'mustard',
    'ranch', 'cauliflower', 'broccoli', 'carrots', 'celery', 'cucumber',
    'mushrooms', 'zucchini', 'squash', 'corn', 'peas', 'quinoa',
    'couscous', 'barley', 'bulgur', 'farro', 'pasta', 'noodles'
  ];
  
  if (words.length === 1 && singleWordIngredients.includes(lowerName)) {
    return false;
  }

  // STRICT: Exclude two-word ingredient combinations
  const twoWordIngredients = [
    'sour cream', 'bbq sauce', 'hot sauce', 'chipotle sauce', 'ranch dressing',
    'black beans', 'pinto beans', 'white rice', 'brown rice', 'wild rice',
    'grilled chicken', 'chicken breast', 'ground beef', 'baby spinach',
    'romaine lettuce', 'iceberg lettuce', 'red onion', 'green pepper',
    'bell pepper', 'jalapeño', 'jalapeno', 'cheddar cheese', 'swiss cheese',
    'feta cheese', 'goat cheese', 'cream cheese', 'parmesan cheese',
    'olive oil', 'canola oil', 'vegetable oil', 'sesame oil'
  ];
  
  if (words.length === 2 && twoWordIngredients.includes(lowerName)) {
    return false;
  }

  // STRICT: Exclude items with ingredient keywords (unless it's clearly a meal name)
  const ingredientKeywords = [
    'topping', 'dressing', 'sauce', 'dip', 'condiment', 'add-on',
    'extra', 'side', 'modifier', 'mix-in', 'ingredient'
  ];
  
  // Only exclude if the keyword is standalone or at the end
  if (ingredientKeywords.some(keyword => {
    const keywordPattern = new RegExp(`\\b${keyword}\\b`, 'i');
    return keywordPattern.test(lowerName) && !mealCategories.some(mealCat => lowerName.includes(mealCat));
  })) {
    return false;
  }

  // STRICT: Exclude very low-calorie items that look like raw ingredients
  // (unless they're explicitly in a meal category)
  const calories = item.calories || 0;
  if (calories < 50 && words.length <= 2 && !mealCategories.some(mealCat => category.includes(mealCat))) {
    // Very low calorie + short name + not in meal category = likely ingredient
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
  
  if (mealKeywords.some(keyword => lowerName.includes(keyword))) {
    return true; // Name contains meal keyword
  }

  // STRICT: For items without clear meal indicators, require 3+ words
  // (multi-word descriptions are more likely to be full meals)
  if (words.length >= 3) {
    // Additional check: exclude if it's clearly a list of ingredients
    const ingredientListPattern = /^(with|and|plus|\+)\s+/i;
    if (ingredientListPattern.test(lowerName)) {
      return false; // Starts with "with", "and", "plus" = likely ingredient list
    }
    return true; // 3+ words and doesn't start with ingredient list pattern
  }

  // STRICT: Default to exclude if we can't confidently say it's a meal
  return false;
}

/**
 * Determines if an item is likely a single ingredient or add-on (legacy function, kept for compatibility)
 */
function isLikelyIngredient(itemName: string, category: string): boolean {
  // Use the new stricter function
  return !isCompleteMeal({ item_name: itemName, category });
}

/**
 * STRICT: Filters out single ingredients and side items, keeping only complete meals
 * NEVER relaxes the filter - if there are 0 meals, return 0 (don't pad with ingredients)
 */
function filterFullMeals(items: any[]): any[] {
  if (!items || items.length === 0) return [];

  // STRICT: Use isCompleteMeal to filter - no exceptions, no relaxation
  const filtered = items.filter(item => isCompleteMeal(item));

  // STRICT: Return whatever we have (even if 0) - never pad with non-meals
  return filtered;
}

/**
 * Deterministic ranking for meal intent queries
 * Returns top N results based on simple rules (no LLM)
 * STRICT: Only returns complete meals, never ingredients/add-ons
 */
function deterministicRankMeals(
  items: any[],
  query: string,
  calorieCap?: number | null,
  limit: number = 5
): any[] {
  if (!items || items.length === 0) return [];
  
  // STRICT: First filter to complete meals only (defensive - ensure no ingredients)
  const fullMealItems = filterFullMeals(items);
  if (fullMealItems.length === 0) return []; // Return 0 if no meals match
  if (fullMealItems.length <= limit) return fullMealItems.slice(0, limit);
  
  const lowerQuery = query.toLowerCase();
  const isFullMealQuery = impliesFullMeal(query);
  const priorityCategories = ['Entree', 'Signature Bowl'];
  
  // Score each FULL MEAL item (only score items that passed the meal filter)
  const scored = fullMealItems.map(item => {
    let score = 0;
    
    // Category priority (for meal queries)
    if (isFullMealQuery) {
      const category = (item.category || '').toLowerCase();
      if (priorityCategories.some(priority => category.includes(priority.toLowerCase()))) {
        score += 100;
      }
    }
    
    // Calorie cap matching (prefer items close to but under cap)
    if (calorieCap) {
      const calories = item.calories || 0;
      if (calories <= calorieCap) {
        // Prefer items that are close to the cap (not too low)
        const distanceFromCap = calorieCap - calories;
        if (distanceFromCap < 200) {
          score += 50; // Close to cap
        } else if (distanceFromCap < 400) {
          score += 30;
        } else {
          score += 10; // Still valid but far from cap
        }
      } else {
        // Over cap - heavily penalize
        score -= 1000;
      }
    }
    
    // Protein per calorie (for high protein queries)
    if (lowerQuery.includes('protein') || lowerQuery.includes('high protein')) {
      const calories = item.calories || 1;
      const protein = item.protein_g || 0;
      const proteinPerCal = protein / calories;
      score += proteinPerCal * 10;
    }
    
    // Low carb preference
    if (lowerQuery.includes('low carb') || lowerQuery.includes('keto')) {
      const carbs = item.carbs_g || 0;
      if (carbs < 20) {
        score += 50;
      } else if (carbs < 40) {
        score += 20;
      } else {
        score -= 30;
      }
    }
    
    // Prefer items with good match score from DB (if available)
    if (item.similarity !== undefined) {
      score += item.similarity * 20;
    }
    
    return { item, score };
  });
  
  // Sort by score (descending) and return top N
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.item);
}

/**
 * Uses OpenAI to select the best 5 matches from the provided list
 * with strict hallucination prevention
 * ONLY used for non-meal intent queries
 */
async function llmRerank(
  openai: OpenAI,
  items: any[],
  userQuery: string
): Promise<any[]> {
  if (!items || items.length === 0) return [];
  if (items.length <= 5) return items.slice(0, 5);

  // Prepare item list for LLM with all necessary fields
  const itemList = items.slice(0, 15).map((item, index) => {
    // Check fats_g (database column) first, then other variations
    const fats = item.fats_g ?? item.fat_g ?? item.fats ?? item.fat ?? 0;
    return {
      index: index + 1,
      id: item.id,
      name: item.item_name || item.name,
      restaurant: item.restaurant_name,
      category: item.category,
      description: item.description || '',
      calories: item.calories,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: fats, // Use normalized value
      dietary_tags: item.dietary_tags || item.tags || []
    };
  });

  const systemPrompt = `You are a meal recommendation assistant. Your task is to select the 5 best matching items from the provided list based on the user's query.

CRITICAL RULES:
1. You may ONLY recommend items that are present in the provided list below.
2. Do NOT invent or suggest items that are not in the list (e.g., do not suggest "Cauliflower rice" if it's not listed).
3. If the user misspells a word (e.g., "Chipolte" instead of "Chipotle"), infer their intent but ONLY map it to real items from the provided list.
4. Return your selection as a JSON object with a "selected_indices" field containing an array of indices (1-based) corresponding to the items you selected.
5. Order the indices by relevance (most relevant first).

Example response format: {"selected_indices": [2, 5, 8, 12, 15]}`;

  const userPrompt = `User Query: "${userQuery}"

Available Items:
${JSON.stringify(itemList, null, 2)}

Select the 5 best matching items by returning a JSON object with "selected_indices" containing an array of their indices (1-based). Only use indices from the list above.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3, // Lower temperature for more deterministic results
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      console.warn('LLM returned empty response, using first 5 items');
      return items.slice(0, 5);
    }

    // Parse the JSON response
    const parsed = JSON.parse(responseText);
    
    // Extract selected indices from the response
    let selectedIndices: number[] = [];
    if (parsed.selected_indices && Array.isArray(parsed.selected_indices)) {
      selectedIndices = parsed.selected_indices;
    } else if (parsed.selected && Array.isArray(parsed.selected)) {
      selectedIndices = parsed.selected;
    } else if (parsed.indices && Array.isArray(parsed.indices)) {
      selectedIndices = parsed.indices;
    } else if (Array.isArray(parsed)) {
      selectedIndices = parsed;
    }

    // Validate indices and map to items (convert from 1-based to 0-based)
    const validIndices = selectedIndices
      .filter((idx: any) => typeof idx === 'number' && idx >= 1 && idx <= itemList.length)
      .map((idx: number) => idx - 1);

    if (validIndices.length === 0) {
      console.warn('LLM returned invalid indices, using first 5 items');
      return items.slice(0, 5);
    }

    // Map back to original items (up to 5)
    const selectedItems = validIndices.slice(0, 5).map(idx => items[idx]).filter(Boolean);
    
    return selectedItems.length > 0 ? selectedItems : items.slice(0, 5);
  } catch (error: any) {
    console.error('LLM reranking error:', error.message);
    // Fallback to first 5 items if LLM fails
    return items.slice(0, 5);
  }
}

/**
 * Safely convert any value to a number (default 0 for null/undefined/NaN)
 */
function toNum(value: any): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Ensures all required fields (dietary_tags, description) are present in results
 * Also generates real food images for meals
 */
function enrichResults(results: any[]): any[] {
  return results.map(item => {
    const itemName = item.item_name || item.name || 'Unknown Item';
    const restaurantName = item.restaurant_name || 'Unknown Restaurant';
    
    // Generate real food image URL based on meal name and restaurant
    const imageUrl = getMealImageUrl(
      itemName,
      restaurantName,
      item.image_url
    );
    
    // Handle fats - check fats_g (database column) first, then other variations
    const fats = item.fats_g ?? item.fat_g ?? item.fats ?? item.fat ?? 
                 (item.nutrition_info?.fats_g) ?? 
                 (item.nutrition_info?.fat_g) ?? 
                 (item.nutrition_info?.fats) ?? 
                 (item.nutrition_info?.fat) ?? 0;

    // Normalize core nutrition fields using safe numeric conversion
    const calories = toNum(item.calories);
    const protein = toNum(item.protein_g ?? item.protein);
    const carbs = toNum(item.carbs_g ?? item.carbs);
    const fatsNum = toNum(fats);

    return {
      ...item,
      description: item.description || '',
      dietary_tags: item.dietary_tags || item.tags || [],
      // Ensure all standard fields are present
      item_name: itemName,
      restaurant_name: restaurantName,
      category: item.category || '',
      // Both raw DB-style *_g fields and flattened Meal fields
      calories,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fatsNum,
      fats_g: fatsNum, // Also include fats_g for consistency
      protein,
      carbs,
      fats: fatsNum,
      image_url: imageUrl, // Use generated real food image
      price: item.price || null
    };
  });
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in miles
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Filter results by radius if coordinates are available
 */
function filterByRadius(
  results: any[],
  radiusMiles: number | undefined,
  userLat?: number,
  userLon?: number
): { filtered: any[]; excludedCount: number; hasCoordinates: number } {
  if (!radiusMiles || !userLat || !userLon) {
    // No radius filtering - return all results
    return { filtered: results, excludedCount: 0, hasCoordinates: 0 };
  }

  let excludedCount = 0;
  let hasCoordinates = 0;
  const filtered = results.filter(item => {
    // Check if item has restaurant coordinates
    const itemLat = item.latitude || item.restaurant_latitude;
    const itemLon = item.longitude || item.restaurant_longitude;
    
    if (!itemLat || !itemLon) {
      // No coordinates - exclude from radius-filtered results
      excludedCount++;
      return false;
    }
    
    hasCoordinates++;
    const distance = calculateDistance(userLat, userLon, itemLat, itemLon);
    item.distance = distance; // Add distance to item for frontend use
    return distance <= radiusMiles;
  });

  return { filtered, excludedCount, hasCoordinates };
}

export async function POST(request: Request) {
  const startTime = Date.now();
  const timings: Record<string, number> = {};
  
  try {
    const { query, radius_miles, user_location, user_location_lat, user_location_lng, limit: requestLimit = 10, offset: requestOffset = 0, searchKey: requestSearchKey } = await request.json();
    if (!query && !requestSearchKey) return NextResponse.json({ error: 'Query or searchKey required' }, { status: 400 });
    
    // Extract user location if provided (support both old format { latitude, longitude } and new format user_location_lat/lng)
    const userLat = user_location_lat ?? user_location?.latitude;
    const userLon = user_location_lng ?? user_location?.longitude;
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!; // For Search
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;     // For Caching (Write access)
    const openaiKey = process.env.OPENAI_API_KEY!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const adminDb = createClient(supabaseUrl, serviceKey); // Admin client to write to cache
    const openai = new OpenAI({ apiKey: openaiKey });

    // Detect meal intent
    const isMealIntent = query ? isMealIntentQuery(query) : true; // If using searchKey, assume meal intent
    const calorieCap = query ? extractCalorieCap(query) : null;
    // Extract all macro constraints from query
    const macroConstraints = query ? extractMacroConstraints(query) : { maxCalories: null };
    const radiusBucket = getRadiusBucket(radius_miles);
    
    // Set pagination parameters - NO forced limit, return however many match
    const limit = requestLimit;
    const offset = requestOffset;
    const searchKey = requestSearchKey;
    
    // Generate or use provided searchKey
    const actualQuery = query || '';
    const generatedSearchKey = generateSearchKey(actualQuery, calorieCap, radiusBucket, isMealIntent);
    const finalSearchKey = searchKey || generatedSearchKey;
    
    // Build cache key with radius bucket
    const cacheKey = `${actualQuery.toLowerCase().trim()}_radius_${radiusBucket}`;

    // 1. CHECK CACHE FIRST
    const cacheStart = Date.now();
    const { data: cached } = await supabase
      .from('search_cache')
      .select('results_json')
      .eq('query_text', cacheKey)
      .single();
    timings.cache_lookup = Date.now() - cacheStart;

    if (cached?.results_json) {
      console.log(`⚡ Cache Hit for: "${query}" (radius: ${radiusBucket})`);
      // Cached results are pre-radius-filtered, but we need to apply radius filtering
      // for the current user location if radius is specified
      let cachedResults = cached.results_json || [];
      
      if (radius_miles && userLat && userLon) {
        const radiusStart = Date.now();
        const radiusFilter = filterByRadius(cachedResults, radius_miles, userLat, userLon);
        cachedResults = radiusFilter.filtered;
        timings.radius_filtering = Date.now() - radiusStart;
      }
      
      // STRICT: Apply full meal filter to cached results (defensive - ensure no ingredients slipped through)
      if (isMealIntent) {
        const beforeMealFilter = cachedResults.length;
        cachedResults = filterFullMeals(cachedResults);
        const afterMealFilter = cachedResults.length;
        if (beforeMealFilter > afterMealFilter) {
          console.log(`🍽️  STRICT full meal filter (cached): ${beforeMealFilter} → ${afterMealFilter} (removed ${beforeMealFilter - afterMealFilter} ingredients/add-ons)`);
        }
      }
      
      // Re-rank if needed (deterministic for meal intent, or use cached ranking)
      const rerankStart = Date.now();
      let allRankedResults: any[];
      if (isMealIntent && cachedResults.length > limit) {
        // Re-rank cached results deterministically
        allRankedResults = deterministicRankMeals(cachedResults, actualQuery, calorieCap, cachedResults.length);
      } else {
        allRankedResults = cachedResults;
      }
      timings.reranking = Date.now() - rerankStart;
      
      // Apply STRICT macro constraints filter (defensive - removes items that don't meet requirements)
      if (isMealIntent) {
        const beforeMacroFilter = allRankedResults.length;
        allRankedResults = allRankedResults.filter(item => meetsMacroConstraints(item, macroConstraints));
        const afterMacroFilter = allRankedResults.length;
        if (beforeMacroFilter > afterMacroFilter) {
          const removed = beforeMacroFilter - afterMacroFilter;
          const constraintsStr = [
            macroConstraints.minProtein ? `protein >= ${macroConstraints.minProtein}g` : null,
            macroConstraints.maxCarbs ? `carbs <= ${macroConstraints.maxCarbs}g` : null,
            macroConstraints.maxFats ? `fats <= ${macroConstraints.maxFats}g` : null,
            macroConstraints.maxCalories ? `calories <= ${macroConstraints.maxCalories}` : null,
          ].filter(Boolean).join(', ');
          console.log(`🔥 STRICT macro filter (${constraintsStr}): ${beforeMacroFilter} → ${afterMacroFilter} (removed ${removed} items that failed constraints)`);
        }
      }
      
      // Apply pagination (no forced limit - return however many match)
      const effectiveLimit = limit;
      const paginatedResults = allRankedResults.slice(offset, offset + effectiveLimit);
      const hasMore = allRankedResults.length > offset + effectiveLimit;
      const nextOffset = hasMore ? offset + paginatedResults.length : offset + paginatedResults.length;
      
      const enrichStart = Date.now();
      const enriched = enrichResults(paginatedResults);
      timings.enrichment = Date.now() - enrichStart;
      
      // Log calorie enforcement for cached results
      if (isMealIntent && calorieCap) {
        const overCap = enriched.filter(item => (item.calories || 0) > calorieCap).length;
        if (overCap > 0) {
          console.error(`❌ ERROR: ${overCap} meals over calorie cap ${calorieCap} returned from cache!`);
        } else {
          console.log(`✅ Calorie cap ${calorieCap} enforced: all ${enriched.length} meals within limit (cached)`);
        }
      }
      
      // Format response - always return { meals, hasMore, nextOffset, searchKey }
      const serializeStart = Date.now();
      const responseData = {
        meals: enriched,
        hasMore,
        nextOffset,
        searchKey: finalSearchKey
      };
      const response = NextResponse.json(responseData);
      timings.response_serialization = Date.now() - serializeStart;
      timings.total_duration = Date.now() - startTime;
      
      console.log(`📊 Results (cached): filtered=${allRankedResults.length}, returned=${enriched.length}`);
      console.log(`⏱️  Timings (ms):`, timings);
      return response;
    }

    // 2. CHECK EMBEDDING CACHE (only if we have a query, not for searchKey-only pagination)
    let embedding: number[] | undefined;
    if (actualQuery) {
      const embeddingCacheStart = Date.now();
      const { data: embeddingCache } = await supabase
        .from('search_cache')
        .select('embedding_json')
      .eq('query_text', actualQuery.toLowerCase().trim())
      .single();
      
      if (embeddingCache?.embedding_json) {
        embedding = embeddingCache.embedding_json;
        timings.embedding_generation = Date.now() - embeddingCacheStart;
        console.log(`🧠 Using cached embedding for: "${actualQuery}"`);
      } else {
        // 3. GENERATE EMBEDDING
        console.log(`🧠 Generating Embedding for: "${actualQuery}"`);
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: actualQuery,
        });
        embedding = embeddingResponse.data[0].embedding;
        timings.embedding_generation = Date.now() - embeddingCacheStart;
        
        // Cache the embedding for future use
        try {
          await adminDb.from('search_cache').upsert({
            query_text: actualQuery.toLowerCase().trim(),
            embedding_json: embedding,
          }, { onConflict: 'query_text' });
        } catch (e) {
          // Ignore embedding cache errors (table might not have embedding_json column)
          console.warn('Could not cache embedding:', e);
        }
      }
    }

    // 4. SEARCH DATABASE (only if we have an embedding, skip for searchKey-only pagination)
    let rawResults: any[] = [];
    if (embedding) {
      const rpcStart = Date.now();
      const matchCount = isMealIntent ? 50 : 30; // Fetch more for pagination support
      const { data, error } = await supabase.rpc('match_menu_items', {
        query_embedding: embedding,
        match_threshold: 0.0, // Keep at 0.0 to ensure results
        match_count: matchCount,
      });
      timings.rpc_match_menu_items = Date.now() - rpcStart;
      
      if (error) throw error;
      rawResults = data || [];
    } else {
      // For searchKey-only pagination, we'll use cached results
      // This will be handled in the cache lookup above
      timings.rpc_match_menu_items = 0;
    }

    if (!rawResults || rawResults.length === 0) {
      timings.total_duration = Date.now() - startTime;
      console.log(`⏱️  Timings (ms):`, timings);
      console.log(`📊 Results: raw=0, filtered=0, returned=0`);
      // Return empty response with consistent format
      return NextResponse.json({
        meals: [],
        hasMore: false,
        nextOffset: 0,
        searchKey: finalSearchKey
      });
    }
    
    console.log(`📊 Raw results from DB: ${rawResults.length}`);

    // 5. APPLY CATEGORY FILTERING
    const categoryStart = Date.now();
    let filteredResults = applyCategoryFiltering(rawResults, actualQuery);
    timings.category_filtering = Date.now() - categoryStart;

    // 5b. APPLY STRICT FULL MEAL FILTERING (for meal intent queries - exclude ingredients)
    // CRITICAL: This filter is NEVER relaxed - if 0 meals match, return 0 (don't pad with ingredients)
    if (isMealIntent) {
      const fullMealFilterStart = Date.now();
      const beforeFilterCount = filteredResults.length;
      filteredResults = filterFullMeals(filteredResults);
      const afterFilterCount = filteredResults.length;
      timings.full_meal_filtering = Date.now() - fullMealFilterStart;
      console.log(`🍽️  STRICT full meal filter: ${beforeFilterCount} → ${afterFilterCount} (removed ${beforeFilterCount - afterFilterCount} ingredients/add-ons)`);
      
      // STRICT: Never relax the filter - if we have 0 meals, that's the correct result
      // Do NOT pad with ingredients even if it means returning fewer results
      if (afterFilterCount === 0 && beforeFilterCount > 0) {
        console.log(`⚠️  No complete meals found after filtering (${beforeFilterCount} items were ingredients/add-ons)`);
      }
    }

    // 6. RERANKING/FILTERING (before radius filtering, so we cache the best results)
    const rerankStart = Date.now();
    let rankedResults: any[];
    
    if (isMealIntent) {
      // Use deterministic ranking for meal queries (FAST - no LLM)
      // Fetch enough results for pagination (at least offset + limit + 1 to check hasMore)
      const fetchCount = Math.max(50, offset + limit + 1);
      console.log(`⚡ Using deterministic ranking for meal intent query`);
      rankedResults = deterministicRankMeals(filteredResults, actualQuery, calorieCap, fetchCount);
    } else {
      // Use LLM reranking only for ambiguous/non-meal queries
      console.log(`🤖 LLM reranking for ambiguous query...`);
      rankedResults = await llmRerank(openai, filteredResults, actualQuery);
      // Cache the LLM-ranked top 5 (they're already the best matches)
    }
    timings.reranking = Date.now() - rerankStart;

    // 7. APPLY STRICT MACRO CONSTRAINTS FILTER (defensive - removes items that don't meet requirements)
    if (isMealIntent) {
      const beforeMacroFilter = rankedResults.length;
      rankedResults = rankedResults.filter(item => meetsMacroConstraints(item, macroConstraints));
      const afterMacroFilter = rankedResults.length;
      if (beforeMacroFilter > afterMacroFilter) {
        const removed = beforeMacroFilter - afterMacroFilter;
        const constraintsStr = [
          macroConstraints.minProtein ? `protein >= ${macroConstraints.minProtein}g` : null,
          macroConstraints.maxCarbs ? `carbs <= ${macroConstraints.maxCarbs}g` : null,
          macroConstraints.maxFats ? `fats <= ${macroConstraints.maxFats}g` : null,
          macroConstraints.maxCalories ? `calories <= ${macroConstraints.maxCalories}` : null,
        ].filter(Boolean).join(', ');
        console.log(`🔥 STRICT macro filter (${constraintsStr}): ${beforeMacroFilter} → ${afterMacroFilter} (removed ${removed} items that failed constraints)`);
      }
    }

    // 8. APPLY RADIUS FILTERING (if radius and user location provided)
    // Do this after ranking so we cache the ranked results, then filter by location
    let allFilteredResults = rankedResults;
    if (radius_miles && userLat && userLon) {
      const radiusStart = Date.now();
      const radiusFilter = filterByRadius(rankedResults, radius_miles, userLat, userLon);
      allFilteredResults = radiusFilter.filtered;
      timings.radius_filtering = Date.now() - radiusStart;
      console.log(`📍 Radius filter: ${radiusFilter.hasCoordinates} restaurants with coordinates, ${radiusFilter.excludedCount} excluded, ${allFilteredResults.length} within ${radius_miles} miles`);
    }

    // 9. APPLY PAGINATION (no forced limit - return however many match)
    const effectiveLimit = limit;
    const paginatedResults = allFilteredResults.slice(offset, offset + effectiveLimit);
    const hasMore = allFilteredResults.length > offset + effectiveLimit;
    const nextOffset = hasMore ? offset + paginatedResults.length : offset + paginatedResults.length;

    // 10. ENRICH RESULTS
    const enrichStart = Date.now();
    const enrichedResults = enrichResults(paginatedResults);
    timings.enrichment = Date.now() - enrichStart;

    // 11. SAVE TO CACHE (cache ranked results BEFORE radius filtering)
    // This allows different users to get location-filtered results from the same ranked set
    const cacheInsertStart = Date.now();
    if (rankedResults.length > 0 && offset === 0) {
      // Only cache on first page (offset 0)
      try {
        await adminDb.from('search_cache').upsert({
          query_text: cacheKey,
          results_json: rankedResults, // Cache ranked results (not radius-filtered)
        }, { onConflict: 'query_text' });
      } catch (e) {
        console.warn('Could not cache results:', e);
      }
    }
    timings.cache_insert = Date.now() - cacheInsertStart;

    // 12. SERIALIZE RESPONSE - always return { meals, hasMore, nextOffset, searchKey }
    const serializeStart = Date.now();
    const responseData = {
      meals: enrichedResults,
      hasMore,
      nextOffset,
      searchKey: finalSearchKey
    };
    const response = NextResponse.json(responseData);
    timings.response_serialization = Date.now() - serializeStart;
    timings.total_duration = Date.now() - startTime;
    
    console.log(`📊 Results: raw=${rawResults.length}, filtered=${allFilteredResults.length}, returned=${enrichedResults.length}`);
    if (isMealIntent && calorieCap) {
      const overCap = enrichedResults.filter(item => (item.calories || 0) > calorieCap).length;
      if (overCap > 0) {
        console.error(`❌ ERROR: ${overCap} meals over calorie cap ${calorieCap} returned!`);
      } else {
        console.log(`✅ Calorie cap ${calorieCap} enforced: all ${enrichedResults.length} meals within limit`);
      }
    }
    console.log(`⏱️  Timings (ms):`, timings);
    console.log(`✅ Search complete: ${enrichedResults.length} meals returned (offset: ${offset}, hasMore: ${hasMore})${isMealIntent ? ' (meal intent, deterministic)' : ' (LLM reranked)'}${radius_miles ? ` (radius: ${radius_miles} miles)` : ''}`);

    return response;

  } catch (error: any) {
    timings.total_duration = Date.now() - startTime;
    console.error('API Error:', error.message);
    console.log(`⏱️  Timings (ms):`, timings);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}