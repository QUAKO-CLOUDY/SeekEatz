/**
 * @deprecated This script is deprecated and will not execute.
 * 
 * This script was an early importer that:
 * - Writes rows without import_batch_id (pollutes DB with untracked data)
 * - Uses legacy data folder (scripts/data instead of data/jsons)
 * - Does not match our finalized JSON schema
 * 
 * Use scripts/ingest-data.ts instead for all data ingestion.
 */

console.error('❌ bulk-import is deprecated. Use scripts/ingest-data.ts instead.');
process.exit(1);

// All code below is unreachable but kept for reference
/*
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Use SERVICE ROLE KEY to bypass RLS (Admin Mode)
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiKey = process.env.OPENAI_API_KEY!;

if (!supabaseUrl || !supabaseKey || !openaiKey) {
  console.error('❌ Missing environment variables.');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });
*/

/* Unreachable code - kept for reference only
// Helper: Format Restaurant Name (chipotle.json -> Chipotle)
function getRestaurantName(filename: string): string {
  const nameWithoutExt = filename.replace(/\.json$/i, '');
  return nameWithoutExt
    .split(/[-_\s]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Helper: Delay to respect OpenAI rate limits
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1. Get or Create Restaurant
async function getOrCreateRestaurant(restaurantName: string): Promise<string> {
  const { data: existing } = await supabase
    .from('restaurants')
    .select('id')
    .ilike('name', restaurantName)
    .maybeSingle();

  if (existing) {
    console.log(`  Found existing restaurant: ${restaurantName}`);
    return existing.id;
  }

  const { data: newRestaurant, error } = await supabase
    .from('restaurants')
    .insert({ name: restaurantName })
    .select('id')
    .single();

  if (error) throw error;
  console.log(`  Created new restaurant: ${restaurantName}`);
  return newRestaurant.id;
}

// 2. Generate "Rich Context" Embedding
// This is the Upgrade: We embed the Macros and Restaurant Name too.
async function generateRichEmbedding(
  restaurantName: string,
  item: any
): Promise<number[]> {
  const itemName = item.item_name || item.name || 'Unknown Item';
  const description = item.description || '';
  const protein = item.protein_g || 0;
  const cals = item.calories || 0;
  const tags = item.dietary_tags ? item.dietary_tags.join(', ') : '';

  // The "Rich String" the AI will read
  const textToEmbed = `Restaurant: ${restaurantName}. Item: ${itemName}. Description: ${description}. Macros: ${protein}g Protein, ${cals} Calories. Tags: ${tags}.`;
  
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: textToEmbed,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error(`  Error embedding ${itemName}:`, error);
    throw error;
  }
}

// 3. Process File Logic
async function processFile(filePath: string): Promise<void> {
  const filename = path.basename(filePath);
  const restaurantName = getRestaurantName(filename);

  console.log(`\n📄 Processing ${filename}...`);

  let items: any[];
  try {
    items = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(items)) throw new Error('Not an array');
  } catch (e) {
    console.error(`  ❌ Failed to parse ${filename}`);
    return;
  }

  // Get Restaurant ID
  let restaurantId;
  try {
    restaurantId = await getOrCreateRestaurant(restaurantName);
  } catch (e) {
    console.error(`  ❌ Failed to sync restaurant ${restaurantName}`);
    return;
  }

  // Loop items
  let inserted = 0;
  let updated = 0;
  for (const item of items) {
    try {
      const itemName = item.item_name || item.name;
      
      // Check if item already exists
      const { data: existing } = await supabase
        .from('menu_items')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('item_name', itemName)
        .maybeSingle();

      // Create the Rich Embedding
      const embedding = await generateRichEmbedding(restaurantName, item);

      const itemData = {
        restaurant_id: restaurantId,
        item_name: itemName,
        description: item.description,
        category: item.category,
        price: item.price,
        calories: item.calories,
        protein_g: item.protein_g,
        carbs_g: item.carbs_g,
        fats_g: item.fats_g,
        dietary_tags: item.dietary_tags,
        embedding: embedding 
      };

      if (existing) {
        // Update existing item
        const { error } = await supabase
          .from('menu_items')
          .update(itemData)
          .eq('id', existing.id);

        if (error) throw error;
        updated++;
      } else {
        // Insert new item
        const { error } = await supabase
          .from('menu_items')
          .insert(itemData);

        if (error) throw error;
        inserted++;
      }
      
      // Small delay to prevent API rate limits
      await delay(100); 

    } catch (e: any) {
      console.error(`  ⚠️ Skipped item: ${item.item_name || 'Unknown'} - ${e.message}`);
    }
  }
  console.log(`  ✅ Processed ${inserted + updated} items for ${restaurantName} (${inserted} new, ${updated} updated)`);
}

// Main Execution
async function run() {
  const dataDir = path.join(process.cwd(), 'scripts', 'data');
  if (!fs.existsSync(dataDir)) {
    console.error(`❌ Missing folder: ${dataDir}`);
    return;
  }

  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
  console.log(`Found ${files.length} files. Starting Import...`);

  for (const file of files) {
    await processFile(path.join(dataDir, file));
  }
  console.log('\n✨ DONE.');
}

run();
*/