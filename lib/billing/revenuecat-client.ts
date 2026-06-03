"use client";

import {
  type AppleProductTier,
  getAppleProductIdForTier,
  getRevenueCatEntitlementId,
  getRevenueCatIosPublicSdkKey,
  isRevenueCatConfigured,
} from "@/lib/billing/apple-products";
import {
  type AppStoreSyncPayload,
  getBillingTierFromAppleProductId,
} from "@/lib/billing/app-store-sync";
import { isNativeApp } from "@/lib/native-runtime";

type PurchasesEntitlementInfo = {
  identifier: string;
  isActive: boolean;
  periodType: string;
  productIdentifier: string;
  expirationDate: string | null;
  isSandbox: boolean;
  willRenew: boolean;
  billingIssuesDetectedAt: string | null;
  unsubscribeDetectedAt: string | null;
};

type PurchasesSubscriptionInfo = {
  productIdentifier: string;
  storeTransactionId: string | null;
  isSandbox: boolean;
  periodType: string;
  expiresDate: string | null;
  willRenew: boolean;
  billingIssuesDetectedAt: string | null;
  unsubscribeDetectedAt: string | null;
};

type CustomerInfo = {
  entitlements: {
    active: Record<string, PurchasesEntitlementInfo>;
    all: Record<string, PurchasesEntitlementInfo>;
  };
  subscriptionsByProductIdentifier: Record<string, PurchasesSubscriptionInfo>;
  managementURL: string | null;
};

type PurchasesPackage = {
  product: {
    identifier: string;
  };
};

type PurchasesOffering = {
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
  availablePackages: PurchasesPackage[];
};

type RevenueCatModule = {
  default: {
    isConfigured: () => Promise<boolean>;
    setLogLevel: (level: unknown) => Promise<void>;
    configure: (config: {
      apiKey: string;
      appUserID: string;
      storeKitVersion?: unknown;
      shouldShowInAppMessagesAutomatically?: boolean;
    }) => void;
    getAppUserID: () => Promise<string>;
    logIn: (appUserID: string) => Promise<unknown>;
    setEmail: (email: string | null) => Promise<void>;
    getOfferings: () => Promise<{ current: PurchasesOffering | null }>;
    purchasePackage: (aPackage: PurchasesPackage) => Promise<{
      customerInfo: CustomerInfo;
      productIdentifier: string;
    }>;
    restorePurchases: () => Promise<{ customerInfo: CustomerInfo }>;
    getCustomerInfo: () => Promise<CustomerInfo>;
  };
  LOG_LEVEL: {
    INFO: unknown;
  };
  STOREKIT_VERSION?: {
    DEFAULT: unknown;
  };
};

let purchasesModulePromise: Promise<RevenueCatModule> | null = null;
let configurePromise: Promise<void> | null = null;

type NativeBillingRequestType =
  | "revenuecat_purchase"
  | "revenuecat_restore"
  | "revenuecat_customer_info";

type NativeBillingResponse = {
  requestId?: string;
  ok?: boolean;
  payload?: unknown;
  error?: string;
};

type NativeBillingWindow = Window & {
  ReactNativeWebView?: {
    postMessage?: (message: string) => void;
  };
};

export function isNativeBillingBridgeAvailable(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean((window as NativeBillingWindow).ReactNativeWebView?.postMessage);
}

function requestNativeBilling(
  type: NativeBillingRequestType,
  params: {
    appUserID: string;
    email?: string | null;
    tier?: AppleProductTier;
  },
): Promise<unknown> {
  if (!isNativeBillingBridgeAvailable()) {
    return Promise.reject(new Error("Native billing bridge is unavailable."));
  }

  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener("seekeatz_native_billing_response", handleResponse);
      reject(new Error("Native billing request timed out."));
    }, 90000);

    const handleResponse = (event: Event) => {
      const detail = (event as CustomEvent<NativeBillingResponse>).detail;
      if (detail?.requestId !== requestId) {
        return;
      }

      window.clearTimeout(timeoutId);
      window.removeEventListener("seekeatz_native_billing_response", handleResponse);

      if (detail.ok) {
        resolve(detail.payload);
        return;
      }

      reject(new Error(detail.error || "Native billing request failed."));
    };

    window.addEventListener("seekeatz_native_billing_response", handleResponse);
    (window as NativeBillingWindow).ReactNativeWebView?.postMessage?.(
      JSON.stringify({
        type,
        requestId,
        appUserID: params.appUserID,
        email: params.email ?? null,
        tier: params.tier,
      }),
    );
  });
}

