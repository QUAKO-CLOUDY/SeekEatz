import { NextResponse } from 'next/server';
import { searchHandler } from '@/lib/retrieval/retrieval-engine';
import { buildSearchParams } from '@/lib/search-utils';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Debug search endpoint is only available in development.' },
      { status: 404 }
    );
  }

  try {
    const body = await req.json();
    const normalizedInput = {
      ...body,
      query: body.query || body.message || '',
    };

    const searchParams = await buildSearchParams(normalizedInput);
    const result = await searchHandler(searchParams, { includeDebug: true });

    return NextResponse.json({
      query: normalizedInput.query,
      searchParams,
      resultSummary: {
        totalCount: result.totalCount,
        returnedCount: result.meals.length,
        hasMore: result.hasMore,
        nextOffset: result.nextOffset,
        searchKey: result.searchKey,
      },
      meals: result.meals,
      debugInfo: result.debugInfo,
    });
  } catch (error) {
    console.error('[api/search/debug] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to inspect search.' },
      { status: 500 }
    );
  }
}
