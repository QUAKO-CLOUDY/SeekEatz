import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  buildEntitlement,
  type EntitlementProfileRow,
  GUEST_ENTITLEMENT,
  PROFILE_ENTITLEMENT_SELECT,
} from "@/lib/entitlements";

function getTodayStartIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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
        .gte("created_at", getTodayStartIso()),
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