async function getRevenueCatModule(): Promise<RevenueCatModule> {
  if (!purchasesModulePromise) {
    purchasesModulePromise = (new Function(
      "moduleName",
      "return import(moduleName);",
    ) as (moduleName: string) => Promise<RevenueCatModule>)(
      "react-native-purchases",
    );
  }

  return purchasesModulePromise;
}

function assertNativeRevenueCatReady() {
  if (!isNativeApp()) {
    throw new Error("Apple billing is only available inside the iOS app.");
  }

  if (!isRevenueCatConfigured()) {
    throw new Error("RevenueCat is not fully configured yet.");
  }
}

async function configureRevenueCat(
  appUserID: string,
  email?: string | null,
): Promise<void> {
  assertNativeRevenueCatReady();
  const rcModule = await getRevenueCatModule();
  const Purchases = rcModule.default;

  if (!configurePromise) {
    configurePromise = (async () => {
      const isConfigured = await Purchases.isConfigured();

      if (!isConfigured) {
        await Purchases.setLogLevel(rcModule.LOG_LEVEL.INFO);
        Purchases.configure({
          apiKey: getRevenueCatIosPublicSdkKey()!,
          appUserID,
          storeKitVersion: rcModule.STOREKIT_VERSION?.DEFAULT,
          shouldShowInAppMessagesAutomatically: true,
        });
      }
    })().catch((error) => {
      configurePromise = null;
      throw error;
    });
  }

  await configurePromise;

  const currentAppUserID = await Purchases.getAppUserID();
  if (currentAppUserID !== appUserID) {
    await Purchases.logIn(appUserID);
  }

  if (email) {
    await Purchases.setEmail(email);
  }
}

function selectSubscriptionByKnownProducts(
  customerInfo: CustomerInfo,
): PurchasesSubscriptionInfo | null {
  const knownProducts = [
    getAppleProductIdForTier("monthly"),
    getAppleProductIdForTier("yearly"),
  ].filter((value): value is string => Boolean(value));

  for (const productId of knownProducts) {
    const subscription = customerInfo.subscriptionsByProductIdentifier[productId];
    if (subscription) {
      return subscription;
    }
  }

  return null;
}

function selectPremiumEntitlement(
  customerInfo: CustomerInfo,
): PurchasesEntitlementInfo | null {
  const entitlementId = getRevenueCatEntitlementId();
  return (
    customerInfo.entitlements.active[entitlementId] ??
    customerInfo.entitlements.all[entitlementId] ??
    null
  );
}

function buildAppStoreSyncPayload(
  customerInfo: CustomerInfo,
): AppStoreSyncPayload | null {
  const entitlement = selectPremiumEntitlement(customerInfo);
  const subscription =
    (entitlement?.productIdentifier
      ? customerInfo.subscriptionsByProductIdentifier[entitlement.productIdentifier]
      : null) ?? selectSubscriptionByKnownProducts(customerInfo);

  const productId = entitlement?.productIdentifier ?? subscription?.productIdentifier ?? null;
  const latestTransactionId = subscription?.storeTransactionId ?? null;
  if (!productId || !latestTransactionId) {
    return null;
  }

  let status: AppStoreSyncPayload["status"] = "inactive";
  if (entitlement?.isActive) {
    status = entitlement.periodType === "TRIAL" ? "trialing" : "active";
  } else if (subscription?.billingIssuesDetectedAt) {
    status = "past_due";
  } else if (subscription?.unsubscribeDetectedAt) {
    status = "canceled";
  }

  return {
    entitlementIdentifier: entitlement?.identifier ?? getRevenueCatEntitlementId(),
    originalTransactionId: latestTransactionId,
    latestTransactionId,
    productId,
    environment:
      entitlement?.isSandbox || subscription?.isSandbox ? "sandbox" : "production",
    status,
    expiresAt: entitlement?.expirationDate ?? subscription?.expiresDate ?? null,
    autoRenewStatus: entitlement?.willRenew ?? subscription?.willRenew ?? null,
    rawCustomerInfo: customerInfo,
  };
}

