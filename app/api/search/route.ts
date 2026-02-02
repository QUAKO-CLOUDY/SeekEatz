import { searchHandler } from './handler';
import { buildSearchParams } from './build-params';

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
    
    // Call searchHandler with consistent shape
    const result = await searchHandler(searchParams);

    return Response.json(result);
  } catch (error) {
    console.error('Search Route API Error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
