import { NextResponse } from "next/server";
import { getRequestUser } from "@/utils/supabase/request-user";
import {
  buildEntitlement,
  type EntitlementProfileRow,
  GUEST_ENTITLEMENT,
  PROFILE_ENTITLEMENT_SELECT,
} from "@/lib/entitlements";

function getUsageWindowStartIso() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getRequestUser(request);

    if (!user) {
      return NextResponse.json(GUEST_ENTITLEMENT, { status: 200 });
    }

    const [{ data: profile }, usageResult] = await Promise.all([
      supabase
        .from("profiles")
        .select(PROFILE_ENTITLEMENT_SELECT)
        .eq("id", user.id)
        .maybeSingle(),
      supabase
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

    return NextResponse.json(entitlement, { status: 200 });
  } catch (error) {
    console.error("Failed to load account entitlement:", error);
    return NextResponse.json(
      { error: "Failed to load entitlement" },
      { status: 500 },
    );
  }
}
