import { searchHandler } from '@/lib/retrieval/retrieval-engine';
import { buildSearchParams } from '@/lib/search-utils';
import { buildEntitlement, type EntitlementProfileRow, FREE_DAILY_QUERY_LIMIT, PROFILE_ENTITLEMENT_SELECT } from '@/lib/entitlements';
import { getFreeTierCreateAccountLimitMessage, getFreeTierUpgradeLimitMessage } from '@/lib/free-tier';

export const dynamic = 'force-dynamic';

const SEARCH_TIMEOUT_MS = 22000; // 22s server timeout (client uses 25s)

function getUsageWindowStartIso() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const includeDebug = process.env.NODE_ENV === 'development' && body?.debug === true;
    const normalizedInput = {
      ...body,
      query: body.query || body.message || '',
    };

    const searchParams = await buildSearchParams(normalizedInput);

    const { createClient } = await import('@/utils/supabase/server');
    const { hasRemainingUsage, incrementUsageCount } = await import('@/lib/usage-cookie');

    const supabase = await createClient();
    const authPromise = supabase.auth.getUser();
    const authWithTimeout = Promise.race([
      authPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Auth timeout')), 8000)
      ),
    ]);
    const { data: { user } } = await authWithTimeout;

    let shouldRecordMeteredUsage = false;

    if (user) {
      const [{ data: profile }, usageResult] = await Promise.all([
        supabase
          .from('profiles')
          .select(PROFILE_ENTITLEMENT_SELECT)
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('usage_events')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('event_type', 'metered_query')
          .gte('created_at', getUsageWindowStartIso()),
      ]);

      const entitlement = buildEntitlement({
        user,
        profile: profile as EntitlementProfileRow | null,
        queriesUsedToday: usageResult.count ?? 0,
      });

      if (!entitlement.hasPremiumAccess) {
        if ((usageResult.count ?? 0) >= FREE_DAILY_QUERY_LIMIT) {
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
      if (user) {
        await supabase.from('usage_events').insert({
          user_id: user.id,
          event_type: 'metered_query',
          metadata: { source: 'api_search' },
        });
      } else {
        await incrementUsageCount();
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
