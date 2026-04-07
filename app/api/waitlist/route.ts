import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const MAX_BODY_BYTES = 4096;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

type WaitlistRateLimitEntry = {
  count: number;
  resetAt: number;
};

type WaitlistRpcResult = {
  ok?: boolean;
  error?: string;
  free_month?: boolean;
  duplicate?: boolean;
};

const waitlistRateLimit = new Map<string, WaitlistRateLimitEntry>();

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

function isRateLimited(identifier: string) {
  const now = Date.now();
  const existing = waitlistRateLimit.get(identifier);

  if (!existing || existing.resetAt <= now) {
    waitlistRateLimit.set(identifier, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  existing.count += 1;

  if (waitlistRateLimit.size > 1000) {
    for (const [key, entry] of waitlistRateLimit) {
      if (entry.resetAt <= now) {
        waitlistRateLimit.delete(key);
      }
    }
  }

  return existing.count > RATE_LIMIT_MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, error: 'Request body too large' },
        { status: 413 }
      );
    }

    const clientIp = getClientIp(request);
    if (isRateLimited(clientIp)) {
      return NextResponse.json(
        { ok: false, error: 'Too many waitlist attempts. Please try again shortly.' },
        { status: 429 }
      );
    }

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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Waitlist API missing Supabase server configuration.');
      return NextResponse.json(
        { ok: false, error: 'Waitlist is temporarily unavailable' },
        { status: 500 }
      );
    }

    // Use service role client to bypass RLS for waitlist inserts
    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
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
    let result: WaitlistRpcResult = data as WaitlistRpcResult;
    if (typeof data === 'string') {
      try {
        result = JSON.parse(data) as WaitlistRpcResult;
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

