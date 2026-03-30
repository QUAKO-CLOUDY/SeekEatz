/**
 * scripts/reimport-json.ts
 *
 * Reimports all JSON restaurant files through the new ingestion pipeline.
 * Safe to run multiple times — upserts on (restaurant_name, name).
 * Preserves existing embeddings since it doesn't touch the embedding column.
 *
 * Usage:
 *   npx tsx scripts/reimport-json.ts
 *
 * Environment required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { JobRunner } from '../lib/ingestion/job-runner';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

const jsonDir = path.join(process.cwd(), 'data', 'jsons');

const runner = new JobRunner(supabase);
runner.runJSONImport(jsonDir).then(() => {
  console.log('\n✅ Done.');
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Fatal:', err);
  process.exit(1);
});
