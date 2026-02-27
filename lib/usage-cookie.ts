
import { cookies, headers } from 'next/headers';
import { createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase admin client if service key is available
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    }
});

// Use a secure key if available, fallback to anon key or hardcoded string
// In production, this should be a robust secret env var
const SECRET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'default-secret-key-do-not-use-in-prod';
const COOKIE_NAME = 'usage_token';
const MAX_USAGE = 3; // 3 free searches/chats for unregistered users

function sign(value: string) {
    const hmac = createHmac('sha256', SECRET_KEY);
    hmac.update(value);
    return hmac.digest('hex');
}

export async function getUsageCount(): Promise<number> {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return 0;

    const [countStr, signature] = token.split('.');
    if (!countStr || !signature) return 0;

    const expectedSignature = sign(countStr);
    if (signature !== expectedSignature) return 0; // Invalid signature means tampering

    return parseInt(countStr, 10) || 0;
}

async function getIpAddress(): Promise<string> {
    const headersList = await headers();
    const forwardedFor = headersList.get('x-forwarded-for');
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }
    return 'unknown';
}

async function getIpUsage(ip: string): Promise<number> {
    if (ip === 'unknown') return 0;
    try {
        const { data, error } = await supabase
            .from('ip_usage')
            .select('usage_count')
            .eq('ip', ip)
            .single();

        if (error) return 0;
        return data?.usage_count || 0;
    } catch (e) {
        // Ignore errors (table missing, connection failed, etc.)
        return 0;
    }
}

async function incrementIpUsage(ip: string): Promise<number> {
    if (ip === 'unknown') return 0;
    try {
        // Upsert: increment if exists, insert 1 if not
        // Note: This is a bit racy without an RPC or explicit transaction, but fine for MVP
        // Better strategy: fetch, increment, upsert
        const current = await getIpUsage(ip);
        const next = current + 1;

        const { error } = await supabase
            .from('ip_usage')
            .upsert({ ip, usage_count: next, updated_at: new Date().toISOString() }, { onConflict: 'ip' });

        if (error) {
            console.warn('IP usage tracking failed:', error.message);
            return 0;
        }
        return next;
    } catch (e) {
        console.warn('IP usage tracking exception:', e);
        return 0;
    }
}

export async function incrementUsageCount(): Promise<number> {
    const currentCookie = await getUsageCount();
    const headersList = await headers();
    const ip = await getIpAddress();

    // Cookie increment
    const nextCookie = currentCookie + 1;

    // IP increment (fire and forget mostly, but we await to capture the strict limit)
    const nextIp = await incrementIpUsage(ip);

    // Use the maximum of cookie or IP usage
    const next = Math.max(nextCookie, nextIp);

    const signature = sign(next.toString());
    const token = `${next}.${signature}`;

    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
        sameSite: 'lax',
    });

    return next;
}

export async function hasRemainingUsage(): Promise<boolean> {
    const headersList = await headers();
    if (process.env.NODE_ENV === 'development' && headersList.get('x-bypass-usage') === 'seekeatz-test') {
        return true;
    }

    const cookieCount = await getUsageCount();
    const ip = await getIpAddress();
    const ipCount = await getIpUsage(ip);

    const count = Math.max(cookieCount, ipCount);

    return count < MAX_USAGE;
}

export function getUsageLimit(): number {
    return MAX_USAGE;
}
