import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SearchParams } from '@/app/types';
import { createAdminClient } from '@/utils/supabase/admin';
import { recordFunnelEvent } from '@/lib/telemetry/recordFunnelEvent';
import {
  buildConstraintsPayload,
  searchParamsHaveConstraints,
} from '@/lib/telemetry/search-constraints';

export type SearchRequestSource = 'chat' | 'home_search' | 'api_search';

export interface RecordSearchRequestOptions {
  userId?: string | null;
  source: SearchRequestSource;
  queryText: string;
  searchParams?: SearchParams;
  resultsReturned?: number;
  hasMore?: boolean;
  nextOffset?: number;
  durationMs: number;
  success: boolean;
  failureReason?: string;
  intent?: string;
  strategy?: string;
  restaurantId?: string;
  restaurantName?: string;
  appliedFilters?: Record<string, unknown>;
  /** Defaults to service role (server-side analytics insert). */
  supabase?: SupabaseClient;
}

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

function hashQuery(query: string): string {
  return createHash('sha256').update(normalizeQuery(query)).digest('hex');
}

/**
 * Logs a search to search_requests and records first_search_with_constraints when applicable.
 * Fail-open: never throws.
 */
export async function recordSearchRequest(
  options: RecordSearchRequestOptions
): Promise<void> {
  try {
    const supabase = options.supabase ?? createAdminClient();
    const queryText = options.queryText.trim();
    if (!queryText) {
      return;
    }

    const constraintsPayload =
      options.searchParams != null
        ? buildConstraintsPayload(options.searchParams, queryText)
        : null;

    const record = {
      user_id: options.userId ?? null,
      source: options.source,
      query_text: queryText,
      query_hash: hashQuery(queryText),
      intent: options.intent ?? null,
      strategy: options.strategy ?? null,
      restaurant_id: options.restaurantId ?? null,
      restaurant_name: options.restaurantName ?? null,
      constraints: constraintsPayload,
      applied_filters: options.appliedFilters ?? null,
      results_returned: options.resultsReturned ?? 0,
      has_more: options.hasMore ?? false,
      next_offset: options.nextOffset ?? null,
      duration_ms: Math.max(0, Math.round(options.durationMs)),
      success: options.success,
      failure_reason: options.failureReason ?? null,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('search_requests').insert(record);
    if (error) {
      console.error('[telemetry] Failed to log search request:', error.message);
      return;
    }

    if (
      options.userId &&
      options.success &&
      options.searchParams &&
      searchParamsHaveConstraints(options.searchParams, queryText)
    ) {
      await recordFunnelEvent({
        supabase,
        userId: options.userId,
        eventType: 'first_search_with_constraints',
        metadata: {
          source: options.source,
          query_text: queryText,
          constraints: constraintsPayload,
          results_returned: options.resultsReturned ?? 0,
        },
      });
    }
  } catch (error) {
    console.error('[telemetry] Unexpected error logging search request:', error);
  }
}
