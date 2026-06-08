import { searchHandler } from '@/lib/retrieval/retrieval-engine';
import { buildSearchParams } from '@/lib/search-utils';
import { FREE_DAILY_QUERY_LIMIT } from '@/lib/entitlements';
import { getFreeTierCreateAccountLimitMessage, getFreeTierUpgradeLimitMessage } from '@/lib/free-tier';
import { getRequestEntitlement } from '@/lib/request-entitlement';

export const dynamic = 'force-dynamic';

const SEARCH_TIMEOUT_MS = 22000; // 22s server timeout (client uses 25s)

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const includeDebug = process.env.NODE_ENV === 'development' && body?.debug === true;
    const normalizedInput = {
      ...body,
      query: body.query || body.message || '',
    };

    const searchParams = await buildSearchParams(normalizedInput);

    const { hasRemainingUsage, incrementUsageCount } = await import('@/lib/usage-cookie');

    const authWithTimeout = Promise.race([
      getRequestEntitlement(req),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Auth timeout')), 8000)
      ),
    ]);
    const { supabase, user, entitlement } = await authWithTimeout;

    let shouldRecordMeteredUsage = false;

    if (user) {
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
    const isTimeout = error instanceof Error && (error.message === 'Auth timeout' || error.message === 'Search timeout');
    return Response.json(
      { error: isTimeout ? 'Request timed out' : 'Internal Server Error' },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
