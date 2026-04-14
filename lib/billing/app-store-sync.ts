import type { BillingStatus, BillingTier } from "@/lib/entitlements";
import {
  getAppleProductIdForTier,
  getRevenueCatEntitlementId,
} from "@/lib/billing/apple-products";

export type AppStoreEnvironment = "sandbox" | "production";
export type AppStoreSubscriptionStatus = Exclude<BillingStatus, "guest">;

export type AppStoreSyncPayload = {
  entitlementIdentifier: string | null;
  originalTransactionId: string;
  latestTransactionId: string;
  productId: string;
  environment: AppStoreEnvironment;
  status: AppStoreSubscriptionStatus;
  expiresAt: string | null;
  autoRenewStatus: boolean | null;
  rawCustomerInfo?: unknown;
};

export function getBillingTierFromAppleProductId(
  productId: string | null | undefined,
): BillingTier {
  if (!productId) {
    return "free";
  }

  const normalizedProductId = productId.toLowerCase();

  if (productId === getAppleProductIdForTier("monthly")) {
    return "monthly";
  }

  if (productId === getAppleProductIdForTier("yearly")) {
    return "yearly";
  }

  if (
    normalizedProductId.includes("year") ||
    normalizedProductId.includes("annual")
  ) {
    return "yearly";
  }

  if (normalizedProductId.includes("month")) {
    return "monthly";
  }

  // Unknown paid identifier should still be treated as paid to avoid downgrading active subscribers.
  return "monthly";
}

export function getDefaultRevenueCatEntitlementId(): string {
  return getRevenueCatEntitlementId();
}
