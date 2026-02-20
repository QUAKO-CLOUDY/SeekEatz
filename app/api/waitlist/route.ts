import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    // Basic email validation (additional validation happens in the RPC function)
    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Use service role client to bypass RLS for waitlist inserts
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Call the atomic RPC function
    const { data, error } = await supabase.rpc('join_waitlist', {
      email_input: trimmedEmail
    });

    if (error) {
      console.error('Waitlist RPC error:', error);
      return NextResponse.json(
        { ok: false, error: 'Failed to add email to waitlist' },
        { status: 500 }
      );
    }

    // The RPC function returns JSON, Supabase should parse it automatically
    // But handle both string and object cases for safety
    let result: any = data;
    if (typeof data === 'string') {
      try {
        result = JSON.parse(data);
      } catch (e) {
        console.error('Failed to parse RPC result:', e);
        return NextResponse.json(
          { ok: false, error: 'Invalid response from server' },
          { status: 500 }
        );
      }
    }

    // Check if the function returned an error
    if (!result || !result.ok) {
      return NextResponse.json(
        { ok: false, error: result?.error || 'Failed to process signup' },
        { status: result?.ok === false ? 400 : 500 }
      );
    }

    // Return the result with the expected API format
    return NextResponse.json(
      {
        ok: true,
        freeMonth: result.free_month || false,
        duplicate: result.duplicate || false
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Waitlist API error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

