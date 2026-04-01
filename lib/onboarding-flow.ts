export type SubscriptionTier = 'free' | 'premium';

export const GUEST_QUERY_LIMIT = 2;
export const FREE_ACCOUNT_DAILY_QUERY_LIMIT = 3;

const GUEST_QUERY_COUNT_KEY = 'seekeatz_guest_query_count';
const POST_VALUE_ONBOARDING_DONE_KEY = 'seekeatz_post_value_onboarding_done';
const FREE_ACCOUNT_USAGE_KEY = 'seekeatz_free_account_usage';
const SUBSCRIPTION_TIER_KEY = 'seekeatz_subscription_tier';
const DEV_FULL_ACCESS_KEY = 'seekeatz_dev_full_access';

type DailyUsageStore = Record<string, Record<string, number>>;

function canUseStorage() {
  return typeof window !== 'undefined';
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getUserKey(userId?: string) {
  return userId || 'anonymous-account';
}

function readDailyUsageStore(): DailyUsageStore {
  if (!canUseStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(FREE_ACCOUNT_USAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDailyUsageStore(store: DailyUsageStore) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(FREE_ACCOUNT_USAGE_KEY, JSON.stringify(store));
}

export function getGuestQueryCount() {
  if (!canUseStorage()) {
    return 0;
  }

  const raw = window.sessionStorage.getItem(GUEST_QUERY_COUNT_KEY);
  const count = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

export function incrementGuestQueryCount() {
  if (!canUseStorage()) {
    return 0;
  }

  const next = getGuestQueryCount() + 1;
  window.sessionStorage.setItem(GUEST_QUERY_COUNT_KEY, String(next));
  return next;
}

export function clearGuestQueryCount() {
  if (!canUseStorage()) {
    return;
  }

  window.sessionStorage.removeItem(GUEST_QUERY_COUNT_KEY);
}

export function hasCompletedPostValueOnboarding() {
  if (!canUseStorage()) {
    return false;
  }

  return window.localStorage.getItem(POST_VALUE_ONBOARDING_DONE_KEY) === 'true';
}

export function markPostValueOnboardingComplete() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(POST_VALUE_ONBOARDING_DONE_KEY, 'true');
}

export function getFreeAccountDailyQueryCount(userId?: string) {
  const store = readDailyUsageStore();
  const todayKey = getTodayKey();
  const userKey = getUserKey(userId);
  return store[userKey]?.[todayKey] ?? 0;
}

export function incrementFreeAccountDailyQueryCount(userId?: string) {
  const store = readDailyUsageStore();
  const todayKey = getTodayKey();
  const userKey = getUserKey(userId);
  const next = (store[userKey]?.[todayKey] ?? 0) + 1;

  store[userKey] = {
    ...(store[userKey] ?? {}),
    [todayKey]: next,
  };

  writeDailyUsageStore(store);
  return next;
}

export function getSubscriptionTier(): SubscriptionTier {
  if (!canUseStorage()) {
    return 'free';
  }

  const stored = window.localStorage.getItem(SUBSCRIPTION_TIER_KEY);
  return stored === 'premium' ? 'premium' : 'free';
}

export function setSubscriptionTier(tier: SubscriptionTier) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(SUBSCRIPTION_TIER_KEY, tier);
}

export function hasDevFullAccess() {
  if (!canUseStorage()) {
    return false;
  }

  return window.localStorage.getItem(DEV_FULL_ACCESS_KEY) === 'true';
}

export function setDevFullAccess(enabled: boolean) {
  if (!canUseStorage()) {
    return;
  }

  if (enabled) {
    window.localStorage.setItem(DEV_FULL_ACCESS_KEY, 'true');
    return;
  }

  window.localStorage.removeItem(DEV_FULL_ACCESS_KEY);
}
