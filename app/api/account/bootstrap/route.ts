import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  buildEntitlement,
  type EntitlementProfileRow,
  normalizeEmail,
  PROFILE_ENTITLEMENT_SELECT,
  WAITLIST_TRIAL_DAYS,
} from "@/lib/entitlements";

type BootstrapBody = {
  profile?: {
    goal?: string;
    diet_type?: string;
    dietary_options?: string[];
    target_calories?: number;
    target_protein_g?: number;
    target_carbs_g?: number;
    target_fats_g?: number;
    preferredMealTypes?: string[];
    search_distance_miles?: number;
  } | null;
  hasCompletedOnboarding?: boolean;
};

type WaitlistFreeMonthRow = {
  id: string;
  is_free_month: boolean | null;
};

function addDaysIso(days: number) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return now.toISOString();
}

function mapProfilePayload(body: BootstrapBody) {
  const profile = body.profile;
  if (!profile) {
    return {};
  }

  const update: Record<string, unknown> = {
    user_profile: profile,
  };

  if (body.hasCompletedOnboarding) {
    update.has_completed_onboarding = true;
  }
  if (profile.goal) {
    update.goal = profile.goal;
  }
  if (profile.diet_type) {
    update.diet_type = profile.diet_type;
  }
  if (profile.dietary_options) {
    update.dietary_options = profile.dietary_options;
  }
  if (profile.target_calories != null) {
    update.target_calories = profile.target_calories;
  }
  if (profile.target_protein_g != null) {
    update.target_protein_g = profile.target_protein_g;
  }
  if (profile.target_carbs_g != null) {
    update.target_carbs_g = profile.target_carbs_g;
  }
  if (profile.target_fats_g != null) {
    update.target_fats_g = profile.target_fats_g;
  }
  if (profile.preferredMealTypes) {
    update.preferred_meal_types = profile.preferredMealTypes;
  }
  if (profile.search_distance_miles != null) {
    update.search_distance_miles = profile.search_distance_miles;
  }

  return update;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as BootstrapBody;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const adminDb = admin;
    const normalizedEmail = normalizeEmail(user.email);
    const nowIso = new Date().toISOString();

    const { data: currentProfile } = await adminDb
      .from("profiles")
      .select(PROFILE_ENTITLEMENT_SELECT)
      .eq("id", user.id)
      .maybeSingle();
    const typedCurrentProfile = currentProfile as EntitlementProfileRow | null;

    const profileUpdate: Record<string, unknown> = {
      id: user.id,
      email: normalizedEmail,
      last_login: nowIso,
      updated_at: nowIso,
      ...mapProfilePayload(body),
    };

    if (body.hasCompletedOnboarding) {
      profileUpdate.has_completed_onboarding = true;
    }

    let waitlistGrantApplied = false;

    if (normalizedEmail && !typedCurrentProfile?.waitlist_free_month_redeemed_at) {
      const { data: waitlistEntry } = await adminDb
        .from("waitlist_signups")
        .select("id, is_free_month")
        .eq("email", normalizedEmail)
        .maybeSingle();
      const typedWaitlistEntry = waitlistEntry as WaitlistFreeMonthRow | null;

      const alreadyPremium =
        typedCurrentProfile?.subscription_status === "active" ||
        typedCurrentProfile?.subscription_status === "trialing";

      if (typedWaitlistEntry?.is_free_month && !alreadyPremium) {
        profileUpdate.subscription_tier = "monthly";
        profileUpdate.subscription_status = "trialing";
        profileUpdate.trial_source = "waitlist";
        profileUpdate.trial_expires_at = addDaysIso(WAITLIST_TRIAL_DAYS);
        profileUpdate.waitlist_free_month_redeemed_at = nowIso;
        profileUpdate.waitlist_free_month_email = normalizedEmail;
        waitlistGrantApplied = true;

        await adminDb
          .from("waitlist_signups")
          .update({
            redeemed_at: nowIso,
            redeemed_by_user_id: user.id,
          })
          .eq("id", typedWaitlistEntry.id);
      }
    }

    await adminDb.from("profiles").upsert(profileUpdate, { onConflict: "id" });

    const { data: refreshedProfile } = await adminDb
      .from("profiles")
      .select(PROFILE_ENTITLEMENT_SELECT)
      .eq("id", user.id)
      .maybeSingle();

    const entitlement = buildEntitlement({
      user,
      profile: refreshedProfile as EntitlementProfileRow | null,
    });

    return NextResponse.json(
      {
        entitlement,
        waitlistGrantApplied,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to bootstrap account:", error);
    return NextResponse.json(
      { error: "Failed to bootstrap account" },
      { status: 500 },
    );
  }
}
