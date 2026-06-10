/**
 * Public App Store listing URL for SeekEatz.
 * Set NEXT_PUBLIC_APP_STORE_URL (or APP_STORE_URL for server scripts) in production, e.g.
 * https://apps.apple.com/app/seekeatz/id1234567890
 */
export function getAppStoreUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_STORE_URL?.trim() ||
    process.env.APP_STORE_URL?.trim() ||
    "https://seekeatz.com"
  );
}
