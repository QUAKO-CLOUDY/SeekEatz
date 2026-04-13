import type { BillingTier } from "@/lib/entitlements";

export type AppleProductTier = Exclude<BillingTier, "free">;

export type AppleProductCatalog = Record<
  AppleProductTier,
  {
    tier: AppleProductTier;
    productId: string | null;
  }
>;

export const APPLE_PRODUCT_CATALOG: AppleProductCatalog = {
  monthly: {
    tier: "monthly",
    productId: process.env.NEXT_PUBLIC_APPLE_IAP_MONTHLY_PRODUCT_ID?.trim() || null,
  },
  yearly: {
    tier: "yearly",
    productId: process.env.NEXT_PUBLIC_APPLE_IAP_YEARLY_PRODUCT_ID?.trim() || null,
  },
};

export function getRevenueCatIosPublicSdkKey(): string | null {
  return process.env.NEXT_PUBLIC_REVENUECAT_IOS_PUBLIC_SDK_KEY?.trim() || null;
}

export function getRevenueCatEntitlementId(): string {
  return process.env.NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID?.trim() || "premium";
}

export function isAppleIapConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_APPLE_IAP_READY !== "true") {
    return false;
  }

  return Boolean(
    APPLE_PRODUCT_CATALOG.monthly.productId &&
      APPLE_PRODUCT_CATALOG.yearly.productId,
  );
}

export function isRevenueCatConfigured(): boolean {
  return isAppleIapConfigured() && Boolean(getRevenueCatIosPublicSdkKey());
}

export function getAppleProductIdForTier(
  tier: AppleProductTier,
): string | null {
  return APPLE_PRODUCT_CATALOG[tier].productId;
}
