import { streamText, generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { calculateDistanceMiles, Coordinates } from '@/lib/distance-utils';

export const dynamic = 'force-dynamic';

// TypeScript interfaces
interface MacroMap {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

interface MenuItem {
  id: string;
  restaurant_name: string;
  name: string;
  category: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  image_url: string | null;
  description?: string;
  dietary_tags?: string[];
  ingredients?: string[];
  price?: number | null;
  latitude?: number;
  longitude?: number;
}

interface QueryIntent {
  restaurant?: string | null;
  calorieLimit?: number | null;
  calorieMin?: number | null;
  proteinMin?: number | null;
  carbsMax?: number | null;
  fatMax?: number | null;
  dietType?: string[];
  allergens?: string[];
  cuisine?: string[];
  goal?: string;
  location?: Coordinates | null;
  isVague?: boolean; // "What should I eat?"
  isSwapRequest?: boolean;
  isFollowUp?: boolean;
  previousFilters?: any;
}

interface UserContext {
  profile: {
    goal?: string;
    dietType?: string;
    dietaryOptions?: string[];
    allergens?: string[];
    calorieTarget?: number;
    proteinTarget?: number;
    carbsTarget?: number;
    fatsTarget?: number;
    preferredCuisines?: string[];
  };
  mealHistory?: any[];
  favoriteMeals?: string[];
  location?: Coordinates | null;
}

/**
 * Parse user query to extract intent
 */
async function parseQueryIntent(
  userQuery: string,
  conversationHistory: any[],
  userContext: UserContext
): Promise<QueryIntent> {
  const lowerQuery = userQuery.toLowerCase();
  const intent: QueryIntent = {};

  // Check for restaurant context
  const restaurantPrompt = `Extract the restaurant name from this query. Return ONLY the restaurant name in standard US spelling, or "NULL" if no restaurant is mentioned.

Examples:
"High protein at Chipolte" -> "Chipotle"
"Mac donalds burger" -> "McDonald's"
"What should I eat?" -> "NULL"
"Healthy lunch nearby" -> "NULL"

Query: "${userQuery}"`;

  try {
    const restaurantResult = await generateText({
      model: openai('gpt-4o-mini'),
      system: restaurantPrompt,
      prompt: userQuery,
      temperature: 0,
      maxTokens: 50,
    });
    const extractedRestaurant = restaurantResult.text.trim();
    if (extractedRestaurant.toUpperCase() !== 'NULL' && extractedRestaurant) {
      intent.restaurant = extractedRestaurant;
    }
  } catch (error) {
    console.error('Restaurant extraction error:', error);
  }

  // Extract calorie constraints
  const calorieMatch = userQuery.match(/(?:under|less than|or less|max|maximum|up to|below)\s*(\d+)\s*(?:calories?|cal)/i);
  if (calorieMatch) {
    intent.calorieLimit = parseInt(calorieMatch[1], 10);
  }
  const calorieMinMatch = userQuery.match(/(?:over|more than|at least|minimum|min)\s*(\d+)\s*(?:calories?|cal)/i);
  if (calorieMinMatch) {
    intent.calorieMin = parseInt(calorieMinMatch[1], 10);
  }

  // Extract macro constraints
  const proteinMatch = userQuery.match(/(?:high|more|at least|minimum|min)\s*(?:protein|pro)\s*(?:of|:)?\s*(\d+)?/i);
  if (proteinMatch) {
    intent.proteinMin = proteinMatch[1] ? parseInt(proteinMatch[1], 10) : 30; // Default to 30g if not specified
  }
  const lowProteinMatch = userQuery.match(/(?:low|less|under|below)\s*(?:protein|pro)/i);
  if (lowProteinMatch) {
    intent.proteinMin = 0; // Remove protein requirement
  }

  const carbsMatch = userQuery.match(/(?:low|less|under|below|max|maximum)\s*(?:carb|carbs|carbohydrate)/i);
  if (carbsMatch) {
    const carbsValueMatch = userQuery.match(/(?:low|less|under|below|max|maximum)\s*(?:carb|carbs|carbohydrate).*?(\d+)/i);
    intent.carbsMax = carbsValueMatch ? parseInt(carbsValueMatch[1], 10) : 50; // Default to 50g
  }
  const highCarbsMatch = userQuery.match(/(?:high|more)\s*(?:carb|carbs|carbohydrate)/i);
  if (highCarbsMatch) {
    intent.carbsMax = null; // Remove carbs limit
  }

  const fatMatch = userQuery.match(/(?:low|less|under|below|max|maximum)\s*(?:fat|fats)/i);
  if (fatMatch) {
    const fatValueMatch = userQuery.match(/(?:low|less|under|below|max|maximum)\s*(?:fat|fats).*?(\d+)/i);
    intent.fatMax = fatValueMatch ? parseInt(fatValueMatch[1], 10) : 30; // Default to 30g
  }

  // Extract diet type
  const dietKeywords: Record<string, string[]> = {
    vegan: ['vegan', 'plant-based'],
    vegetarian: ['vegetarian', 'veg'],
    keto: ['keto', 'ketogenic'],
    'low carb': ['low carb', 'low-carb', 'low carbohydrate'],
    pescatarian: ['pescatarian', 'pesco'],
  };
  for (const [diet, keywords] of Object.entries(dietKeywords)) {
    if (keywords.some(kw => lowerQuery.includes(kw))) {
      intent.dietType = intent.dietType || [];
      intent.dietType.push(diet);
    }
  }

  // Extract allergens (common ones)
  const allergenKeywords = ['peanut', 'tree nut', 'dairy', 'gluten', 'soy', 'egg', 'shellfish', 'fish', 'sesame'];
  intent.allergens = allergenKeywords.filter(allergen => lowerQuery.includes(allergen));

  // Check for vague queries
  const vaguePatterns = [
    /what should i eat/i,
    /what can i eat/i,
    /recommend.*meal/i,
    /suggest.*food/i,
    /what.*good.*eat/i,
  ];
  intent.isVague = vaguePatterns.some(pattern => pattern.test(userQuery));

  // Check for swap requests
  intent.isSwapRequest = /swap|replace|substitute|instead|alternative/i.test(userQuery);

  // Check for follow-up adjustments
  const followUpPatterns = [
    /less carbs/i,
    /more protein/i,
    /lower calorie/i,
    /higher calorie/i,
    /less fat/i,
    /more fat/i,
    /different/i,
    /another/i,
    /other/i,
  ];
  intent.isFollowUp = followUpPatterns.some(pattern => pattern.test(userQuery));

  // Check for location context
  if (/nearby|near me|close|local|around here/i.test(userQuery)) {
    intent.location = userContext.location || null;
  }

  return intent;
}

/**
 * Fetch menu items from database with filters
 */
async function fetchMenuItems(
  supabase: any,
  intent: QueryIntent,
  userContext: UserContext
): Promise<MenuItem[]> {
  let query = supabase
    .from('menu_items')
    .select('id, restaurant_name, name, category, calories, protein_g, carbs_g, fat_g, image_url, description, dietary_tags, price, ingredients');

  // Filter by restaurant if specified
  if (intent.restaurant) {
    query = query.ilike('restaurant_name', `%${intent.restaurant}%`);
  }

  // Apply calorie filters
  if (intent.calorieLimit) {
    query = query.lte('calories', intent.calorieLimit);
  }
  if (intent.calorieMin) {
    query = query.gte('calories', intent.calorieMin);
  }

  // Apply macro filters
  if (intent.proteinMin) {
    query = query.gte('protein_g', intent.proteinMin);
  }
  if (intent.carbsMax) {
    query = query.lte('carbs_g', intent.carbsMax);
  }
  if (intent.fatMax) {
    query = query.lte('fat_g', intent.fatMax);
  }

  // Apply diet type filters from user profile
  const dietType = intent.dietType?.[0] || userContext.profile.dietType;
  if (dietType) {
    const dietMap: Record<string, string[]> = {
      'Vegan': ['vegan', 'plant-based'],
      'Vegetarian': ['vegetarian', 'vegan'],
      'Keto': ['keto', 'low-carb'],
      'Low Carb': ['low-carb', 'keto'],
      'Pescatarian': ['pescatarian', 'seafood'],
    };
    const tags = dietMap[dietType] || [];
    if (tags.length > 0) {
      query = query.or(tags.map(tag => `dietary_tags.cs.{${tag}}`).join(','));
    }
  }

  // Apply allergen exclusions
  const allergens = intent.allergens || userContext.profile.allergens || [];
  if (allergens.length > 0) {
    // Exclude items that contain allergens
    for (const allergen of allergens) {
      query = query.not('dietary_tags', 'cs', `{${allergen}}`);
    }
  }

  const { data, error } = await query.limit(100);

  if (error) {
    console.error('Database query error:', error);
    return [];
  }

  return (data || []) as MenuItem[];
}

/**
 * Filter and rank meals based on intent and user context
 */
function filterAndRankMeals(
  items: MenuItem[],
  intent: QueryIntent,
  userContext: UserContext,
  userLocation?: Coordinates | null
): MenuItem[] {
  let filtered = [...items];

  // Apply strict filters first
  if (intent.calorieLimit) {
    filtered = filtered.filter(item => item.calories <= intent.calorieLimit!);
  }
  if (intent.calorieMin) {
    filtered = filtered.filter(item => item.calories >= intent.calorieMin!);
  }
  if (intent.proteinMin) {
    filtered = filtered.filter(item => (item.protein_g || 0) >= intent.proteinMin!);
  }
  if (intent.carbsMax) {
    filtered = filtered.filter(item => (item.carbs_g || 0) <= intent.carbsMax!);
  }
  if (intent.fatMax) {
    filtered = filtered.filter(item => (item.fat_g || 0) <= intent.fatMax!);
  }

  // Calculate distance if location is available
  if (userLocation) {
    filtered = filtered.map(item => {
      if (item.latitude && item.longitude) {
        const distance = calculateDistanceMiles(userLocation, {
          latitude: item.latitude,
          longitude: item.longitude,
        });
        return { ...item, distance };
      }
      return item;
    });
  }

  // Rank by relevance
  filtered.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    // Prioritize user goals
    if (userContext.profile.goal === 'build-muscle') {
      scoreA += (a.protein_g || 0) * 2;
      scoreB += (b.protein_g || 0) * 2;
    } else if (userContext.profile.goal === 'lose-fat') {
      scoreA += (a.calories || 0) < (userContext.profile.calorieTarget || 2000) ? 100 : 0;
      scoreB += (b.calories || 0) < (userContext.profile.calorieTarget || 2000) ? 100 : 0;
    }

    // Prioritize nearby restaurants if location is available
    if (userLocation && 'distance' in a && 'distance' in b) {
      const distA = (a as any).distance || Infinity;
      const distB = (b as any).distance || Infinity;
      if (distA < distB) scoreA += 50;
      if (distB < distA) scoreB += 50;
    }

    // Prioritize favorite restaurants (if we had that data)
    // Prioritize meals from meal history (if we had that data)

    return scoreB - scoreA;
  });

  return filtered;
}

