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

async function loadEntitlementData(
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

async function loadEntitlementDataAdmin(
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
    console.error("[entitlement] Admin fallback unavailable:", error);
    return null;
  }
}

/**
 * Resolve the signed-in user and entitlement for API routes.
 * Uses a bearer-authenticated Supabase client when cookies are missing, with
 * a service-role fallback only when the user would otherwise look non-premium.
 */
export async function getRequestEntitlement(request: Request): Promise<{
  supabase: SupabaseClient;
  user: User | null;
  entitlement: AppEntitlement;
}> {
  const { supabase, user } = await getRequestUser(request);

  if (!user) {
    return { supabase, user: null, entitlement: GUEST_ENTITLEMENT };
  }

  let { profile, queriesUsedToday } = await loadEntitlementData(supabase, user.id);
  let entitlement = buildEntitlement({ user, profile, queriesUsedToday });

  if (!entitlement.hasPremiumAccess) {
    const adminData = await loadEntitlementDataAdmin(user.id);
    if (adminData) {
      const adminEntitlement = buildEntitlement({
        user,
        profile: adminData.profile,
        queriesUsedToday: adminData.queriesUsedToday,
      });

      if (adminEntitlement.hasPremiumAccess) {
        entitlement = adminEntitlement;
      } else if (!profile && adminData.profile) {
        entitlement = adminEntitlement;
        profile = adminData.profile;
        queriesUsedToday = adminData.queriesUsedToday;
      }
    }
  }

  return { supabase, user, entitlement };
}
