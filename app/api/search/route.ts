import { searchHandler } from '@/lib/retrieval/retrieval-engine';
import { buildSearchParams } from '@/lib/search-utils';
import { buildEntitlement, FREE_DAILY_QUERY_LIMIT } from '@/lib/entitlements';
import { getFreeTierCreateAccountLimitMessage, getFreeTierUpgradeLimitMessage } from '@/lib/free-tier';
import {
  confirmPremiumBeforeLimitBlock,
  loadEntitlementData,
} from '@/lib/request-entitlement';
import { recordSearchRequest } from '@/lib/telemetry/recordSearchRequest';

export const dynamic = 'force-dynamic';

const SEARCH_TIMEOUT_MS = 22000; // 22s server timeout (client uses 25s)

export async function POST(req: Request) {
  const startedAt = Date.now();
  let searchParams: Awaited<ReturnType<typeof buildSearchParams>> | undefined;
  let queryText = '';
  let userId: string | null = null;

  try {
    const body = await req.json();
    const includeDebug = process.env.NODE_ENV === 'development' && body?.debug === true;
    const normalizedInput = {
      ...body,
      query: body.query || body.message || '',
    };

    queryText = String(normalizedInput.query ?? '').trim();
    searchParams = await buildSearchParams(normalizedInput);

    const { getRequestUser } = await import('@/utils/supabase/request-user');
    const { hasRemainingUsage, incrementUsageCount } = await import('@/lib/usage-cookie');

    const { supabase, user } = await getRequestUser(req);
    userId = user?.id ?? null;

    let shouldRecordMeteredUsage = false;

    if (user) {
      try {
        const { profile, queriesUsedToday } = await loadEntitlementData(supabase, user.id);
        let entitlement = buildEntitlement({ user, profile, queriesUsedToday });

        if (!entitlement.hasPremiumAccess) {
          const wouldBlock =
            (entitlement.remainingQueriesToday ?? FREE_DAILY_QUERY_LIMIT) <= 0;

          if (wouldBlock) {
            entitlement = await confirmPremiumBeforeLimitBlock(user, entitlement);
          }

          if (!entitlement.hasPremiumAccess) {
            if ((entitlement.remainingQueriesToday ?? FREE_DAILY_QUERY_LIMIT) <= 0) {
              const limitMessage = getFreeTierUpgradeLimitMessage();
              return Response.json({
                error: 'Usage limit reached',
                message: limitMessage,
                usageLimit: true
              }, { status: 403 });
            }

            shouldRecordMeteredUsage = true;
          }
        }
      } catch (entitlementError) {
        // Do not block search when entitlement reads fail (common in WebView).
        console.error('Search entitlement check failed, allowing request:', entitlementError);
      }
    } else {
      const allowed = await hasRemainingUsage();
      if (!allowed) {
        const limitMessage = getFreeTierCreateAccountLimitMessage();
        return Response.json({
          error: 'Usage limit reached',
          message: limitMessage,
          usageLimit: true
        }, { status: 403 });
      }

      shouldRecordMeteredUsage = true;
    }

    const result = await Promise.race([
      searchHandler(searchParams, { includeDebug }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Search timeout')), SEARCH_TIMEOUT_MS)
      ),
    ]);

    void recordSearchRequest({
      userId,
      source: 'api_search',
      queryText,
      searchParams,
      resultsReturned: result.meals?.length ?? 0,
      hasMore: result.hasMore ?? false,
      nextOffset: result.nextOffset,
      durationMs: Date.now() - startedAt,
      success: true,
      restaurantName: searchParams.restaurant,
    });

    if (shouldRecordMeteredUsage) {
      try {
        if (user) {
          await supabase.from('usage_events').insert({
            user_id: user.id,
            event_type: 'metered_query',
            metadata: { source: 'api_search' },
          });
        } else {
          await incrementUsageCount();
        }
      } catch (usageError) {
        console.error('Failed to record metered search usage:', usageError);
      }
    }

    return Response.json(result);
  } catch (error) {
    console.error('Search Route API Error:', error);
    const isTimeout = error instanceof Error && error.message === 'Search timeout';
    void recordSearchRequest({
      userId,
      source: 'api_search',
      queryText,
      searchParams,
      durationMs: Date.now() - startedAt,
      success: false,
      failureReason: isTimeout ? 'timeout' : error instanceof Error ? error.message : 'unknown_error',
    });
    return Response.json(
      { error: isTimeout ? 'Request timed out' : 'Internal Server Error' },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
