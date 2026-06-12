import { NextResponse } from "next/server";
import { sendPasswordResetEmail } from "@/lib/email/resend";
import { getPublicSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/utils/supabase/admin";

const MAX_BODY_BYTES = 2048;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const passwordResetRateLimit = new Map<string, RateLimitEntry>();

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function isRateLimited(identifier: string) {
  const now = Date.now();
  const existing = passwordResetRateLimit.get(identifier);

  if (!existing || existing.resetAt <= now) {
    passwordResetRateLimit.set(identifier, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  existing.count += 1;

  if (passwordResetRateLimit.size > 1000) {
    for (const [key, entry] of passwordResetRateLimit) {
      if (entry.resetAt <= now) {
        passwordResetRateLimit.delete(key);
      }
    }
  }

  return existing.count > RATE_LIMIT_MAX_ATTEMPTS;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isUserNotFoundError(message?: string) {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes("user not found") || lower.includes("no user found");
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "Request body too large" }, { status: 413 });
    }

    const clientIp = getClientIp(request);
    if (isRateLimited(clientIp)) {
      return NextResponse.json(
        { ok: false, error: "Too many reset attempts. Please try again shortly." },
        { status: 429 },
      );
    }

    const body = await request.json();
    const rawEmail = body?.email;

    if (!rawEmail || typeof rawEmail !== "string") {
      return NextResponse.json({ ok: false, error: "Email is required" }, { status: 400 });
    }

    const email = normalizeEmail(rawEmail);
    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
    }

    const redirectTo = `${getPublicSiteUrl()}/auth/reset-password`;
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (error) {
      if (isUserNotFoundError(error.message)) {
        // Avoid revealing whether an account exists for this email.
        return NextResponse.json({ ok: true });
      }

      console.error("[password-reset] generateLink failed:", error.message);
      return NextResponse.json(
        { ok: false, error: "Could not send reset link. Please try again." },
        { status: 500 },
      );
    }

    const resetLink = data.properties?.action_link;
    if (!resetLink) {
      console.error("[password-reset] generateLink returned no action_link");
      return NextResponse.json(
        { ok: false, error: "Could not send reset link. Please try again." },
        { status: 500 },
      );
    }

    const sendResult = await sendPasswordResetEmail({ to: email, resetLink });
    if (sendResult.error) {
      console.error("[password-reset] Resend failed:", sendResult.error.message);
      return NextResponse.json(
        { ok: false, error: "Could not send reset link. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[password-reset] unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: "Could not send reset link. Please try again." },
      { status: 500 },
    );
  }
}
