import { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

/**
 * Normalizes a query string for hashing (lowercase, trim, remove extra spaces)
 */
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Generates SHA256 hash of normalized query string
 */
function hashQuery(query: string): string {
  const normalized = normalizeQuery(query);
  return createHash('sha256').update(normalized).digest('hex');
}

export interface SearchRequestTelemetryPayload {
  source: 'chat' | 'home_search';
  query_text: string;
  intent?: string;
  strategy?: string;
  restaurant_id?: string;
  restaurant_name?: string;
  constraints?: {
    calorieCap?: number;
    minProtein?: number;
    maxCarbs?: number;
    maxFat?: number;
    restaurant?: string;
    [key: string]: any;
  };
  applied_filters?: {
    dishType?: string;
    protein?: string;
    [key: string]: any;
  };
  results_returned: number;
  has_more: boolean;
  next_offset?: number;
  duration_ms: number;
  success: boolean;
  failure_reason?: string;
}

/**
 * Logs a search request to Supabase telemetry table
 * Fail-open: never throws, silently fails if telemetry insert fails
 */
export async function logSearchRequest(
  supabaseClient: SupabaseClient,
  payload: SearchRequestTelemetryPayload
): Promise<void> {
  try {
    // Get authenticated user ID
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    // Only log for authenticated users
    if (!user) {
      return;
    }

    // Generate query hash
    const query_hash = hashQuery(payload.query_text);

    // Prepare telemetry record
    const telemetryRecord: any = {
      user_id: user.id,
      source: payload.source,
      query_text: payload.query_text,
      query_hash,
      intent: payload.intent || null,
      strategy: payload.strategy || null,
      restaurant_id: payload.restaurant_id || null,
      restaurant_name: payload.restaurant_name || null,
      constraints: payload.constraints ? JSON.stringify(payload.constraints) : null,
      applied_filters: payload.applied_filters ? JSON.stringify(payload.applied_filters) : null,
      results_returned: payload.results_returned,
      has_more: payload.has_more,
      next_offset: payload.next_offset || null,
      duration_ms: payload.duration_ms,
      success: payload.success,
      failure_reason: payload.failure_reason || null,
      created_at: new Date().toISOString(),
    };

    // Insert into search_requests table
    // Fail-open: catch and log errors but don't throw
    const { error } = await supabaseClient
      .from('search_requests')
      .insert(telemetryRecord);

    if (error) {
      // Log error but don't throw - fail-open behavior
      console.error('[telemetry] Failed to log search request:', error.message);
    }
  } catch (error) {
    // Catch any unexpected errors (e.g., getUser() fails)
    // Log but don't throw - fail-open behavior
    console.error('[telemetry] Unexpected error logging search request:', error);
  }
}



