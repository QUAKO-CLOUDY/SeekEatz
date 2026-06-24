import type { UserProfile } from "@/app/types";

export const PENDING_ONBOARDING_PROFILE_KEY = "pendingOnboardingProfile";

export type OnboardingProfileDraft = Partial<UserProfile>;

export function readOnboardingProfileDraft(): OnboardingProfileDraft {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = localStorage.getItem(PENDING_ONBOARDING_PROFILE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as OnboardingProfileDraft;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeOnboardingProfileDraft(draft: OnboardingProfileDraft) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(PENDING_ONBOARDING_PROFILE_KEY, JSON.stringify(draft));
}

export function mergeOnboardingProfileDraft(
  patch: OnboardingProfileDraft,
): OnboardingProfileDraft {
  const next = {
    ...readOnboardingProfileDraft(),
    ...patch,
  };
  writeOnboardingProfileDraft(next);
  return next;
}
