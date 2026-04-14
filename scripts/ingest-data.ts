/**
 * AUTHORITATIVE DATA INGESTION SCRIPT
 * 
 * This is the ONLY script that should be used to import menu data.
 * It ensures every row gets a non-null import_batch_id for tracking.
 * 
 * SAFE WORKFLOW:
 * 1. Test with SINGLE_RESTAURANT first:
 *    SINGLE_RESTAURANT="Chipotle" DRY_RUN=true npm run ingest
 * 
 * 2. Verify rows have new batch_id:
 *    Check the output - it will show how many rows would be upserted
 * 
 * 3. Run full ingest (non-dry-run):
 *    npm run ingest
 * 
 * 4. After successful ingest, copy the "Cleanup SQL block" from output
 *    and run it in Supabase SQL Editor to remove stale rows
 * 
 * ENVIRONMENT VARIABLES:
 * - DRY_RUN=true: Parse files and generate embeddings, but don't write to DB
 * - SINGLE_RESTAURANT="Name": Only ingest JSON files matching this restaurant name (case-insensitive)
 * 
 * IMPORTANT:
 * - All rows written by this script will have a non-null import_batch_id
 * - Legacy rows (from bulk-import or old runs) will have NULL or different batch_id
 * - Use the cleanup SQL to safely remove stale rows after verifying new data
 */

import path from 'path';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

// 1. FORCE LOAD .env.local from the root folder
// This fixes the "supabaseUrl is required" error
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { classifyMenuItem } from '../lib/menu-item-classifier';

// 2. CHECK KEYS
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Must be SERVICE_ROLE (Secret)
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseKey || !openaiKey) {
  console.error('❌ Missing API Keys in .env.local');
  console.error(`   URL: ${!!supabaseUrl}`);
  console.error(`   Service Key: ${!!supabaseKey} (Should be true)`);
  console.error(`   OpenAI Key: ${!!openaiKey}`);
  process.exit(1);
}

// 3. MODE FLAGS
const DRY_RUN = process.env.DRY_RUN === 'true';
const SINGLE_RESTAURANT = process.env.SINGLE_RESTAURANT?.toLowerCase();

if (DRY_RUN) {
  console.log('DRY RUN MODE ENABLED');
}

if (SINGLE_RESTAURANT) {
  console.log(`SINGLE RESTAURANT MODE: ${SINGLE_RESTAURANT}`);
}

if (DRY_RUN || SINGLE_RESTAURANT) {
  console.log('');
}

// 4. SETUP CLIENTS
const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

type RawIngestItem = {
  name: string;
  category?: string;
  price_estimate?: number | string | null;
  image_url?: string | null;
  macros?: {
    calories?: number | string;
    protein?: number | string;
    carbs?: number | string;
    fat?: number | string;
  };
};

function buildModifierCollisionName(item: RawIngestItem): string {
  const category = (item.category || '').toLowerCase();
  const name = item.name.trim();

  if (/dress|sauce|condiment/.test(category)) {
    return `Side of ${name}`;
  }

  return `Add ${name}`;
}

function canonicalizeWaBaMealName(item: RawIngestItem): string {
  const name = item.name.trim();
  const category = (item.category || '').trim();

  switch (category) {
    case 'BOWLS':
      return `${name} Bowl`;
    case 'MINI BOWLS':
      return `${name} Mini Bowl`;
    case 'VEGGIE BOWL':
      return `${name} Veggie Bowl`;
    case 'PLATES':
      return `${name} Plate`;
    case 'TACOS':
      return `${name} Tacos`;
    default:
      return name;
  }
}

