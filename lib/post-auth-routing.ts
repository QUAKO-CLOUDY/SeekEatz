import { bootstrapAccount } from "@/lib/bootstrap-account";
import { POST_ONBOARDING_PLAN_PICKER_PATH } from "@/lib/onboarding-flow";
import type { AppEntitlement } from "@/lib/entitlements";
import {
  WAITLIST_WELCOME_PATH,
  getWaitlistWelcomeDestination,
  markWaitlistWelcomePending,
  shouldShowWaitlistWelcomeScreen,
} from "@/lib/waitlist-welcome";

type BootstrapResult = {
  waitlistGrantApplied: boolean;
  entitlement: AppEntitlement;
} | null;

function shouldRouteNewSignupToWaitlistWelcome(
  userId: string,
  bootstrapResult?: BootstrapResult,
): boolean {
  if (!bootstrapResult) {
    return false;
  }

  return (
    bootstrapResult.waitlistGrantApplied ||
    shouldShowWaitlistWelcomeScreen(userId, bootstrapResult.entitlement)
  );
}

export async function resolveSignupDestination(args: {
  userId: string;
  fallbackRedirect?: string;
  bootstrapResult?: BootstrapResult;
}): Promise<string> {
  const fallback = args.fallbackRedirect ?? POST_ONBOARDING_PLAN_PICKER_PATH;
  let bootstrapResult = args.bootstrapResult ?? null;

  if (!bootstrapResult) {
    try {
      bootstrapResult = await bootstrapAccount({
        hasCompletedOnboarding: true,
      });
    } catch (error) {
      console.warn("Signup bootstrap skipped:", error);
    }
  }

  if (bootstrapResult && shouldRouteNewSignupToWaitlistWelcome(args.userId, bootstrapResult)) {
    markWaitlistWelcomePending(args.userId);

    // A fresh waitlist grant always shows the thank-you screen once.
    if (bootstrapResult.waitlistGrantApplied) {
      return WAITLIST_WELCOME_PATH;
    }

    return getWaitlistWelcomeDestination(args.userId);
  }

  return fallback;
}

export async function resolveSigninDestination(args: {
  fallbackRedirect?: string;
  isReturningUser?: boolean;
}): Promise<string> {
  if (args.isReturningUser) {
    return "/chat";
  }

  return args.fallbackRedirect ?? "/chat";
}
