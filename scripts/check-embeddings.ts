import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEmbeddings() {
  console.log('🔍 Checking menu_items embeddings...\n');

  // Total rows
  const { count: totalCount, error: countError } = await supabase
    .from('menu_items')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('❌ Error counting rows:', countError.message);
    return;
  }

  console.log(`📊 Total rows: ${totalCount || 0}`);

  // Rows with null embeddings
  const { count: nullCount, error: nullError } = await supabase
    .from('menu_items')
    .select('*', { count: 'exact', head: true })
    .is('embedding', null);

  if (nullError) {
    console.error('❌ Error counting null embeddings:', nullError.message);
    return;
  }

  console.log(`⚠️  Rows with null embedding: ${nullCount || 0}`);

  // Rows with embeddings
  const rowsWithEmbeddings = (totalCount || 0) - (nullCount || 0);
  console.log(`✅ Rows with embeddings: ${rowsWithEmbeddings}`);

  // Check schema - sample a row to see columns
  const { data: sample, error: sampleError } = await supabase
    .from('menu_items')
    .select('*')
    .not('embedding', 'is', null)
    .limit(1)
    .single();

  if (sampleError) {
    console.error('❌ Error fetching sample row:', sampleError.message);
    return;
  }

  if (sample) {
    console.log('\n📋 Sample row structure:');
    console.log('  Columns:', Object.keys(sample).join(', '));
    if (sample.macros) {
      console.log('  macros (sample):', typeof sample.macros === 'object' ? JSON.stringify(sample.macros).substring(0, 100) : sample.macros);
    }
    if (sample.embedding) {
      console.log('  embedding (length):', Array.isArray(sample.embedding) ? sample.embedding.length : 'N/A');
    }
  }

  // Percentage calculation
  if (totalCount && totalCount > 0) {
    const percentage = (rowsWithEmbeddings / totalCount) * 100;
    const percentageDisplay = percentage.toFixed(2);
    console.log(`\n📈 Embedding coverage: ${percentageDisplay}%`);
    
    if (percentage < 90) {
      console.log('\n⚠️  WARNING: Less than 90% of rows have embeddings!');
      console.log('   You may want to run the ingestion script to generate embeddings.');
    } else {
      console.log('\n✅ Good embedding coverage!');
    }
  }
}

checkEmbeddings().catch(console.error);