function preprocessRestaurantItems(
  restaurantName: string,
  items: RawIngestItem[]
): RawIngestItem[] {
  const normalizedRestaurant = restaurantName.trim().toLowerCase();

  if (normalizedRestaurant === 'waba grill') {
    return items.map((item) => {
      const category = (item.category || '').trim();
      const name = item.name.trim();

      if (['BOWLS', 'MINI BOWLS', 'VEGGIE BOWL', 'PLATES', 'TACOS'].includes(category)) {
        return {
          ...item,
          name: canonicalizeWaBaMealName(item),
        };
      }

      if (category === 'FAMILY A LA CARTE') {
        return {
          ...item,
          name: `Add ${name}`,
        };
      }

      if (category === 'SIDES' && name.startsWith('Side | ')) {
        return {
          ...item,
          name: `Add ${name.replace(/^Side \|\s*/, '').trim()}`,
        };
      }

      return item;
    });
  }

  if (normalizedRestaurant === "moe's southwest grill") {
    return items.map((item) => {
      const category = (item.category || '').trim();
      const name = item.name.trim();

      if (category === 'Burritos, Quesadillas, & Stacks') {
        if (name.includes('Whole Grain')) return { ...item, name: 'Whole Grain Burrito Tortilla' };
        if (name.includes('Quesadillas')) return { ...item, name: 'Quesadilla Tortilla' };
        return { ...item, name: 'Burrito Tortilla' };
      }

      if (category === 'Tacos') {
        if (name.includes('Crispy')) return { ...item, name: 'Crispy Taco Shell' };
        if (name.includes('Corn')) return { ...item, name: 'Corn Taco Tortilla' };
        return { ...item, name: 'Flour Taco Tortilla' };
      }

      if (category === 'Nachos & Salad') {
        if (/chips/i.test(name)) return { ...item, name: 'Nacho Chips Base' };
        if (/salad bowl/i.test(name)) return { ...item, name: 'Salad Bowl Base' };
      }

      if (category === 'Kids') {
        if (name.includes('Corn')) return { ...item, name: 'Kids Corn Tortilla' };
        return { ...item, name: `Kids ${name}` };
      }

      if (category === 'Fillings' && !/^add /i.test(name)) {
        return { ...item, name: `Add ${name}` };
      }

      return item;
    });
  }

  return items;
}

function makeUniqueRestaurantItemName(
  candidateName: string,
  category: string | undefined,
  usedNames: Set<string>
): string {
  if (!usedNames.has(candidateName)) {
    usedNames.add(candidateName);
    return candidateName;
  }

  const categorySuffix = category?.trim() ? `${candidateName} (${category.trim()})` : `${candidateName} (Modifier)`;
  if (!usedNames.has(categorySuffix)) {
    usedNames.add(categorySuffix);
    return categorySuffix;
  }

  let counter = 2;
  while (true) {
    const numbered = `${categorySuffix} ${counter}`;
    if (!usedNames.has(numbered)) {
      usedNames.add(numbered);
      return numbered;
    }
    counter += 1;
  }
}

function disambiguateRestaurantItems(
  restaurantName: string,
  items: RawIngestItem[]
): RawIngestItem[] {
  const byName = new Map<string, RawIngestItem[]>();

  for (const item of items) {
    const key = item.name.trim();
    if (!byName.has(key)) {
      byName.set(key, []);
    }
    byName.get(key)!.push(item);
  }

  const usedNames = new Set<string>();
  const prepared: RawIngestItem[] = [];
  const renamedCollisions: Array<{ from: string; to: string; category?: string }> = [];

  for (const item of items) {
    const siblings = byName.get(item.name.trim()) || [];
    const classifications = siblings.map((sibling) => classifyMenuItem({
      name: sibling.name,
      category: sibling.category,
    }));

    const hasDishSibling = classifications.some((classification) => classification.isDish);
    const hasModifierSibling = classifications.some((classification) => classification.isModifier);
    const currentClassification = classifyMenuItem({
      name: item.name,
      category: item.category,
    });

    let nextName = item.name.trim();

    if (siblings.length > 1 && hasDishSibling && hasModifierSibling && currentClassification.isModifier) {
      nextName = buildModifierCollisionName(item);
    }

    nextName = makeUniqueRestaurantItemName(nextName, item.category, usedNames);

    if (nextName !== item.name.trim()) {
      renamedCollisions.push({
        from: item.name.trim(),
        to: nextName,
        category: item.category,
      });
    }

    prepared.push({
      ...item,
      name: nextName,
    });
  }

  if (renamedCollisions.length > 0) {
    console.log(`[ingest] ${restaurantName}: disambiguated ${renamedCollisions.length} colliding item names`);
    renamedCollisions.slice(0, 10).forEach((collision) => {
      console.log(`  - ${collision.from} -> ${collision.to} [${collision.category || 'uncategorized'}]`);
    });
  }

  return prepared;
}

