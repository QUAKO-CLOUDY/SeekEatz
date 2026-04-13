import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
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

type UntypedSupabaseClient = {
  from: (table: string) => any;
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

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient() as UntypedSupabaseClient;
    const nowIso = new Date().toISOString();
    const billingTier = getBillingTierFromAppleProductId(payload.productId);

    await admin.from("app_store_subscriptions").upsert(
      {
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
      },
      { onConflict: "original_transaction_id" },
    );

    await admin
      .from("profiles")
      .update({
        billing_provider: "app_store",
        subscription_tier: billingTier,
        subscription_status: payload.status,
        trial_source: null,
        trial_expires_at: payload.status === "trialing" ? payload.expiresAt : null,
        app_store_product_id: payload.productId,
        app_store_original_transaction_id: payload.originalTransactionId,
        app_store_environment: payload.environment,
        app_store_last_verified_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", user.id);

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
