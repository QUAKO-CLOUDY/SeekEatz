import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export async function openExternalUrl(url: string): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  if (isNativeApp()) {
    await Browser.open({ url });
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