async function generateEmbedding(text: string) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.replace(/\n/g, ' '),
    });
    return response.data[0].embedding;
  } catch (err) {
    console.error('   ⚠️ OpenAI Error:', err);
    return null;
  }
}

async function ensureImportBatchIdColumn() {
  // In DRY_RUN mode, skip database checks
  if (DRY_RUN) {
    console.log('🔍 DRY_RUN: Skipping column check');
    return;
  }

  // Check if column exists by trying to query it
  const { error: checkError } = await supabase
    .from('menu_items')
    .select('import_batch_id')
    .limit(1);

  if (checkError) {
    const errorMsg = checkError.message.toLowerCase();
    if (errorMsg.includes('column') && (errorMsg.includes('does not exist') || errorMsg.includes('unknown column'))) {
      console.log('📋 Column import_batch_id does not exist.');
      console.log('');
      console.log('   ⚠️  Please run this SQL in your Supabase SQL Editor before continuing:');
      console.log('');
      console.log('   -- Step 1: Remove duplicate rows (keep the first one of each duplicate)');
      console.log('   DELETE FROM menu_items');
      console.log('   WHERE id IN (');
      console.log('     SELECT id');
      console.log('     FROM (');
      console.log('       SELECT id,');
      console.log('              ROW_NUMBER() OVER (PARTITION BY restaurant_name, name ORDER BY id) as rn');
      console.log('       FROM menu_items');
      console.log('     ) t');
      console.log('     WHERE rn > 1');
      console.log('   );');
      console.log('');
      console.log('   -- Step 2: Add the import_batch_id column');
      console.log('   ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS import_batch_id TEXT;');
      console.log('');
      console.log('   -- Step 3: Create unique index to prevent future duplicates');
      console.log('   CREATE UNIQUE INDEX IF NOT EXISTS menu_items_restaurant_name_name_key ON menu_items(restaurant_name, name);');
      console.log('');
      console.log('   Exiting now. Run the SQL above and try again.');
      process.exit(1);
    } else {
      // Some other error - log it but continue
      console.log(`⚠️  Column check warning: ${checkError.message}`);
      console.log('   Continuing anyway...');
    }
  } else {
    console.log('✅ import_batch_id column exists');
  }
}

/**
 * Check if a filename matches the SINGLE_RESTAURANT filter (case-insensitive)
 */
function matchesFilenameFilter(filename: string): boolean {
  if (!SINGLE_RESTAURANT) return true;
  
  const filenameLower = filename.toLowerCase();
  return filenameLower.includes(SINGLE_RESTAURANT);
}

/**
 * Generate cleanup SQL block for manual execution
 */
function generateCleanupSQL(currentBatchId: string) {
  return `
-- ============================================
-- CLEANUP SQL BLOCK
-- Run this in Supabase SQL Editor after verifying new data
-- ============================================

-- STEP 1: Preview - See counts by import_batch_id
SELECT 
  import_batch_id,
  COUNT(*) as row_count
FROM menu_items
GROUP BY import_batch_id
ORDER BY 
  CASE 
    WHEN import_batch_id IS NULL THEN 0
    WHEN import_batch_id = '${currentBatchId}' THEN 1
    ELSE 2
  END,
  import_batch_id;

-- STEP 2: Preview - See exactly what will be deleted
SELECT 
  COUNT(*) as rows_to_delete
FROM menu_items
WHERE import_batch_id IS NULL 
   OR import_batch_id != '${currentBatchId}';

-- STEP 3: Delete stale rows (only run after verifying preview)
-- WARNING: This will permanently delete rows not from the current batch
DELETE FROM menu_items
WHERE import_batch_id IS NULL 
   OR import_batch_id != '${currentBatchId}';

-- ============================================
-- Current Batch ID: ${currentBatchId}
-- ============================================
`;
}