/**
 * Generate swap suggestions from available menu data
 */
async function generateSwapSuggestions(
  originalMeal: MenuItem,
  restaurantName: string,
  supabase: any,
  userContext: UserContext
): Promise<{ swaps: MenuItem[]; macroImpacts: any[] }> {
  // Fetch all items from the same restaurant
  const { data: restaurantItems } = await supabase
    .from('menu_items')
    .select('id, restaurant_name, name, category, calories, protein_g, carbs_g, fat_g, image_url, description, dietary_tags, price')
    .ilike('restaurant_name', `%${restaurantName}%`)
    .limit(50);

  if (!restaurantItems || restaurantItems.length === 0) {
    return { swaps: [], macroImpacts: [] };
  }

  // Filter to similar category items
  const similarItems = restaurantItems.filter((item: MenuItem) => 
    item.id !== originalMeal.id &&
    item.category === originalMeal.category
  );

  // Calculate macro differences
  const swaps = similarItems.slice(0, 5).map((item: MenuItem) => {
    const macroImpact = {
      calories: (item.calories || 0) - (originalMeal.calories || 0),
      protein: (item.protein_g || 0) - (originalMeal.protein_g || 0),
      carbs: (item.carbs_g || 0) - (originalMeal.carbs_g || 0),
      fat: (item.fat_g || 0) - (originalMeal.fat_g || 0),
    };
    return { ...item, macroImpact };
  });

  return {
    swaps: swaps.map(s => ({ ...s, macroImpact: undefined })),
    macroImpacts: swaps.map(s => s.macroImpact),
  };
}

