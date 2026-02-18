import { searchHandler } from './handler';
import { buildSearchParams } from '@/lib/search-utils';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // This endpoint is purely for executing the search
    // called by the "Load More" button or internally by the Chat Router

    // Normalize input: searchKey is the single source of truth for pagination
    // Don't clear query - let searchHandler reconstruct from searchKey if present
    const normalizedInput = {
      ...body,
      query: body.query || body.message || '',
    };

    // Build normalized SearchParams using unified function
    const searchParams = await buildSearchParams(normalizedInput);

    // Check authentication and usage limits
    const { createClient } = await import('@/utils/supabase/server');
    const { hasRemainingUsage, incrementUsageCount, getUsageCount } = await import('@/lib/usage-cookie');

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // If not authenticated, check usage limit
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

    // Call searchHandler with consistent shape
    const result = await searchHandler(searchParams);

    // Increment usage count for unauthenticated users
    if (!user) {
      await incrementUsageCount();
    }

    return Response.json(result);
  } catch (error) {
    console.error('Search Route API Error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
