import { cookies } from "next/headers";
import { createHmac } from "crypto";
import { FREE_DAILY_QUERY_LIMIT } from "@/lib/entitlements";

const COOKIE_NAME = "usage_token";
const ROLLING_USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

function getUsageTokenSecret() {
  const secret = process.env.USAGE_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (secret) {
    return secret;
  }

  throw new Error("Missing env: USAGE_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY");
}

function sign(value: string) {
  const hmac = createHmac("sha256", getUsageTokenSecret());
  hmac.update(value);
  return hmac.digest("hex");
}

function getWindowStartMs(now = Date.now()) {
  return now - ROLLING_USAGE_WINDOW_MS;
}

function pruneUsageTimestamps(timestamps: number[], now = Date.now()) {
  const windowStart = getWindowStartMs(now);

  return timestamps
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp >= windowStart && timestamp <= now)
    .sort((a, b) => a - b)
    .slice(-FREE_DAILY_QUERY_LIMIT);
}

function encodeToken(timestamps: number[]) {
  const normalized = pruneUsageTimestamps(timestamps);
  const payload = normalized.join(",");
  return `${payload}.${sign(payload)}`;
}

function decodeLegacyToken(payload: string): number[] {
  const [dateKey, countRaw] = payload.split(":");
  const count = Number.parseInt(countRaw ?? "0", 10);

  if (!dateKey || !Number.isFinite(count) || count <= 0) {
    return [];
  }

  // Best-effort fallback for old signed cookies. They will naturally age out
  // once the new rolling window token is written after the next guest chat.
  return Array.from({ length: Math.min(count, FREE_DAILY_QUERY_LIMIT) }, () => Date.now());
}

function decodeToken(token?: string | null): number[] {
  if (!token) {
    return [];
  }

  const [payload, signature] = token.split(".");
  if (payload == null || signature == null || sign(payload) !== signature) {
    return [];
  }

  if (!payload) {
    return [];
  }

  if (payload.includes(":")) {
    return decodeLegacyToken(payload);
  }

  const parsed = payload
    .split(",")
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));

  return pruneUsageTimestamps(parsed);
}

async function persistUsageToken(timestamps: number[]) {
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, encodeToken(timestamps), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
    sameSite: "lax",
  });
}

export async function getUsageCount(): Promise<number> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return decodeToken(token).length;
}

export async function incrementUsageCount(): Promise<number> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const timestamps = decodeToken(token);
  const nextTimestamps = pruneUsageTimestamps([...timestamps, Date.now()]);

  await persistUsageToken(nextTimestamps);
  return nextTimestamps.length;
}

export async function hasRemainingUsage(): Promise<boolean> {
  return (await getUsageCount()) < FREE_DAILY_QUERY_LIMIT;
}

export function getUsageLimit(): number {
  return FREE_DAILY_QUERY_LIMIT;
}
