import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { restaurant_name, user_goal } = body;
    
    if (!restaurant_name || !user_goal) {
      return NextResponse.json({ error: "Missing info" }, { status: 400 });
    }

    // 1. Setup OpenRouter (Uses the OpenAI SDK, just with a different URL)
    const openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY, 
      defaultHeaders: {
        "HTTP-Referer": "http://localhost:3000", // Optional: required by OpenRouter for rankings
        "X-Title": "MacroMatch AI",
      }
    });
    
    const supabase = await createClient();

    // 2. Search for the restaurant
    const { data: restaurant, error: restError } = await supabase
      .from('restaurants')
      .select('id')
      .ilike('name', `%${restaurant_name}%`) 
      .single();

    if (restError || !restaurant) {
      return NextResponse.json({ error: `Restaurant '${restaurant_name}' not found.` }, { status: 404 });
    }

    // 3. Fetch menu items
    const { data: menuItems } = await supabase
      .from('menu_items')
      .select(`
        name,
        category,
        nutrition_info (calories, protein_g, carbs_g, fat_g)
      `)
      .eq('restaurant_id', restaurant.id);

    // 4. Talk to AI
    const systemPrompt = `
      You are a nutrition expert. 
      Goal: Select a combination of menu items to build a meal that matches the user's request.
      Rules:
      1. ONLY use items from the provided Menu Data.
      2. Return JSON: { "meal_name": "...", "items": ["..."], "reasoning": "...", "total_macros": {...} }
    `;

    const userMessage = `Restaurant: ${restaurant_name}, Goal: ${user_goal}, Menu: ${JSON.stringify(menuItems)}`;

    const completion = await openai.chat.completions.create({
      model: "openai/gpt-4o-mini", // OpenRouter requires the vendor prefix
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content || "{}";
    return NextResponse.json(JSON.parse(content));

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}