const DEFAULT_SITE_URL = "https://seekeatz.com";

/**
 * Canonical public site origin for auth redirects and email links.
 * Prefer a stable production URL over window.location.origin so reset links
 * always point at seekeatz.com (not localhost or an in-app WebView origin).
 */
export function getPublicSiteUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_WEB_APP_URL?.trim() ||
    process.env.EXPO_PUBLIC_WEB_APP_URL?.trim() ||
    DEFAULT_SITE_URL;

  return fromEnv.replace(/\/$/, "");
}
