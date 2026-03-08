import { searchHandler } from './handler';
import { buildSearchParams } from '@/lib/search-utils';

export const dynamic = 'force-dynamic';

const SEARCH_TIMEOUT_MS = 22000; // 22s server timeout (client uses 25s)

export async function POST(req: Request) {
  try {
    const body = await req.json();
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

    if (!user) {
      const allowed = await hasRemainingUsage();
      if (!allowed) {
        return Response.json({
          error: 'Usage limit reached',
          message: 'You have reached the free usage limit. Please sign up to continue.',
          usageLimit: true
        }, { status: 403 });
      }
    }

    const result = await Promise.race([
      searchHandler(searchParams),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Search timeout')), SEARCH_TIMEOUT_MS)
      ),
    ]);

    if (!user) {
      await incrementUsageCount();
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
