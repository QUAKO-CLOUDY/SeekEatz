import type { User } from "@supabase/supabase-js";
import { isFullAccessEmail, normalizeEmail } from "@/lib/full-access";

export const FREE_DAILY_QUERY_LIMIT = 2;
export const MONTHLY_PLAN_PRICE = 8.99;
export const YEARLY_PLAN_PRICE = 39.99;
export const WAITLIST_TRIAL_DAYS = 30;

export type BillingTier = "free" | "monthly" | "yearly";
export type BillingStatus = "guest" | "inactive" | "trialing" | "active" | "canceled" | "past_due";
export type TrialSource = "waitlist" | null;

export type EntitlementProfileRow = {
  has_completed_onboarding?: boolean | null;
  subscription_tier?: BillingTier | null;
  subscription_status?: Exclude<BillingStatus, "guest"> | null;
  trial_source?: TrialSource;
  trial_expires_at?: string | null;
  waitlist_free_month_redeemed_at?: string | null;
  waitlist_free_month_email?: string | null;
};

export type AppEntitlement = {
  isAuthenticated: boolean;
  userId: string | null;
  email: string | null;
  hasCompletedOnboarding: boolean;
  billingTier: BillingTier;
  billingStatus: BillingStatus;
  trialSource: TrialSource;
  trialExpiresAt: string | null;
  hasPremiumAccess: boolean;
  dailyQueryLimit: number | null;
  waitlistFreeMonthRedeemedAt: string | null;
  waitlistFreeMonthEmail: string | null;
  remainingQueriesToday: number | null;
};

export const ENTITLEMENT_CACHE_KEY = "seekeatz_account_entitlement";

// Only columns that exist in production profiles. has_completed_onboarding is
// read separately where needed — including it here breaks every entitlement
// query on databases that have not run the onboarding migration yet.
export const PROFILE_ENTITLEMENT_SELECT = [
  "subscription_tier",
  "subscription_status",
  "trial_source",
  "trial_expires_at",
  "waitlist_free_month_redeemed_at",
  "waitlist_free_month_email",
].join(",");

export const GUEST_ENTITLEMENT: AppEntitlement = {
  isAuthenticated: false,
  userId: null,
  email: null,
  hasCompletedOnboarding: false,
  billingTier: "free",
  billingStatus: "guest",
  trialSource: null,
  trialExpiresAt: null,
  hasPremiumAccess: false,
  dailyQueryLimit: FREE_DAILY_QUERY_LIMIT,
  waitlistFreeMonthRedeemedAt: null,
  waitlistFreeMonthEmail: null,
  remainingQueriesToday: FREE_DAILY_QUERY_LIMIT,
};

export function isTrialStillActive(trialExpiresAt?: string | null): boolean {
  if (!trialExpiresAt) {
    return false;
  }

  const timestamp = Date.parse(trialExpiresAt);
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return timestamp > Date.now();
}

export function hasActiveWaitlistTrialOnProfile(
  profile?: EntitlementProfileRow | null,
): boolean {
  return (
    profile?.subscription_status === "trialing" &&
    profile?.trial_source === "waitlist" &&
    isTrialStillActive(profile?.trial_expires_at)
  );
}

