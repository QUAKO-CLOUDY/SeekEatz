import { cookies, headers } from "next/headers";
import { createHmac } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { FREE_DAILY_QUERY_LIMIT } from "@/lib/entitlements";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const SECRET_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "default-secret-key-do-not-use-in-prod";
const COOKIE_NAME = "usage_token";

function sign(value: string) {
  const hmac = createHmac("sha256", SECRET_KEY);
  hmac.update(value);
  return hmac.digest("hex");
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function encodeToken(dateKey: string, count: number) {
  const payload = `${dateKey}:${count}`;
  return `${payload}.${sign(payload)}`;
}

function decodeToken(token?: string | null): { dateKey: string; count: number } | null {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) {
    return null;
  }

  const [dateKey, countRaw] = payload.split(":");
  const count = Number.parseInt(countRaw ?? "0", 10);
  if (!dateKey || !Number.isFinite(count)) {
    return null;
  }

  return { dateKey, count: Math.max(0, count) };
}

export async function getUsageCount(): Promise<number> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const parsed = decodeToken(token);
  if (!parsed || parsed.dateKey !== getTodayKey()) {
    return 0;
  }

  return parsed.count;
}

async function getIpAddress(): Promise<string> {
  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return "unknown";
}

async function getIpUsage(ip: string): Promise<number> {
  if (ip === "unknown") {
    return 0;
  }

  try {
    const { data, error } = await supabase
      .from("ip_usage")
      .select("usage_count, updated_at")
      .eq("ip", ip)
      .single();

    if (error || !data) {
      return 0;
    }

    const lastUpdatedDate = String(data.updated_at ?? "").slice(0, 10);
    if (lastUpdatedDate !== getTodayKey()) {
      return 0;
    }

    return Number(data.usage_count ?? 0) || 0;
  } catch {
    return 0;
  }
}

async function incrementIpUsage(ip: string): Promise<number> {
  if (ip === "unknown") {
    return 0;
  }

  try {
    const current = await getIpUsage(ip);
    const next = current + 1;

    const { error } = await supabase
      .from("ip_usage")
      .upsert(
        {
          ip,
          usage_count: next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "ip" },
      );

    if (error) {
      console.warn("IP usage tracking failed:", error.message);
      return 0;
    }

    return next;
  } catch (error) {
    console.warn("IP usage tracking exception:", error);
    return 0;
  }
}

export async function incrementUsageCount(): Promise<number> {
  const currentCookieCount = await getUsageCount();
  const ip = await getIpAddress();
  const nextCookieCount = currentCookieCount + 1;
  const nextIpCount = await incrementIpUsage(ip);
  const next = Math.max(nextCookieCount, nextIpCount);
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, encodeToken(getTodayKey(), next), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
    sameSite: "lax",
  });

  return next;
}

export async function hasRemainingUsage(): Promise<boolean> {
  const currentCount = Math.max(await getUsageCount(), await getIpUsage(await getIpAddress()));
  return currentCount < FREE_DAILY_QUERY_LIMIT;
}

export function getUsageLimit(): number {
  return FREE_DAILY_QUERY_LIMIT;
}
