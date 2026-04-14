import type { BillingTier } from "@/lib/entitlements";

export type AppleProductTier = Exclude<BillingTier, "free">;

export type AppleProductCatalog = Record<
  AppleProductTier,
  {
    tier: AppleProductTier;
    productId: string | null;
  }
>;

function readFirstNonEmptyEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

export const APPLE_PRODUCT_CATALOG: AppleProductCatalog = {
  monthly: {
    tier: "monthly",
    productId: readFirstNonEmptyEnv(
      "NEXT_PUBLIC_APPLE_IAP_MONTHLY_PRODUCT_ID",
      "NEXT_PUBLIC_REVENUECAT_MONTHLY_PRODUCT_ID",
    ),
  },
  yearly: {
    tier: "yearly",
    productId: readFirstNonEmptyEnv(
      "NEXT_PUBLIC_APPLE_IAP_YEARLY_PRODUCT_ID",
      "NEXT_PUBLIC_REVENUECAT_YEARLY_PRODUCT_ID",
    ),
  },
};

export function getRevenueCatIosPublicSdkKey(): string | null {
  return readFirstNonEmptyEnv(
    "NEXT_PUBLIC_REVENUECAT_IOS_PUBLIC_SDK_KEY",
    "NEXT_PUBLIC_REVENUECAT_API_KEY",
  );
}

export function getRevenueCatEntitlementId(): string {
  return process.env.NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID?.trim() || "premium";
}

export function isAppleIapConfigured(): boolean {
  const readyFlag = process.env.NEXT_PUBLIC_APPLE_IAP_READY?.trim().toLowerCase();
  if (readyFlag === "false" || readyFlag === "0") {
    return false;
  }

  // Default to enabled unless explicitly disabled to keep local/test builds usable.
  // RevenueCat key presence is enforced by isRevenueCatConfigured().
  return true;
}

export function isRevenueCatConfigured(): boolean {
  return isAppleIapConfigured() && Boolean(getRevenueCatIosPublicSdkKey());
}

export function getAppleProductIdForTier(
  tier: AppleProductTier,
): string | null {
  return APPLE_PRODUCT_CATALOG[tier].productId;
}
