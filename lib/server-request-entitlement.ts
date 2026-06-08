import {
  buildEntitlement,
  type AppEntitlement,
  type EntitlementProfileRow,
  GUEST_ENTITLEMENT,
  PROFILE_ENTITLEMENT_SELECT,
} from "@/lib/entitlements";
import { createAdminClient } from "@/utils/supabase/admin";
import { getRequestUser } from "@/utils/supabase/request-user";
import type { User } from "@supabase/supabase-js";

function getUsageWindowStartIso() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Resolve the signed-in user and their entitlement for API routes.
 *
 * Profile + usage are read with the service-role client so metered-query
 * limits always reflect the database truth. The user-scoped Supabase client
 * can fail to attach a Bearer JWT to PostgREST requests inside the WebView,
 * which previously made paying users look "free" on /api/search and /api/chat
 * even though RevenueCat and Settings showed premium.
 */
export async function getAuthenticatedEntitlement(request: Request): Promise<{
  user: User | null;
  entitlement: AppEntitlement;
}> {
  const { user } = await getRequestUser(request);

  if (!user) {
    return { user: null, entitlement: GUEST_ENTITLEMENT };
  }

  try {
    const admin = createAdminClient();
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
        .gte("created_at", getUsageWindowStartIso()),
    ]);

    const entitlement = buildEntitlement({
      user,
      profile: profile as EntitlementProfileRow | null,
      queriesUsedToday: usageResult.count ?? 0,
    });

    return { user, entitlement };
  } catch (error) {
    console.error("[entitlement] Admin profile read failed, treating as free:", error);
    return {
      user,
      entitlement: buildEntitlement({ user, profile: null, queriesUsedToday: 0 }),
    };
  }
}
