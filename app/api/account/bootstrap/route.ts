import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  buildEntitlement,
  type EntitlementProfileRow,
  PROFILE_ENTITLEMENT_SELECT,
} from "@/lib/entitlements";
import { getWaitlistTrialExpiresAtIso } from "@/lib/waitlist-trial";
import { normalizeEmail } from "@/lib/full-access";
import { sendWaitlistFreeMonthGrantedEmail } from "@/lib/email/resend";

type BootstrapBody = {
  profile?: {
    full_name?: string;
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
  redeemed_at: string | null;
  redeemed_by_user_id: string | null;
};

function shouldSendWaitlistGrantEmails() {
  return process.env.SEND_WAITLIST_GRANT_EMAILS === "true";
}

function mapProfilePayload(body: BootstrapBody) {
  const profile = body.profile;
  if (!profile) {
    return {};
  }

  const update: Record<string, unknown> = {};

  if (profile.full_name) {
    update.full_name = profile.full_name;
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
      updated_at: nowIso,
      ...mapProfilePayload(body),
    };

    let waitlistGrantApplied = false;

    let waitlistEntryId: string | null = null;

    if (normalizedEmail) {
      const { data: waitlistEntry } = await adminDb
        .from("waitlist_signups")
        .select("id, is_free_month, redeemed_at, redeemed_by_user_id")
        .eq("email", normalizedEmail)
        .maybeSingle();
      const typedWaitlistEntry = waitlistEntry as WaitlistFreeMonthRow | null;

      const hasActiveWaitlistTrial =
        typedCurrentProfile?.subscription_status === "trialing" &&
        typedCurrentProfile?.trial_source === "waitlist";

      const alreadyPremium =
        typedCurrentProfile?.subscription_status === "active" ||
        (typedCurrentProfile?.subscription_status === "trialing" && !hasActiveWaitlistTrial);

      const waitlistRedemptionAvailable =
        !typedWaitlistEntry?.redeemed_at ||
        typedWaitlistEntry.redeemed_by_user_id === user.id;

      const waitlistTrialMissingOnProfile =
        typedWaitlistEntry?.is_free_month === true &&
        !hasActiveWaitlistTrial &&
        waitlistRedemptionAvailable &&
        !typedCurrentProfile?.waitlist_free_month_redeemed_at;

      if (waitlistTrialMissingOnProfile && !alreadyPremium) {
        profileUpdate.subscription_tier = "monthly";
        profileUpdate.subscription_status = "trialing";
        profileUpdate.trial_source = "waitlist";
        profileUpdate.trial_expires_at = getWaitlistTrialExpiresAtIso();
        profileUpdate.waitlist_free_month_redeemed_at = nowIso;
        profileUpdate.waitlist_free_month_email = normalizedEmail;
        waitlistGrantApplied = true;
        waitlistEntryId = typedWaitlistEntry?.id ?? null;
      }
    }

    const { error: profileUpsertError } = await adminDb
      .from("profiles")
      .upsert(profileUpdate, { onConflict: "id" });

    if (profileUpsertError) {
      console.error("Failed to upsert profile during bootstrap:", profileUpsertError);
      throw profileUpsertError;
    }

    if (waitlistGrantApplied && waitlistEntryId) {
      const { error: waitlistUpdateError } = await adminDb
        .from("waitlist_signups")
        .update({
          redeemed_at: nowIso,
          redeemed_by_user_id: user.id,
        })
        .eq("id", waitlistEntryId);

      if (waitlistUpdateError) {
        console.error("Failed to mark waitlist redemption:", waitlistUpdateError);
      }
    }

    const { data: refreshedProfile } = await adminDb
      .from("profiles")
      .select(PROFILE_ENTITLEMENT_SELECT)
      .eq("id", user.id)
      .maybeSingle();

    const entitlement = buildEntitlement({
      user,
      profile: refreshedProfile as EntitlementProfileRow | null,
    });

    if (waitlistGrantApplied && normalizedEmail && shouldSendWaitlistGrantEmails()) {
      const origin = new URL(request.url).origin;
      sendWaitlistFreeMonthGrantedEmail({
        to: normalizedEmail,
        trialEndsAtIso: String(profileUpdate.trial_expires_at ?? ""),
        appUrl: origin,
      }).catch((emailError) => {
        console.error("Failed to send waitlist free-month email:", emailError);
      });
    }

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