/**
 * Build system prompt for OpenAI with menu context
 */
function buildSystemPrompt(
  menuItems: MenuItem[],
  intent: QueryIntent,
  userContext: UserContext,
  conversationHistory: any[]
): string {
  const itemsJson = JSON.stringify(menuItems.slice(0, 50), null, 2); // Limit to 50 items for context

  let prompt = `You are MacroScout, an AI meal recommendation assistant for a nutrition app. You have access to a specific list of menu items from the database.

**CRITICAL RULES - YOU MUST FOLLOW THESE STRICTLY:**

1. **NO HALLUCINATION:** You may ONLY recommend items that are explicitly listed in the menu data below. NEVER invent, suggest, or mention items that are not in the provided JSON. If a meal, restaurant, or ingredient is not in the database, you MUST tell the user it's not available and use general nutrition advice as a fallback.

2. **Menu Data is Source of Truth:** All calories, macros, ingredients, allergens, and prices must come from the provided menu data. If a field is NULL or missing, explicitly state that information is not available.

3. **User Context:**
   - Goal: ${userContext.profile.goal || 'Not specified'}
   - Diet Type: ${userContext.profile.dietType || 'Not specified'}
   - Allergens to avoid: ${userContext.profile.allergens?.join(', ') || 'None'}
   - Calorie Target: ${userContext.profile.calorieTarget || 'Not specified'}
   - Protein Target: ${userContext.profile.proteinTarget || 'Not specified'}

4. **Query Intent:**
   ${intent.restaurant ? `- Restaurant: ${intent.restaurant}` : '- Restaurant: Any'}
   ${intent.calorieLimit ? `- Max Calories: ${intent.calorieLimit}` : ''}
   ${intent.proteinMin ? `- Min Protein: ${intent.proteinMin}g` : ''}
   ${intent.carbsMax ? `- Max Carbs: ${intent.carbsMax}g` : ''}
   ${intent.dietType ? `- Diet Type: ${intent.dietType.join(', ')}` : ''}

5. **Response Guidelines:**
   - Keep responses SHORT and CLEAR unless user asks for detail
   - For vague queries like "What should I eat?", provide 3-5 best-fit recommendations with brief reasoning
   - Always explain WHY you're recommending each meal (e.g., "High protein for muscle building", "Low calorie for weight loss")
   - If no meals match strict filters, loosen constraints and explain the closest matches
   - Always produce an answer, even if menu data is incomplete

6. **Swap Suggestions:** If user asks for swaps, ONLY suggest items from the same restaurant that are in the menu data. Calculate and show macro impact (e.g., "+50 cal, -5g carbs").

7. **Follow-up Requests:** If user asks to adjust (e.g., "less carbs", "more protein"), re-filter the menu items and provide new recommendations.

8. **General Health Questions:** If the user asks general nutrition/health questions not related to menu items, provide helpful advice but note that you specialize in restaurant menu recommendations.

**Menu Items (JSON):**
${menuItems.length > 0 ? itemsJson : 'No menu items found matching the query.'}

Remember: You can ONLY recommend items from the JSON above. Never invent or suggest items that don't exist in this data.`;

  return prompt;
}