function buildProfileEntitlement(args: {
  user: Pick<User, "id" | "email">;
  profile?: EntitlementProfileRow | null;
  queriesUsedToday?: number | null;
}): AppEntitlement {
  const { user, profile } = args;
  const normalizedEmail = normalizeEmail(user.email);
  const storedTier = profile?.subscription_tier ?? "free";
  const storedStatus = profile?.subscription_status ?? "inactive";
  const trialIsActive = storedStatus === "trialing" && isTrialStillActive(profile?.trial_expires_at);
  const billingStatus: BillingStatus =
    storedStatus === "trialing" && !trialIsActive ? "inactive" : storedStatus;
  const hasPremiumAccess = billingStatus === "active" || trialIsActive;
  const dailyQueryLimit = hasPremiumAccess ? null : FREE_DAILY_QUERY_LIMIT;

  return {
    isAuthenticated: true,
    userId: user.id,
    email: normalizedEmail,
    hasCompletedOnboarding: profile?.has_completed_onboarding === true,
    billingTier: storedTier,
    billingStatus,
    trialSource: trialIsActive ? profile?.trial_source ?? null : null,
    trialExpiresAt: trialIsActive ? profile?.trial_expires_at ?? null : null,
    hasPremiumAccess,
    dailyQueryLimit,
    waitlistFreeMonthRedeemedAt: profile?.waitlist_free_month_redeemed_at ?? null,
    waitlistFreeMonthEmail: profile?.waitlist_free_month_email ?? null,
    remainingQueriesToday:
      hasPremiumAccess || args.queriesUsedToday == null
        ? null
        : Math.max(0, FREE_DAILY_QUERY_LIMIT - args.queriesUsedToday),
  };
}

export function buildEntitlement(args: {
  user?: Pick<User, "id" | "email"> | null;
  profile?: EntitlementProfileRow | null;
  queriesUsedToday?: number | null;
}): AppEntitlement {
  const user = args.user ?? null;
  const profile = args.profile ?? null;
  const normalizedEmail = normalizeEmail(user?.email);

  if (!user) {
    return {
      ...GUEST_ENTITLEMENT,
      remainingQueriesToday:
        args.queriesUsedToday == null
          ? GUEST_ENTITLEMENT.remainingQueriesToday
          : Math.max(0, FREE_DAILY_QUERY_LIMIT - args.queriesUsedToday),
    };
  }

  // Waitlist trial on the profile wins over dev master / reviewer full access.
  if (hasActiveWaitlistTrialOnProfile(profile)) {
    return buildProfileEntitlement({
      user,
      profile,
      queriesUsedToday: args.queriesUsedToday,
    });
  }

  if (isFullAccessEmail(normalizedEmail)) {
    return {
      isAuthenticated: true,
      userId: user.id,
      email: normalizedEmail,
      hasCompletedOnboarding: profile?.has_completed_onboarding === true,
      billingTier: "yearly",
      billingStatus: "active",
      trialSource: null,
      trialExpiresAt: null,
      hasPremiumAccess: true,
      dailyQueryLimit: null,
      waitlistFreeMonthRedeemedAt: profile?.waitlist_free_month_redeemed_at ?? null,
      waitlistFreeMonthEmail: profile?.waitlist_free_month_email ?? null,
      remainingQueriesToday: null,
    };
  }

  return buildProfileEntitlement({
    user,
    profile,
    queriesUsedToday: args.queriesUsedToday,
  });
}

export function getEntitlementPlanLabel(entitlement: AppEntitlement): string {
  if (entitlement.billingStatus === "trialing" && entitlement.trialSource === "waitlist") {
    return "Waitlist Free Month";
  }

  if (entitlement.billingTier === "yearly" && entitlement.hasPremiumAccess) {
    return "Yearly Premium";
  }

  if (entitlement.billingTier === "monthly" && entitlement.hasPremiumAccess) {
    return "Monthly Premium";
  }

  return "Free Plan";
}

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function readCachedEntitlement(): AppEntitlement {
  if (!canUseStorage()) {
    return GUEST_ENTITLEMENT;
  }

  try {
    const raw = window.localStorage.getItem(ENTITLEMENT_CACHE_KEY);
    if (!raw) {
      return GUEST_ENTITLEMENT;
    }

    const parsed = JSON.parse(raw) as Partial<AppEntitlement> | null;
    if (!parsed || typeof parsed !== "object") {
      return GUEST_ENTITLEMENT;
    }

    return {
      ...GUEST_ENTITLEMENT,
      ...parsed,
    };
  } catch {
    return GUEST_ENTITLEMENT;
  }
}

export function writeCachedEntitlement(entitlement: AppEntitlement): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(ENTITLEMENT_CACHE_KEY, JSON.stringify(entitlement));
}

export function clearCachedEntitlement(): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(ENTITLEMENT_CACHE_KEY);
}
