import type { SupabaseClient } from '@supabase/supabase-js';
import {
  recordSearchRequest,
  type RecordSearchRequestOptions,
  type SearchRequestSource,
} from '@/lib/telemetry/recordSearchRequest';

export type { SearchRequestSource };
export type SearchRequestTelemetryPayload = Omit<
  RecordSearchRequestOptions,
  'userId' | 'source' | 'queryText' | 'durationMs' | 'success' | 'searchParams'
> & {
  source: SearchRequestSource;
  query_text: string;
  results_returned: number;
  has_more: boolean;
  duration_ms: number;
  success: boolean;
  failure_reason?: string;
  constraints?: Record<string, unknown>;
};

/**
 * @deprecated Prefer recordSearchRequest on the server. Kept for backwards compatibility.
 */
export async function logSearchRequest(
  supabaseClient: SupabaseClient,
  payload: SearchRequestTelemetryPayload
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    await recordSearchRequest({
      supabase: supabaseClient,
      userId: user?.id ?? null,
      source: payload.source,
      queryText: payload.query_text,
      resultsReturned: payload.results_returned,
      hasMore: payload.has_more,
      nextOffset: payload.next_offset,
      durationMs: payload.duration_ms,
      success: payload.success,
      failureReason: payload.failure_reason,
      intent: payload.intent,
      strategy: payload.strategy,
      restaurantId: payload.restaurant_id,
      restaurantName: payload.restaurant_name,
      appliedFilters: payload.applied_filters,
    });
  } catch (error) {
    console.error('[telemetry] Unexpected error in logSearchRequest:', error);
  }
}
