import { NextResponse } from "next/server";
import { getRequestUser } from "@/utils/supabase/request-user";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  buildEntitlement,
  type EntitlementProfileRow,
  PROFILE_ENTITLEMENT_SELECT,
} from "@/lib/entitlements";
import {
  type AppStoreSyncPayload,
  getBillingTierFromAppleProductId,
} from "@/lib/billing/app-store-sync";

type AppStoreSubscriptionUpsert = {
  user_id: string;
  original_transaction_id: string;
  latest_transaction_id: string;
  product_id: string;
  environment: AppStoreSyncPayload["environment"];
  status: AppStoreSyncPayload["status"];
  auto_renew_status: boolean | null;
  expires_at: string | null;
  last_verified_at: string;
  raw_payload: unknown;
  updated_at: string;
};

type ProfilePremiumUpdate = {
  billing_provider: "app_store";
  subscription_tier: ReturnType<typeof getBillingTierFromAppleProductId>;
  subscription_status: AppStoreSyncPayload["status"];
  trial_source: null;
  trial_expires_at: string | null;
  updated_at: string;
};

type ProfileAppStoreMetadataUpdate = {
  app_store_product_id: string;
  app_store_original_transaction_id: string;
  app_store_environment: AppStoreSyncPayload["environment"];
  app_store_last_verified_at: string;
  updated_at: string;
};

function isValidStatus(status: string): status is AppStoreSyncPayload["status"] {
  return ["inactive", "trialing", "active", "canceled", "past_due"].includes(status);
}

function isValidEnvironment(
  environment: string,
): environment is AppStoreSyncPayload["environment"] {
  return ["sandbox", "production"].includes(environment);
}

function isValidSyncPayload(payload: unknown): payload is AppStoreSyncPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  return (
    typeof candidate.originalTransactionId === "string" &&
    candidate.originalTransactionId.length > 0 &&
    typeof candidate.latestTransactionId === "string" &&
    candidate.latestTransactionId.length > 0 &&
    typeof candidate.productId === "string" &&
    candidate.productId.length > 0 &&
    typeof candidate.status === "string" &&
    isValidStatus(candidate.status) &&
    typeof candidate.environment === "string" &&
    isValidEnvironment(candidate.environment) &&
    (candidate.expiresAt === null || typeof candidate.expiresAt === "string") &&
    (candidate.autoRenewStatus === null ||
      typeof candidate.autoRenewStatus === "boolean") &&
    (candidate.entitlementIdentifier === null ||
      typeof candidate.entitlementIdentifier === "string")
  );
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null);
    if (!isValidSyncPayload(payload)) {
      return NextResponse.json(
        { error: "Invalid App Store sync payload" },
        { status: 400 },
      );
    }

    const { supabase, user } = await getRequestUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const billingTier = getBillingTierFromAppleProductId(payload.productId);
    const subscriptionRecord: AppStoreSubscriptionUpsert = {
      user_id: user.id,
      original_transaction_id: payload.originalTransactionId,
      latest_transaction_id: payload.latestTransactionId,
      product_id: payload.productId,
      environment: payload.environment,
      status: payload.status,
      auto_renew_status: payload.autoRenewStatus,
      expires_at: payload.expiresAt,
      last_verified_at: nowIso,
      raw_payload: payload.rawCustomerInfo ?? null,
      updated_at: nowIso,
    };

    // Best-effort: record the raw subscription in the history table. This is
    // useful for auditing but must NEVER block granting premium — if the table
    // is missing or the transaction id collides, we still upgrade the profile.
    try {
      const { error: subscriptionUpsertError } = await (
        admin.from("app_store_subscriptions" as never) as unknown as {
          upsert: (
            values: AppStoreSubscriptionUpsert,
            options?: { onConflict?: string },
          ) => Promise<{ error: unknown }>;
        }
      ).upsert(subscriptionRecord, { onConflict: "original_transaction_id" });

      if (subscriptionUpsertError) {
        console.error(
          "[app-store-sync] subscription history upsert failed (non-fatal):",
          subscriptionUpsertError,
        );
      }
    } catch (subscriptionUpsertThrow) {
      console.error(
        "[app-store-sync] subscription history upsert threw (non-fatal):",
        subscriptionUpsertThrow,
      );
    }

    // Core premium flag. This is what actually unlocks the app, so it MUST
    // succeed. It only touches the base subscription columns to minimise the
    // chance of a schema mismatch silently locking out a paying user.
    const profilePremiumUpdate: ProfilePremiumUpdate = {
      billing_provider: "app_store",
      subscription_tier: billingTier,
      subscription_status: payload.status,
      trial_source: null,
      trial_expires_at: payload.status === "trialing" ? payload.expiresAt : null,
      updated_at: nowIso,
    };

    const { error: profilePremiumError } = await (
      admin.from("profiles" as never) as unknown as {
        update: (values: ProfilePremiumUpdate) => {
          eq: (column: string, value: string) => Promise<{ error: unknown }>;
        };
      }
    )
      .update(profilePremiumUpdate)
      .eq("id", user.id);

    if (profilePremiumError) {
      throw profilePremiumError;
    }

    // Best-effort: App Store metadata columns. These have a UNIQUE index on the
    // transaction id and may not exist on older schemas, so a failure here must
    // not undo the premium grant above.
    try {
      const profileMetadataUpdate: ProfileAppStoreMetadataUpdate = {
        app_store_product_id: payload.productId,
        app_store_original_transaction_id: payload.originalTransactionId,
        app_store_environment: payload.environment,
        app_store_last_verified_at: nowIso,
        updated_at: nowIso,
      };

      const { error: profileMetadataError } = await (
        admin.from("profiles" as never) as unknown as {
          update: (values: ProfileAppStoreMetadataUpdate) => {
            eq: (column: string, value: string) => Promise<{ error: unknown }>;
          };
        }
      )
        .update(profileMetadataUpdate)
        .eq("id", user.id);

      if (profileMetadataError) {
        console.error(
          "[app-store-sync] profile metadata update failed (non-fatal):",
          profileMetadataError,
        );
      }
    } catch (profileMetadataThrow) {
      console.error(
        "[app-store-sync] profile metadata update threw (non-fatal):",
        profileMetadataThrow,
      );
    }

    const [{ data: profile }, usageResult] = await Promise.all([
      admin
        .from("profiles")
        .select(PROFILE_ENTITLEMENT_SELECT)
        .eq("id", user.id)
        .maybeSingle(),
      admin
        .from("usage_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("event_type", "metered_query")
        .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    ]);

    const entitlement = buildEntitlement({
      user,
      profile: profile as EntitlementProfileRow | null,
      queriesUsedToday: usageResult.count ?? 0,
    });

    return NextResponse.json(
      {
        ok: true,
        entitlement,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to sync App Store subscription:", error);
    return NextResponse.json(
      { error: "Failed to sync App Store subscription" },
      { status: 500 },
    );
  }
}
