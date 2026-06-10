export const WAITLIST_WELCOME_PATH = "/waitlist-welcome";
const WAITLIST_WELCOME_PENDING_KEY = "seekeatz_waitlist_welcome_pending";

export function markWaitlistWelcomePending(userId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(WAITLIST_WELCOME_PENDING_KEY, userId);
}

export function clearWaitlistWelcomePending(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(WAITLIST_WELCOME_PENDING_KEY);
}

export function hasPendingWaitlistWelcome(userId: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return localStorage.getItem(WAITLIST_WELCOME_PENDING_KEY) === userId;
}

export function getWaitlistWelcomeSeenKey(userId: string): string {
  return `seekeatz_waitlist_welcome_seen_${userId}`;
}

export function hasSeenWaitlistWelcome(userId: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return localStorage.getItem(getWaitlistWelcomeSeenKey(userId)) === "true";
}

export function markWaitlistWelcomeSeen(userId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(getWaitlistWelcomeSeenKey(userId), "true");
}

export function getWaitlistWelcomeDestination(userId: string): string {
  if (hasSeenWaitlistWelcome(userId)) {
    return "/chat";
  }

  return WAITLIST_WELCOME_PATH;
}

export function startAppTutorialAfterWelcome(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem("seekeatz_start_app_tutorial", "true");
  localStorage.removeItem("seekeatz_current_screen");
  localStorage.removeItem("seekeatz_nav_history");
}

export function shouldShowWaitlistWelcomeScreen(
  userId: string,
  entitlement: {
    trialSource?: string | null;
    hasPremiumAccess?: boolean;
    waitlistFreeMonthRedeemedAt?: string | null;
  },
): boolean {
  if (hasSeenWaitlistWelcome(userId)) {
    return false;
  }

  const hasWaitlistTrial =
    entitlement.trialSource === "waitlist" && entitlement.hasPremiumAccess === true;
  const hasWaitlistRedemption = Boolean(entitlement.waitlistFreeMonthRedeemedAt);

  return hasWaitlistTrial || hasWaitlistRedemption || hasPendingWaitlistWelcome(userId);
}
