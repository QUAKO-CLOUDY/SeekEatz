import { streamText, generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// ========== STRICT TYPE DEFINITIONS ==========

interface Meal {
  id: string;
  name: string;
  restaurant: string;
  restaurant_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  image: string;
  dietary_tags?: string[];
  latitude?: number;
  longitude?: number;
}

interface DatabaseRow {
  id: string;
  item_name: string;
  image_url: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fats_g: number | null;
  dietary_tags: string[] | null;
  restaurants: {
    name: string;
    latitude: number | null;
    longitude: number | null;
  } | null;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface RequestBody {
  messages: ChatMessage[];
  userId?: string;
  userContext?: {
    diet_type?: string;
    dietary_options?: string[];
    target_calories?: number;
    target_protein_g?: number;
    target_carbs_g?: number;
    target_fats_g?: number;
    search_distance_miles?: number;
    user_location_lat?: number;
    user_location_lng?: number;
    user_location_label?: string; // Optional display label like "Boca Raton, FL"
  };
}

// ========== HELPER FUNCTIONS ==========

/**
 * Generates a short summary line for meal results
 */
function generateMealSummary(userQuery: string, mealCount: number): string {
  const lowerQuery = userQuery.toLowerCase();
  
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
 * Extracts and normalizes restaurant name from user query
 */
async function extractRestaurantName(userQuery: string): Promise<string | null> {
  const classificationPrompt = `You are a query classifier. Your job is to extract the Restaurant Name from the user's query and normalize it to the standard US spelling.

Input: 'High protein at Chipolte' -> Output: 'Chipotle'
Input: 'Mac donalds burger' -> Output: 'McDonald's'
Input: 'Healthy lunch nearby' -> Output: 'NULL'

Return ONLY the raw string of the restaurant name. No JSON, no sentence.`;

  try {
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: classificationPrompt,
      prompt: userQuery,
      temperature: 0,
    });

    const extractedName = result.text.trim();
    
    if (extractedName.toUpperCase() === 'NULL' || !extractedName) {
      return null;
    }

    return extractedName;
  } catch (error) {
    console.error('Restaurant name extraction error:', error);
    return null;
  }
}

/**
 * Queries Supabase for menu items by restaurant name with JOIN to restaurants
 */
async function fetchMenuItems(restaurantName: string, userContext?: any): Promise<Meal[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Query with JOIN to restaurants table
  const { data, error } = await supabase
    .from('menu_items')
    .select(`
      id,
      item_name,
      image_url,
      calories,
      protein_g,
      carbs_g,
      fats_g,
      dietary_tags,
      restaurants (
        name,
        latitude,
        longitude
      )
    `)
    .ilike('restaurants.name', `%${restaurantName}%`)
    .limit(50);

  if (error) {
    console.error('Supabase query error:', error);
    throw error;
  }

  // Map database rows to Meal objects
  const meals: Meal[] = (data || [])
    .filter((row: any) => row.restaurants) // Filter out rows without restaurant data
    .map((row: any) => ({
      id: row.id,
      name: row.item_name,
      restaurant: row.restaurants?.name || 'Unknown',
      restaurant_name: row.restaurants?.name || 'Unknown',
      calories: row.calories ?? 0,
      protein: row.protein_g ?? 0,
      carbs: row.carbs_g ?? 0,
      fats: row.fats_g ?? 0,
      image: row.image_url || '/placeholder-food.jpg',
      dietary_tags: row.dietary_tags || [],
      latitude: row.restaurants?.latitude ?? undefined,
      longitude: row.restaurants?.longitude ?? undefined,
    }));

  return meals;
}

/**
 * Queries Supabase for menu items by constraints (calories, macros, etc.) without restaurant filter
 */
async function fetchMenuItemsByConstraints(userContext?: any, maxCalories?: number): Promise<Meal[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Build query with constraints
  let query = supabase
    .from('menu_items')
    .select(`
      id,
      item_name,
      image_url,
      calories,
      protein_g,
      carbs_g,
      fats_g,
      dietary_tags,
      restaurants (
        name,
        latitude,
        longitude
      )
    `);

  // Apply calorie constraint if provided
  if (maxCalories) {
    query = query.lte('calories', maxCalories);
  }

  const { data, error } = await query.limit(50);

  if (error) {
    console.error('Supabase query error:', error);
    throw error;
  }

  // Map database rows to Meal objects
  const meals: Meal[] = (data || [])
    .filter((row: any) => row.restaurants) // Filter out rows without restaurant data
    .map((row: any) => ({
      id: row.id,
      name: row.item_name,
      restaurant: row.restaurants?.name || 'Unknown',
      restaurant_name: row.restaurants?.name || 'Unknown',
      calories: row.calories ?? 0,
      protein: row.protein_g ?? 0,
      carbs: row.carbs_g ?? 0,
      fats: row.fats_g ?? 0,
      image: row.image_url || '/placeholder-food.jpg',
      dietary_tags: row.dietary_tags || [],
      latitude: row.restaurants?.latitude ?? undefined,
      longitude: row.restaurants?.longitude ?? undefined,
    }));

  return meals;
}

/**
 * Constructs the system prompt with the 12-point logic rules
 */
function buildSystemPrompt(meals: Meal[], userContext?: RequestBody['userContext']): string {
  const itemsJson = JSON.stringify(meals, null, 2);
  
  // Build dietary preferences section
  let dietaryInfo = '';
  if (userContext) {
    const dietType = userContext.diet_type;
    const dietaryOptions = userContext.dietary_options || [];
    
    if (dietType || dietaryOptions.length > 0) {
      dietaryInfo = '\n\n**USER DIETARY PREFERENCES:**\n';
      if (dietType) {
        dietaryInfo += `- Diet Type: ${dietType}\n`;
      }
      if (dietaryOptions.length > 0) {
        dietaryInfo += `- Dietary Restrictions/Options: ${dietaryOptions.join(', ')}\n`;
      }
      dietaryInfo += 'When recommending meals, you MUST respect these dietary preferences and restrictions. Only suggest items that align with the user\'s dietary requirements.';
    }
  }

  return `You are MacroScout, a nutrition assistant for a search-first nutrition app. You have access to a specific list of menu items provided in the context below.${dietaryInfo}

**CRITICAL RULES - YOU MUST FOLLOW THESE STRICTLY:**

1. **Source of Truth:** You have access to a specific list of menu items provided in the context. You must NEVER hallucinate items. If it's not in the JSON context, it doesn't exist. Do not suggest items that are not explicitly listed.

2. **STRICT MACRO FILTERING (CRITICAL):** When the user specifies macro requirements (e.g., "40g+ protein", "under 30g carbs", "under 600 calories"), these are HARD RULES. You MUST:
   - Only include meals that STRICTLY meet ALL stated requirements
   - If a meal has NULL/undefined macro data for a required field, EXCLUDE it (missing data = not eligible)
   - Do NOT pad results with "near-matches" or items that almost meet the criteria
   - Do NOT guess or estimate macros - only use the exact values from the provided data
   - If only 2 meals match, return 2. If 0 match, return 0. NEVER force a count of 5.

3. **Component Logic:** If the menu data contains items with category "Component" (like Chipotle Rice/Beans), you are allowed to combine them to suggest a full meal/bowl. Do not suggest a bowl if you don't have the components. Only combine components that are actually present in the context.

4. **Safety & Transparency:**
   - If pricing is NULL, do not mention price.
   - Do not give medical advice.
   - If a macro is NULL and the user requested that macro, EXCLUDE the item (do not warn, just exclude).

5. **Output Format for Meal Requests (CRITICAL):**
   - If the user asks for meals (keywords: "find me", "lunch", "dinner", "breakfast", "meal", "under X calories", "high protein", "low carb", restaurant names, etc.), you MUST follow this format:
   - Output ONLY a single short summary sentence (e.g., "Found 3 lunch options under 1000 calories.")
   - Then IMMEDIATELY output the <MEAL_CARDS> JSON block (see rule 13)
   - DO NOT output bullet points, numbered lists, or detailed explanations in the visible text
   - DO NOT explain each meal individually in the visible response
   - The visible text should be ONE sentence only, followed by the JSON block
   - If you have matching meals, you MUST include the <MEAL_CARDS> block - this is not optional
   - The count in your summary must match the actual number of meals returned (do not say "5" if you only have 2)

6. **Output Format for General Questions:**
   - For general nutrition questions (not meal-finding requests), provide helpful text answers
   - Do NOT include <MEAL_CARDS> for general questions
   - You can use bullet points and detailed explanations for general questions

7. **No "Scanning":** If the user asks to scan a menu, tell them that feature is coming soon and to search the database instead.

8. **Accuracy:** Always verify that the items you recommend exist in the provided context. Double-check names, categories, and macros before suggesting.

9. **Macro Calculations:** When combining components, calculate the total macros by summing the individual component macros. Make sure your math is correct. If any component has NULL macros, the combined meal is ineligible for macro-filtered queries.

10. **STRICT MEAL-ONLY RULE (CRITICAL):** You MUST ONLY return complete meals (entrees, bowls, salads, sandwiches, wraps, plates, pizzas, burritos, tacos, etc.). NEVER return single ingredients, add-ons, sides, toppings, sauces, dressings, or modifiers (e.g., "baby spinach", "kale", "avocado", "sauce", "dressing", "cheese", "rice", "lettuce", etc.). 
   - Exclude items with categories like: side, sauce, topping, extra, add-on, ingredient, dressing, condiment, beverage, modifier
   - Exclude items with names that are clearly ingredients (single words like "avocado", "spinach", "kale", "rice", "chicken" when not part of a meal name)
   - Exclude items with patterns like "add", "extra", "side of", "topping", "sauce", "dressing"
   - If only ingredients/sides match the macro filters, return 0 meals with message: "No full meals match your request yet—try widening your filters."
   - NEVER pad results with ingredients to reach a count of 5. If 0 meals match, return 0.

11. **User Intent:** If the user asks for something specific (e.g., "low carb", "high protein", "vegetarian"), only recommend items that actually meet those criteria based on the data provided. STRICT FILTERING - no exceptions. AND they must be complete meals (see rule 10).

12. **Transparency:** If you cannot find items matching the user's request, be honest. Say "No full meals match your request yet—try widening your filters." Do NOT make up items, provide bullet lists of invented meals, pad results with near-matches, or return ingredients/sides as meals.

13. **Professional Tone:** Be helpful, friendly, and informative, but always prioritize accuracy over being overly enthusiastic.

14. **Structured Meal Output (MANDATORY FOR MEAL REQUESTS):** 
   When the user asks for meals (detect keywords: "find me", "lunch", "dinner", "breakfast", "meal", "under", "calories", "high protein", "low carb", restaurant names, etc.) AND you have matching meals in the database, you MUST include a structured JSON block at the end of your response using these exact delimiters:

<MEAL_CARDS>
{
  "meals": [array of up to 5 Meal objects from the context that match the user's request],
  "has_more": boolean
}
</MEAL_CARDS>

**CRITICAL RULES for <MEAL_CARDS>:**
- This is MANDATORY for meal-finding requests - you MUST include it if you have matching meals
- Only include COMPLETE MEALS from the JSON context below (entrees, bowls, salads, sandwiches, wraps, plates, etc.)
- NEVER include single ingredients, add-ons, sides, toppings, sauces, dressings, or modifiers
- NO FORCED COUNT - return however many complete meals actually match (could be 0, 1, 2, 3, 4, 5, or more)
- STRICTLY enforce all macro constraints - if user asks for "40g+ protein", every meal must have protein >= 40g
- Missing macro data (NULL/undefined) = meal is NOT eligible for macro-filtered queries
- Never hallucinate meals or pad results with near-matches or ingredients
- Never guess or estimate macros - only use exact values from the data
- The meals array should contain Meal objects with: id, name, restaurant, restaurant_name, calories, protein, carbs, fats, image, dietary_tags
- If you have 0 matching complete meals, output: "No full meals match your request yet—try widening your filters." and do NOT include <MEAL_CARDS>
- General nutrition questions (not meal-finding requests) must NOT include <MEAL_CARDS>

**Menu Items Context (JSON):**
${itemsJson}

Remember: You can ONLY recommend items from the JSON above. Never invent or suggest items that don't exist in this data.`;
}

// ========== MAIN API HANDLER ==========

export async function POST(request: NextRequest) {
  const requestUrl = request.url;
  console.log('[api/chat] Chat API called:', requestUrl);
  
  // Check for required environment variables
  if (!process.env.OPENAI_API_KEY) {
    console.error('[api/chat] Missing OPENAI_API_KEY');
    return NextResponse.json(
      { error: 'Missing OPENAI_API_KEY', details: 'Server configuration error' },
      { status: 500 }
    );
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('[api/chat] Missing Supabase environment variables');
    return NextResponse.json(
      { error: 'Missing Supabase configuration', details: 'Server configuration error' },
      { status: 500 }
    );
  }
  
  try {
    // Declare detectedCalorieCap at the top level for scope
    let detectedCalorieCap: number | null = null;
    
    // Validate request body exists
    let body: RequestBody;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return NextResponse.json(
        { error: 'Invalid request body. Expected JSON.' },
        { status: 400 }
      );
    }
    
    // Validate required fields
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Request body is required' },
        { status: 400 }
      );
    }
    
    console.log('Request body received:', {
      hasMessages: !!body.messages,
      messageCount: body.messages?.length,
      hasUserId: !!body.userId,
      hasUserContext: !!body.userContext
    });

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      console.error('Invalid request: Messages array required');
      return NextResponse.json(
        { error: 'Messages array required' },
        { status: 400 }
      );
    }

    const latestMessage = body.messages[body.messages.length - 1];
    const userMessage = typeof latestMessage?.content === 'string' ? latestMessage.content : '';

    if (!userMessage || !userMessage.trim()) {
      return NextResponse.json(
        { error: 'User message content is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    // Step 0: Check auth (optional for MVP - allow anonymous requests)
    // Auth is only needed for favorites/profile endpoints, not for chat
    let user = null;
    try {
      const supabase = await createServerClient();
      const { data: { user: fetchedUser }, error: userError } = await supabase.auth.getUser();
      
      // Treat AuthSessionMissingError as "no user" (expected for signed-out users)
      if (userError && (userError.message?.includes('Auth session missing') || userError.name === 'AuthSessionMissingError')) {
        console.log('[api/chat] Anonymous request (no auth session - guest preview)');
        user = null;
      } else if (fetchedUser && !userError) {
        user = fetchedUser;
        console.log('[api/chat] Authenticated request for user:', user.id);
      } else {
        console.log('[api/chat] Anonymous request (no auth)');
        user = null;
      }

      // Only query daily_usage table if user exists (skip for guest preview)
      if (user) {
        const { data: usageData, error: usageError } = await supabase
          .from('daily_usage')
          .select('search_count, last_search_date')
          .eq('user_id', user.id)
          .single();

        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format in UTC
        let searchCount = 0;

        // Handle different error cases
        if (usageError) {
          if (usageError.code === 'PGRST116') {
            // No record found - user is new, start with 0
            searchCount = 0;
          } else {
            // Other database error - log but allow request to continue (fail open)
            console.error('[api/chat] Error fetching daily usage:', usageError);
            searchCount = 0;
          }
        } else if (usageData) {
          searchCount = usageData.search_count || 0;
          const lastSearchDate = usageData.last_search_date || today;

          // Reset logic: If last_search_date is strictly less than today's date (UTC)
          if (lastSearchDate < today) {
            searchCount = 0;
          }
        }

        // Limit logic: If search_count >= 25, return error 429 (BEFORE any processing)
        if (searchCount >= 25) {
          return NextResponse.json(
            { error: 'Daily search limit reached. Please try again tomorrow.' },
            { status: 429 }
          );
        }

        // Increment search_count by 1
        const newSearchCount = searchCount + 1;

        // Update or insert daily_usage record (fire and forget - don't block request)
        void supabase
          .from('daily_usage')
          .upsert({
            user_id: user.id,
            search_count: newSearchCount,
            last_search_date: today,
          }, {
            onConflict: 'user_id',
          })
          .then(({ error: updateError }) => {
            if (updateError) {
              console.error('[api/chat] Error updating daily usage:', updateError);
            }
          });
      }
    } catch (authError: any) {
      // AuthSessionMissingError is expected when signed out - treat as no user
      if (authError?.message?.includes('Auth session missing') || authError?.name === 'AuthSessionMissingError') {
        console.log('[api/chat] No auth session (guest preview mode)');
        user = null;
      } else {
        console.warn('[api/chat] Auth check error (non-session):', authError);
        // Continue with user = null for guest preview
        user = null;
      }
    }

    // Step 1: Query Classifier - Extract restaurant name using LLM
    let extractedRestaurantName: string | null;
    try {
      extractedRestaurantName = await extractRestaurantName(userMessage);
      console.log(`Extracted restaurant name: ${extractedRestaurantName || 'NULL'}`);
    } catch (extractionError) {
      console.error('Error extracting restaurant name:', extractionError);
      // Continue without restaurant name - will query by constraints instead
      extractedRestaurantName = null;
    }

    // Step 2: The Retrieval
    let meals: Meal[] = [];
    let systemPrompt: string;

    if (extractedRestaurantName) {
      // Use the extracted name for Supabase query
      try {
        meals = await fetchMenuItems(extractedRestaurantName, body.userContext);
      } catch (fetchError) {
        console.error('[api/chat] Error fetching menu items:', fetchError);
        const fetchErrorMessage = fetchError instanceof Error ? fetchError.message : 'Failed to fetch menu items';
        return NextResponse.json(
          { 
            error: 'Chat failed',
            details: fetchErrorMessage 
          },
          { status: 500 }
        );
      }

      if (meals.length === 0) {
        // Fallback: No items found for this restaurant
        systemPrompt = `You are MacroScout. The user asked about "${extractedRestaurantName}", but you don't have menu data for that restaurant yet. Apologize politely and suggest they try searching for a restaurant you do have data for, or ask a general nutrition question.`;
      } else {
        // Build system prompt with meals and user context
        systemPrompt = buildSystemPrompt(meals, body.userContext);
      }
    } else {
      // No restaurant specified - check if it's a meal-finding request
      // Expanded heuristic: detect meal intent keywords
      const mealKeywords = [
        'find me', 'find', 'show me', 'show', 'give me', 'give', 'recommend', 'recommendation',
        'lunch', 'dinner', 'breakfast', 'meal', 'meals', 'options', 'option',
        'calories', 'calorie', 'cal', 'cals',
        'protein', 'carbs', 'carb', 'fat', 'fats',
        'under', 'below', 'less than', 'over', 'above', 'more than',
        'high', 'low', 'maximum', 'max', 'minimum', 'min',
        'vegetarian', 'vegan', 'gluten', 'keto', 'paleo'
      ];
      const lowerQuery = userMessage.toLowerCase();
      const isMealRequest = mealKeywords.some(keyword => lowerQuery.includes(keyword));

      // Extract calorie cap from query (for logging)
      if (isMealRequest) {
        const calorieMatch = userMessage.match(/(?:under|below|less than|max|maximum|up to)\s*(\d+)\s*(?:calories?|cal)/i);
        detectedCalorieCap = calorieMatch ? parseInt(calorieMatch[1]) : null;
      }

      if (isMealRequest) {
        // For meal requests, use the fast /api/search endpoint instead of OpenAI
        // This avoids expensive OpenAI calls and returns results in ~2 seconds
        const chatStartTime = Date.now();
        const chatTimings: Record<string, number> = {};
        
        // Extract macro constraints for empty state message
        const extractMinProtein = (q: string): number | null => {
          const match = q.toLowerCase().match(/(\d+)\s*g?\s*\+?\s*protein|high\s+protein\s+(\d+)\s*g?|protein\s+(\d+)\s*g?\s*\+?/i);
          return match ? parseInt(match[1] || match[2] || match[3], 10) : (q.toLowerCase().includes('high protein') ? 30 : null);
        };
        const extractMaxCarbs = (q: string): number | null => {
          const match = q.toLowerCase().match(/under\s+(\d+)\s*g?\s*carbs?|less\s+than\s+(\d+)\s*g?\s*carbs?|low\s+carb/i);
          return match ? parseInt(match[1] || match[2], 10) : (q.toLowerCase().includes('low carb') || q.toLowerCase().includes('keto') ? 30 : null);
        };
        const detectedMinProtein = extractMinProtein(userMessage);
        const detectedMaxCarbs = extractMaxCarbs(userMessage);
        
        console.log(`🍽️  Meal request detected - constraints: ${detectedCalorieCap ? `calories <= ${detectedCalorieCap}` : ''} ${detectedMinProtein ? `protein >= ${detectedMinProtein}g` : ''} ${detectedMaxCarbs ? `carbs <= ${detectedMaxCarbs}g` : ''}`);

        try {
          const searchStart = Date.now();
          // Call /api/search endpoint internally
          // Use the request URL to determine the base URL
          const url = new URL(request.url);
          const baseUrl = `${url.protocol}//${url.host}`;
          const searchUrl = `${baseUrl}/api/search`;
          
          // Extract user location if available from context (validate before using)
          // Use user_location_lat and user_location_lng from userContext
          const userLat = body.userContext?.user_location_lat;
          const userLng = body.userContext?.user_location_lng;
          const userLocation = 
            typeof userLat === 'number' &&
            typeof userLng === 'number' &&
            !isNaN(userLat) &&
            !isNaN(userLng) &&
            userLat >= -90 && userLat <= 90 &&
            userLng >= -180 && userLng <= 180
            ? {
                latitude: userLat,
                longitude: userLng,
              }
            : undefined;

          const searchResponse = await fetch(searchUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: userMessage,
              limit: 10, // Request up to 10, but will return however many match (no forced count)
              offset: 0,
              radius_miles: body.userContext?.search_distance_miles || undefined,
              // Use new format: user_location_lat and user_location_lng
              ...(userLocation ? {
                user_location_lat: userLocation.latitude,
                user_location_lng: userLocation.longitude,
              } : {}),
            }),
          });
          chatTimings.search_api_call = Date.now() - searchStart;

          if (!searchResponse.ok) {
            const errorText = await searchResponse.text();
            console.error('Search API error:', errorText);
            return NextResponse.json(
              { error: 'Failed to search for meals. Please try again.' },
              { status: 500 }
            );
          }

          const parseStart = Date.now();
          const searchResponseData = await searchResponse.json();
          chatTimings.search_response_parse = Date.now() - parseStart;

          // Handle paginated response format from /api/search: { meals, hasMore, nextOffset, searchKey }
          const { meals: searchMeals = [], hasMore = false, nextOffset = 0, searchKey: responseSearchKey = '' } = searchResponseData;
          
          chatTimings.total_chat_time = Date.now() - chatStartTime;
          
          // Log calorie enforcement
          if (detectedCalorieCap != null && typeof detectedCalorieCap === 'number') {
            const calorieCap = detectedCalorieCap;
            const overCap = searchMeals.filter((item: any) => (item.calories || 0) > calorieCap).length;
            if (overCap > 0) {
              console.error(`❌ ERROR: ${overCap} meals over calorie cap ${calorieCap} returned!`);
            } else {
              console.log(`✅ Calorie cap ${calorieCap} enforced: all ${searchMeals.length} meals within limit`);
            }
          }
          
          console.log('⏱️  Chat API timings (ms):', chatTimings);
          console.log(`✅ Found ${searchMeals.length} meals via /api/search (hasMore: ${hasMore})`);

          // Helper to safely convert numeric fields
          const toNum = (value: any): number => {
            if (value === null || value === undefined) return 0;
            const n = Number(value);
            return Number.isNaN(n) ? 0 : n;
          };

          // Convert search results to Meal format expected by frontend
          meals = (searchMeals || []).map((item: any) => ({
            id: item.id,
            name: item.item_name || item.name,
            restaurant: item.restaurant_name,
            restaurant_name: item.restaurant_name,
            calories: toNum(item.calories),
            protein: toNum(item.protein ?? item.protein_g),
            carbs: toNum(item.carbs ?? item.carbs_g),
            fats: toNum(item.fats ?? item.fats_g ?? item.fat_g),
            image: item.image_url || '/placeholder-food.jpg',
            dietary_tags: item.dietary_tags || [],
            latitude: item.latitude,
            longitude: item.longitude,
          }));

          if (meals.length > 0) {
            console.log('🍽️  Chat meal[0]:', meals[0]);
          }

          if (meals.length > 0) {
            // Return JSON response for meal mode
            const summary = generateMealSummary(userMessage, meals.length);
            return NextResponse.json({
              type: 'meals',
              summary,
              meals,
              hasMore,
              nextOffset,
              searchKey: responseSearchKey
            });
            } else {
              // No meals found - generate friendly empty state message with specific constraints
              let emptyMessage = "No full meals match your request yet—try widening your filters.";
              const constraints: string[] = [];
              if (detectedMinProtein) constraints.push(`${detectedMinProtein}g+ protein`);
              if (detectedMaxCarbs) constraints.push(`under ${detectedMaxCarbs}g carbs`);
              if (detectedCalorieCap) constraints.push(`under ${detectedCalorieCap} calories`);
              
              if (constraints.length > 0) {
                emptyMessage = `No full meals match ${constraints.join(', ')} yet—try widening your filters.`;
              }
              
              return NextResponse.json({
                type: 'text',
                message: emptyMessage
              });
            }
        } catch (searchError) {
          console.error('[api/chat] Error calling search API:', searchError);
          const searchErrorMessage = searchError instanceof Error ? searchError.message : 'Failed to search for meals';
          return NextResponse.json(
            { 
              error: 'Chat failed',
              details: searchErrorMessage 
            },
            { status: 500 }
          );
        }
      } else {
        // General nutrition question - no database query
        // Build dietary info for general questions too
        let dietaryInfo = '';
        if (body.userContext) {
          const dietType = body.userContext.diet_type;
          const dietaryOptions = body.userContext.dietary_options || [];
          
          if (dietType || dietaryOptions.length > 0) {
            dietaryInfo = '\n\n**USER DIETARY PREFERENCES:**\n';
            if (dietType) {
              dietaryInfo += `- Diet Type: ${dietType}\n`;
            }
            if (dietaryOptions.length > 0) {
              dietaryInfo += `- Dietary Restrictions/Options: ${dietaryOptions.join(', ')}\n`;
            }
            dietaryInfo += 'Keep these preferences in mind when providing nutrition advice.';
          }
        }
        systemPrompt = `You are MacroScout, a nutrition assistant for a search-first nutrition app. The user's query doesn't mention a specific restaurant or meal request. Answer helpfully about nutrition and meal planning, but note that you specialize in restaurant menu item recommendations. If they're asking about a specific restaurant, ask them to mention the restaurant name. Do NOT include <MEAL_CARDS> in your response.${dietaryInfo}`;
      }
    }

    // Step 3: The Final Response - Use streamText from AI SDK 5.0
    try {
      const result = streamText({
        model: openai('gpt-4o-mini'),
        system: systemPrompt,
        messages: body.messages.map((msg: ChatMessage) => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: 0.7,
      });

      // Return text stream response (Standard for SDK 5.0)
      // This returns a streaming Response, which is fine for text mode
      // The streaming response is wrapped in try/catch above to handle errors
      return result.toTextStreamResponse();
    } catch (streamError) {
      console.error('[api/chat] Stream text error:', streamError);
      const streamErrorMessage = streamError instanceof Error ? streamError.message : 'Failed to generate response';
      return NextResponse.json(
        { 
          error: 'Chat failed',
          details: streamErrorMessage 
        },
        { status: 500 }
      );
    }

  } catch (error: unknown) {
    console.error('[api/chat] error', error);
    const safeMessage = error instanceof Error ? error.message : String(error);
    const errorMessage = safeMessage || 'Chat request failed';
    
    return NextResponse.json(
      { 
        error: 'Chat failed',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}
