import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/utils/supabase/admin';

export type FunnelEventType =
  | 'account_created'
  | 'first_search_with_constraints'
  | 'first_meal_logged';

export interface RecordFunnelEventOptions {
  userId: string;
  eventType: FunnelEventType;
  metadata?: Record<string, unknown>;
  supabase?: SupabaseClient;
}

/**
 * Records a one-time funnel milestone per user (UNIQUE user_id + event_type).
 * Fail-open: never throws.
 */
export async function recordFunnelEvent(
  options: RecordFunnelEventOptions
): Promise<void> {
  try {
    if (!options.userId) {
      return;
    }

    const supabase = options.supabase ?? createAdminClient();
    const { error } = await supabase.from('user_funnel_events').upsert(
      {
        user_id: options.userId,
        event_type: options.eventType,
        metadata: options.metadata ?? null,
      },
      { onConflict: 'user_id,event_type', ignoreDuplicates: true }
    );

    if (error) {
      console.error('[telemetry] Failed to record funnel event:', error.message);
    }
  } catch (error) {
    console.error('[telemetry] Unexpected error recording funnel event:', error);
  }
}
