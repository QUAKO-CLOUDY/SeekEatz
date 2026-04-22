import { FREE_DAILY_QUERY_LIMIT } from "@/lib/entitlements";

export const FREE_TIER_WINDOW_HOURS = 24;

export const FREE_TIER_LIMIT_SUMMARY = `${FREE_DAILY_QUERY_LIMIT} free searches every ${FREE_TIER_WINDOW_HOURS} hours`;

function getWindowLabel() {
  return `${FREE_TIER_WINDOW_HOURS}-hour window`;
}

export function getFreeTierUpgradeLimitMessage(): string {
  return `You've used your ${FREE_TIER_LIMIT_SUMMARY} for this ${getWindowLabel()}. Upgrade to unlock unlimited access.`;
}

export function getFreeTierCreateAccountLimitMessage(): string {
  return `You've used your ${FREE_TIER_LIMIT_SUMMARY} for this ${getWindowLabel()}. Create an account to keep going.`;
}

export function getFreeTierSignupDescription(): string {
  return `Enter your email to get ${FREE_TIER_LIMIT_SUMMARY} with SeekEatz.`;
}

export function getFreeTierPlanDetails(): string {
  return `Enjoy ${FREE_TIER_LIMIT_SUMMARY}. Premium unlocks unlimited home search and AI chat.`;
}
