import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

/**
 * POST /api/claim-anon-data
 * Claims anonymous data (saved_meals, daily_logs, user_favorites) for authenticated user
 * Requires: device_id in request body
 * Requires: authenticated session
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Verify authenticated session
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - must be authenticated' },
        { status: 401 }
      );
    }

    // Get device_id from request body
    const body = await request.json();
    const { device_id } = body;

    if (!device_id || typeof device_id !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid device_id' },
        { status: 400 }
      );
    }

    // Call the database function to claim anonymous data
    const { data, error } = await supabase.rpc('claim_anon_data', {
      p_device_id: device_id,
    });

    if (error) {
      console.warn('Claim anon data skipped (DB function/column may not exist):', error.message);
      // Return 200 with skipped status instead of 500 — this is non-critical
      // and should never block the signup/login flow
      return NextResponse.json({
        success: false,
        message: 'Anonymous data claim skipped — database not configured for this feature',
        skipped: true,
      });
    }

    // Return success
    return NextResponse.json({
      success: true,
      message: 'Anonymous data claimed successfully',
      claimed: data, // May be null or a count depending on your function implementation
    });
  } catch (error: any) {
    console.error('Unexpected error in claim-anon-data:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

