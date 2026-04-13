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

  if (productId === getAppleProductIdForTier("monthly")) {
    return "monthly";
  }

  if (productId === getAppleProductIdForTier("yearly")) {
    return "yearly";
  }

  return "free";
}

export function getDefaultRevenueCatEntitlementId(): string {
  return getRevenueCatEntitlementId();
}

