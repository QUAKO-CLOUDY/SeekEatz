import type { AppEntitlement } from "@/lib/entitlements";

// Waitlist free month: June 11, 2026 through end of July 11, 2026 (local time).
export const WAITLIST_TRIAL_START_ISO = "2026-06-11T04:00:00.000Z";
export const WAITLIST_TRIAL_EXPIRES_AT_ISO = "2026-07-12T03:59:59.999Z";

const WAITLIST_TRIAL_END_DAY = { year: 2026, month: 6, day: 11 };

export function getWaitlistTrialExpiresAtIso(): string {
  return WAITLIST_TRIAL_EXPIRES_AT_ISO;
}

export function formatWaitlistTrialStartLabel(): string {
  return "June 11, 2026";
}

export function formatWaitlistTrialEndLabel(): string {
  return "July 11, 2026";
}

export function formatWaitlistTrialActiveLabel(): string {
  return `Active starting ${formatWaitlistTrialStartLabel()} through ${formatWaitlistTrialEndLabel()}`;
}

function getLocalDateParts(date: Date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
  };
}

function isSameLocalCalendarDay(left: Date, right: Date): boolean {
  const a = getLocalDateParts(left);
  const b = getLocalDateParts(right);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function isWaitlistTrialExpirationDay(now = new Date()): boolean {
  const expirationDay = new Date(
    WAITLIST_TRIAL_END_DAY.year,
    WAITLIST_TRIAL_END_DAY.month,
    WAITLIST_TRIAL_END_DAY.day,
  );
  return isSameLocalCalendarDay(now, expirationDay);
}

export function getWaitlistTrialEndedPopupSeenKey(userId: string): string {
  return `seekeatz_waitlist_trial_ended_popup_seen_${userId}`;
}

export function hasSeenWaitlistTrialEndedPopup(userId: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return localStorage.getItem(getWaitlistTrialEndedPopupSeenKey(userId)) === "true";
}

export function markWaitlistTrialEndedPopupSeen(userId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(getWaitlistTrialEndedPopupSeenKey(userId), "true");
}

export function shouldShowWaitlistTrialEndedPopup(
  userId: string | null | undefined,
  entitlement: AppEntitlement,
): boolean {
  if (!userId || typeof window === "undefined") {
    return false;
  }

  if (hasSeenWaitlistTrialEndedPopup(userId)) {
    return false;
  }

  if (!entitlement.waitlistFreeMonthRedeemedAt) {
    return false;
  }

  if (entitlement.billingStatus === "active") {
    return false;
  }

  if (!isWaitlistTrialExpirationDay()) {
    return false;
  }

  return true;
}
