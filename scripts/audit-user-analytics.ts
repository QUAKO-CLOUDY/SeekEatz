import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type SearchRequestRow = {
  query_text: string;
  query_hash: string;
  source: string;
  success: boolean;
  failure_reason: string | null;
  results_returned: number;
  duration_ms: number;
  created_at: string;
};

type UsageEventRow = {
  event_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type FunnelMetricsRow = {
  day: string;
  accounts_created: number;
  first_search_with_constraints: number;
  first_meal_logged: number;
  dropoff_account_to_search: number;
  dropoff_search_to_meal: number;
  pct_account_to_search: number | null;
  pct_search_to_meal: number | null;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in environment (.env.local).`);
  }
  return value;
}

function formatPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `${value.toFixed(1)}%`;
}

function groupCount<T>(rows: T[], keyFn: (row: T) => string): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const key = keyFn(row);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

async function main() {
  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    profilesRes,
    searchRes,
    usageRes,
    funnelRes,
    funnelMetricsRes,
    chatSessionsRes,
    messagesRes,
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase
      .from('search_requests')
      .select('query_text, query_hash, source, success, failure_reason, results_returned, duration_ms, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase
      .from('usage_events')
      .select('event_type, metadata, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase
      .from('user_funnel_events')
      .select('event_type, created_at')
      .gte('created_at', since),
    supabase.from('daily_funnel_metrics').select('*').limit(30),
    supabase.from('chat_sessions').select('*', { count: 'exact', head: true }),
    supabase.from('messages').select('*', { count: 'exact', head: true }),
  ]);

  if (searchRes.error?.message.includes('does not exist')) {
    console.log('\n⚠️  Analytics tables are not applied yet.');
    console.log('Run the migration: supabase/migrations/20260616000017_user_analytics_and_chat_persistence.sql');
    console.log('(Supabase Dashboard → SQL Editor, or `supabase db push`)\n');
  }

  const searches = (searchRes.data ?? []) as SearchRequestRow[];
  const usageEvents = (usageRes.data ?? []) as UsageEventRow[];
  const funnelEvents = funnelRes.data ?? [];
  const funnelMetrics = (funnelMetricsRes.data ?? []) as FunnelMetricsRow[];

  const successfulSearches = searches.filter((row) => row.success);
  const failedSearches = searches.filter((row) => !row.success);
  const avgDuration =
    searches.length > 0
      ? Math.round(searches.reduce((sum, row) => sum + row.duration_ms, 0) / searches.length)
      : 0;
  const zeroResultSearches = successfulSearches.filter((row) => row.results_returned === 0);

  const queryCounts = groupCount(searches, (row) => row.query_text.toLowerCase().trim());
  const topQueries = Object.entries(queryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  const failureCounts = groupCount(
    failedSearches,
    (row) => row.failure_reason ?? 'unknown'
  );

  const usageByType = groupCount(usageEvents, (row) => row.event_type);
  const funnelByType = groupCount(funnelEvents, (row) => row.event_type);

  const chatSubmits = usageEvents.filter((row) => row.event_type === 'chat_submit');
  const submitsWithQueryText = chatSubmits.filter((row) => typeof row.metadata?.queryText === 'string');

  console.log('\n=== SeekEatz User Analytics (last 30 days) ===\n');
  console.log(`Profiles total: ${profilesRes.count ?? 0}`);
  console.log(`Chat sessions: ${chatSessionsRes.count ?? 0}`);
  console.log(`Chat messages: ${messagesRes.count ?? 0}`);
  console.log(`Search requests: ${searches.length}`);
  console.log(`Usage events: ${usageEvents.length}`);

  console.log('\n--- Search health ---');
  console.log(`Success rate: ${searches.length ? ((successfulSearches.length / searches.length) * 100).toFixed(1) : '0.0'}%`);
  console.log(`Failures: ${failedSearches.length}`);
  console.log(`Zero-result (successful): ${zeroResultSearches.length}`);
  console.log(`Avg latency: ${avgDuration} ms`);
  console.log(`By source: ${JSON.stringify(groupCount(searches, (row) => row.source))}`);

  if (Object.keys(failureCounts).length > 0) {
    console.log('\n--- Failure reasons ---');
    for (const [reason, count] of Object.entries(failureCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`${count}x  ${reason}`);
    }
  }

  if (topQueries.length > 0) {
    console.log('\n--- Top queries ---');
    for (const [query, count] of topQueries) {
      console.log(`${count}x  ${query}`);
    }
  }

  console.log('\n--- Usage events ---');
  for (const [eventType, count] of Object.entries(usageByType).sort((a, b) => b[1] - a[1])) {
    console.log(`${eventType}: ${count}`);
  }
  console.log(`chat_submit with queryText metadata: ${submitsWithQueryText.length}/${chatSubmits.length}`);

  console.log('\n--- Funnel milestones (last 30 days) ---');
  for (const [eventType, count] of Object.entries(funnelByType).sort((a, b) => b[1] - a[1])) {
    console.log(`${eventType}: ${count}`);
  }

  if (funnelMetrics.length > 0) {
    console.log('\n--- Daily funnel drop-off ---');
    console.log(
      'day | accounts | first_search | first_meal | drop A→S | drop S→M | % A→S | % S→M'
    );
    for (const row of funnelMetrics.slice(0, 14)) {
      console.log(
        `${row.day} | ${row.accounts_created} | ${row.first_search_with_constraints} | ${row.first_meal_logged} | ${row.dropoff_account_to_search} | ${row.dropoff_search_to_meal} | ${formatPct(row.pct_account_to_search)} | ${formatPct(row.pct_search_to_meal)}`
      );
    }
  } else if (!funnelMetricsRes.error) {
    console.log('\n--- Daily funnel drop-off ---');
    console.log('No funnel data yet.');
  } else {
    console.log('\n--- Daily funnel drop-off ---');
    console.log(`View unavailable: ${funnelMetricsRes.error.message}`);
  }

  console.log('\nDone.\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