/**
 * Main reasoning engine handler
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, userProfile, mealHistory, favoriteMeals, location } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response('Messages array required', { status: 400 });
    }

    const latestMessage = messages[messages.length - 1];
    const userMessage = latestMessage?.content || '';

    if (!userMessage) {
      return new Response('User message content required', { status: 400 });
    }

    // Initialize Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build user context
    const userContext: UserContext = {
      profile: userProfile || {},
      mealHistory: mealHistory || [],
      favoriteMeals: favoriteMeals || [],
      location: location ? { latitude: location.latitude, longitude: location.longitude } : null,
    };

    // Parse query intent
    const intent = await parseQueryIntent(userMessage, messages, userContext);

    // Fetch menu items from database
    let menuItems: MenuItem[] = [];
    let shouldUseMenuData = false;

    if (intent.restaurant || !intent.isVague || intent.calorieLimit || intent.proteinMin) {
      // We have specific criteria, try to fetch menu data
      menuItems = await fetchMenuItems(supabase, intent, userContext);
      shouldUseMenuData = menuItems.length > 0;
    }

    // Filter and rank meals
    if (shouldUseMenuData) {
      menuItems = filterAndRankMeals(menuItems, intent, userContext, userContext.location);
    }

    // Build system prompt
    let systemPrompt: string;
    if (shouldUseMenuData && menuItems.length > 0) {
      systemPrompt = buildSystemPrompt(menuItems, intent, userContext, messages);
    } else {
      // Fallback to general OpenAI reasoning
      if (intent.restaurant) {
        systemPrompt = `You are MacroScout, a nutrition assistant. The user asked about "${intent.restaurant}", but this restaurant is not in the database yet. Apologize politely and suggest they try searching for a restaurant that is available, or ask a general nutrition question.`;
      } else {
        systemPrompt = `You are MacroScout, a nutrition assistant for a restaurant menu app. The user's query doesn't match specific menu items in the database. Provide helpful general nutrition advice, but note that you specialize in restaurant menu recommendations. If they're asking about a specific restaurant, suggest they mention the restaurant name.`;
      }
    }

    // Generate response
    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages: messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: 0.7,
      maxTokens: 1000,
    });

    return result.toDataStreamResponse();

  } catch (error: any) {
    console.error('Reasoning engine error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