export async function syncRevenueCatCustomerInfoToBackend(customerInfo: CustomerInfo) {
  const payload = buildAppStoreSyncPayload(customerInfo);
  if (!payload) {
    return null;
  }

  const response = await fetch("/api/account/app-store/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`App Store sync failed with status ${response.status}`);
  }

  return response.json();
}

function findPackageForTier(
  offering: PurchasesOffering | null,
  tier: AppleProductTier,
): PurchasesPackage | null {
  if (!offering) {
    return null;
  }

  if (tier === "monthly" && offering.monthly) {
    return offering.monthly;
  }

  if (tier === "yearly" && offering.annual) {
    return offering.annual;
  }

  const productId = getAppleProductIdForTier(tier);
  if (!productId) {
    return null;
  }

  return (
    offering.availablePackages.find(
      (entry) => entry.product.identifier === productId,
    ) ?? null
  );
}

export async function getRevenueCatOffering(params: {
  appUserID: string;
  email?: string | null;
}): Promise<PurchasesOffering | null> {
  await configureRevenueCat(params.appUserID, params.email);
  const { default: Purchases } = await getRevenueCatModule();
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

export async function purchaseRevenueCatTier(params: {
  tier: AppleProductTier;
  appUserID: string;
  email?: string | null;
}) {
  if (isNativeBillingBridgeAvailable()) {
    const nativePayload = (await requestNativeBilling("revenuecat_purchase", params)) as {
      customerInfo?: CustomerInfo;
      productIdentifier?: string;
    };

    if (!nativePayload.customerInfo) {
      throw new Error("Native purchase did not return customer info.");
    }

    const synced = await syncRevenueCatCustomerInfoToBackend(nativePayload.customerInfo);
    return {
      result: nativePayload,
      synced,
      billingTier: getBillingTierFromAppleProductId(nativePayload.productIdentifier),
    };
  }

  await configureRevenueCat(params.appUserID, params.email);
  const { default: Purchases } = await getRevenueCatModule();

  const offering = await getRevenueCatOffering(params);
  const aPackage = findPackageForTier(offering, params.tier);
  if (!aPackage) {
    throw new Error(`No ${params.tier} package is available in RevenueCat.`);
  }

  const result = await Purchases.purchasePackage(aPackage);
  const synced = await syncRevenueCatCustomerInfoToBackend(result.customerInfo);

  return {
    result,
    synced,
    billingTier: getBillingTierFromAppleProductId(result.productIdentifier),
  };
}

export async function restoreRevenueCatPurchases(params: {
  appUserID: string;
  email?: string | null;
}) {
  if (isNativeBillingBridgeAvailable()) {
    const nativePayload = (await requestNativeBilling("revenuecat_restore", params)) as {
      customerInfo?: CustomerInfo;
    };

    if (!nativePayload.customerInfo) {
      throw new Error("Restore did not return customer info.");
    }

    const synced = await syncRevenueCatCustomerInfoToBackend(nativePayload.customerInfo);
    return {
      result: nativePayload,
      synced,
    };
  }

  await configureRevenueCat(params.appUserID, params.email);
  const { default: Purchases } = await getRevenueCatModule();

  const result = await Purchases.restorePurchases();
  const synced = await syncRevenueCatCustomerInfoToBackend(result.customerInfo);

  return {
    result,
    synced,
  };
}

export async function getRevenueCatCustomerInfo(params: {
  appUserID: string;
  email?: string | null;
}) {
  if (isNativeBillingBridgeAvailable()) {
    const nativePayload = (await requestNativeBilling("revenuecat_customer_info", params)) as {
      customerInfo?: CustomerInfo;
    };

    if (!nativePayload.customerInfo) {
      throw new Error("Customer info was not returned by native billing.");
    }

    return nativePayload.customerInfo;
  }

  await configureRevenueCat(params.appUserID, params.email);
  const { default: Purchases } = await getRevenueCatModule();
  return Purchases.getCustomerInfo();
}

export async function getRevenueCatManagementUrl(params: {
  appUserID: string;
  email?: string | null;
}): Promise<string | null> {
  const customerInfo = await getRevenueCatCustomerInfo(params);
  return customerInfo.managementURL ?? null;
}
