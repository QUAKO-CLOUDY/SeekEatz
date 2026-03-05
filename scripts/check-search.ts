import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  // Total rows
  const { count } = await supabase.from('menu_items').select('*', { count: 'exact', head: true });
  console.log('Total menu_items:', count);

  // Generate embedding
  const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: 'grilled chicken salad' });
  const emb = res.data[0].embedding;
  console.log('Embedding dim:', emb.length);

  // Test at various thresholds and match_counts
  for (const [threshold, match_count] of [[-1.0, 10], [-1.0, 100], [-1.0, 1000], [0.3, 1000]]) {
    const { data, error } = await supabase.rpc('match_menu_items', {
      query_embedding: emb,
      match_threshold: threshold,
      match_count: match_count
    });
    console.log(`threshold ${threshold}, match_count ${match_count} -> ${data?.length ?? 0} rows${error ? ' ERR:' + error.message : ''}`);
  }

  // Show top results with scores
  const { data: top } = await supabase.rpc('match_menu_items', {
    query_embedding: emb,
    match_threshold: -1.0,
    match_count: 10
  });
  console.log('\nTop results:');
  top?.forEach((r: any) => console.log(` ${r.similarity?.toFixed(4)}  ${r.restaurant_name} - ${r.name}`));
}

main().catch(console.error);
