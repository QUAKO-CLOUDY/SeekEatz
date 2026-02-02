import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiKey = process.env.OPENAI_API_KEY!;

if (!supabaseUrl || !supabaseKey || !openaiKey) {
  console.error('❌ Missing environment variables. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

async function testMatchMenuItems() {
  console.log('🧪 Testing match_menu_items function...\n');

  // Generate an embedding for a test query
  const testQuery = 'meal under 1000 calories';
  console.log(`📝 Test query: "${testQuery}"`);

  try {
    // Generate embedding using OpenAI
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: testQuery,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;
    console.log(`✅ Generated embedding (dimension: ${queryEmbedding.length})\n`);

    // Call the RPC function
    console.log('🔍 Calling match_menu_items RPC...');
    const { data, error } = await supabase.rpc('match_menu_items', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5, // Adjust threshold as needed
      match_count: 100, // Get more than 20 to verify
    });

    if (error) {
      console.error('❌ RPC Error:', error);
      console.error('   Message:', error.message);
      console.error('   Details:', error.details);
      console.error('   Hint:', error.hint);
      return;
    }

    if (!data || !Array.isArray(data)) {
      console.error('❌ Invalid response: data is not an array');
      console.error('   Response:', data);
      return;
    }

    console.log(`✅ Function returned ${data.length} rows\n`);

    if (data.length < 20) {
      console.log('⚠️  WARNING: Function returned fewer than 20 rows');
      console.log(`   Expected: at least 20 rows`);
      console.log(`   Got: ${data.length} rows`);
      console.log('\n   Try lowering the match_threshold (currently 0.5)');
    } else {
      console.log(`✅ SUCCESS: Function returned ${data.length} rows (>= 20)\n`);
    }

    // Check the structure of returned rows
    if (data.length > 0) {
      const firstRow = data[0];
      console.log('📋 Sample row structure:');
      console.log('   Columns:', Object.keys(firstRow).join(', '));
      console.log('\n📄 First row sample:');
      console.log('   id:', firstRow.id);
      console.log('   restaurant_name:', firstRow.restaurant_name);
      console.log('   name:', firstRow.name);
      console.log('   macros:', typeof firstRow.macros === 'object' ? JSON.stringify(firstRow.macros) : firstRow.macros);
      console.log('   image_url:', firstRow.image_url);
      console.log('   price_estimate:', firstRow.price_estimate);
      console.log('   similarity:', firstRow.similarity);

      // Verify required columns exist
      const requiredColumns = ['id', 'restaurant_name', 'name', 'macros', 'image_url', 'price_estimate', 'similarity'];
      const missingColumns = requiredColumns.filter(col => !(col in firstRow));
      
      if (missingColumns.length > 0) {
        console.error(`\n❌ Missing required columns: ${missingColumns.join(', ')}`);
      } else {
        console.log('\n✅ All required columns present');
      }

      // Check macros structure
      if (firstRow.macros && typeof firstRow.macros === 'object') {
        const macroKeys = Object.keys(firstRow.macros);
        console.log(`\n✅ Macros is a JSON object with keys: ${macroKeys.join(', ')}`);
        if (firstRow.macros.calories !== undefined) {
          console.log(`   Sample calories value: ${firstRow.macros.calories}`);
        }
      } else {
        console.error('\n❌ Macros is not a JSON object:', firstRow.macros);
      }
    }

    // Show distribution of similarity scores
    if (data.length > 0) {
      const similarities = data.map((row: any) => row.similarity || 0).sort((a: number, b: number) => b - a);
      console.log(`\n📊 Similarity score distribution:`);
      console.log(`   Highest: ${similarities[0]?.toFixed(4)}`);
      console.log(`   Lowest: ${similarities[similarities.length - 1]?.toFixed(4)}`);
      console.log(`   Average: ${(similarities.reduce((a: number, b: number) => a + b, 0) / similarities.length).toFixed(4)}`);
    }

  } catch (err: any) {
    console.error('❌ Error during test:', err.message);
    console.error(err);
  }
}

testMatchMenuItems().catch(console.error);

