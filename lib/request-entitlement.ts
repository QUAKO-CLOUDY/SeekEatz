import {
  buildEntitlement,
  type AppEntitlement,
  type EntitlementProfileRow,
  GUEST_ENTITLEMENT,
  PROFILE_ENTITLEMENT_SELECT,
} from "@/lib/entitlements";
import { createAdminClient } from "@/utils/supabase/admin";
import { getRequestUser } from "@/utils/supabase/request-user";
import type { SupabaseClient, User } from "@supabase/supabase-js";

function getUsageWindowStartIso() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

export async function loadEntitlementData(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ profile: EntitlementProfileRow | null; queriesUsedToday: number }> {
  const [{ data: profile }, usageResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(PROFILE_ENTITLEMENT_SELECT)
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "metered_query")
      .gte("created_at", getUsageWindowStartIso()),
  ]);

  return {
    profile: profile as EntitlementProfileRow | null,
    queriesUsedToday: usageResult.count ?? 0,
  };
}

/**
 * Service-role read used only as a last check before blocking a signed-in user.
 * Avoids running this on every request (which was slowing search and causing timeouts).
 */
export async function loadEntitlementDataAdmin(
  userId: string,
): Promise<{ profile: EntitlementProfileRow | null; queriesUsedToday: number } | null> {
  try {
    const admin = createAdminClient();
    const [{ data: profile }, usageResult] = await Promise.all([
      admin
        .from("profiles")
        .select(PROFILE_ENTITLEMENT_SELECT)
        .eq("id", userId)
        .maybeSingle(),
      admin
        .from("usage_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("event_type", "metered_query")
        .gte("created_at", getUsageWindowStartIso()),
    ]);

    return {
      profile: profile as EntitlementProfileRow | null,
      queriesUsedToday: usageResult.count ?? 0,
    };
  } catch (error) {
    console.error("[entitlement] Admin read unavailable:", error);
    return null;
  }
}

export async function getRequestEntitlement(request: Request): Promise<{
  supabase: SupabaseClient;
  user: User | null;
  entitlement: AppEntitlement;
}> {
  const { supabase, user } = await getRequestUser(request);

  if (!user) {
    return { supabase, user: null, entitlement: GUEST_ENTITLEMENT };
  }

  const { profile, queriesUsedToday } = await loadEntitlementData(supabase, user.id);
  const entitlement = buildEntitlement({ user, profile, queriesUsedToday });

  return { supabase, user, entitlement };
}

/**
 * Re-check subscription status via service role before returning a 403 limit response.
 */
export async function confirmPremiumBeforeLimitBlock(
  user: User,
  entitlement: AppEntitlement,
): Promise<AppEntitlement> {
  if (entitlement.hasPremiumAccess) {
    return entitlement;
  }

  const adminData = await loadEntitlementDataAdmin(user.id);
  if (!adminData) {
    return entitlement;
  }

  return buildEntitlement({
    user,
    profile: adminData.profile,
    queriesUsedToday: adminData.queriesUsedToday,
  });
}