async function ingestData() {
  // Generate unique batch ID for this import run
  const importBatchId = randomUUID();
  console.log(`\n🆔 Import Batch ID: ${importBatchId}\n`);

  // Ensure import_batch_id column exists (skip in DRY_RUN)
  await ensureImportBatchIdColumn();

  const dataDir = path.join(process.cwd(), 'data/jsons');
  
  if (!fs.existsSync(dataDir)) {
    console.error(`❌ Error: Folder not found at ${dataDir}`);
    console.error('   Make sure you moved the "data" folder to the project root!');
    return;
  }

  const allFiles = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
  
  // Filter files based on SINGLE_RESTAURANT if set (filter by filename, not restaurant_name)
  const files = allFiles.filter(file => matchesFilenameFilter(file));
  
  console.log(`Found ${files.length} JSON file(s)`);

  let totalProcessed = 0;
  let totalSkipped = 0;

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const rawData = fs.readFileSync(filePath, 'utf-8');
    
    let restaurantData;
    try {
      restaurantData = JSON.parse(rawData);
    } catch {
      console.error(`❌ Failed to parse JSON: ${file}`);
      totalSkipped++;
      continue;
    }

    const restaurantName = restaurantData.restaurant_name;
    const items = disambiguateRestaurantItems(
      restaurantName,
      preprocessRestaurantItems(restaurantName, restaurantData.items || [])
    );

    console.log(`\nProcessing ${restaurantName}`);
    console.log(`Items found in JSON: ${items.length}`);

    for (const item of items) {
      const macros = item.macros ?? {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      };

      // Create the searchable string
      const metadataString = `
        ${restaurantName} - ${item.name}
        Category: ${item.category}
        Protein: ${macros.protein}g
        Calories: ${macros.calories}
        Carbs: ${macros.carbs}g
        Fat: ${macros.fat}g
      `.trim();

      // Generate Vector
      const embedding = await generateEmbedding(metadataString);
      if (!embedding) {
        totalSkipped++;
        continue; // Skip if OpenAI failed
      }

      // In DRY_RUN mode, log item name instead of writing to database
      if (DRY_RUN) {
        console.log(`DRY RUN → would ingest: ${item.name}`);
        totalProcessed++;
        continue;
      }

      // Upsert to Supabase (insert or update on conflict)
      // CRITICAL: Always set import_batch_id - this is the authoritative tracking field
      const { error } = await supabase
        .from('menu_items')
        .upsert({
          restaurant_name: restaurantName,
          name: item.name,
          category: item.category,
          image_url: item.image_url || null,
          price_estimate: item.price_estimate || null,
          macros,
          embedding: embedding,
          import_batch_id: importBatchId  // ALWAYS SET - never null
        }, {
          onConflict: 'restaurant_name,name'
        });

      if (error) {
        console.error(`   ❌ Error saving ${item.name}:`, error.message);
        totalSkipped++;
      } else {
        process.stdout.write('.'); // Progress dot
        totalProcessed++;
      }
    }
  }

  console.log(`\n\n✅ Ingestion complete!`);
  console.log(`   Processed: ${totalProcessed} items`);
  if (totalSkipped > 0) {
    console.log(`   Skipped: ${totalSkipped} items`);
  }

  if (DRY_RUN) {
    console.log(`\n🔍 DRY_RUN: Would have upserted ${totalProcessed} items with batch_id: ${importBatchId}`);
    console.log(`\n💡 To actually write to database, run without DRY_RUN=true`);
  } else {
    console.log(`\n📊 Current Batch ID: ${importBatchId}`);
    console.log(`\n🧹 Cleanup SQL Block:`);
    console.log(`   Copy and run the SQL below in Supabase SQL Editor to remove stale rows:`);
    console.log(generateCleanupSQL(importBatchId));
    console.log(`\n🎉 All done!`);
  }
}

ingestData();
