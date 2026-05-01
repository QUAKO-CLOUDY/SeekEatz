export function isNativeApp(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const nativeBridge = (
    window as Window & {
      ReactNativeWebView?: unknown;
      webkit?: { messageHandlers?: Record<string, unknown> };
    }
  );

  return Boolean(
    nativeBridge.ReactNativeWebView ||
      nativeBridge.webkit?.messageHandlers?.ReactNativeWebView,
  );
}

export async function openExternalUrl(url: string): Promise<void> {
  if (typeof window !== "undefined") {
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) {
      window.location.href = url;
    }
  }
}
