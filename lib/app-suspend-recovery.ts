/**
 * Detect when iOS WKWebView resumes JavaScript after the app was backgrounded.
 *
 * WKWebView suspends JS entirely in the background — visibilitychange often does
 * not fire and timers do not run. When JS resumes, the heartbeat gap reveals the
 * suspend and we dispatch a global event so screens can reset stuck loading UI.
 */

export const APP_SUSPEND_RESUME_EVENT = 'seekeatz:js-resumed';

const HEARTBEAT_STORAGE_KEY = 'seekeatz_js_heartbeat_at';
const HEARTBEAT_INTERVAL_MS = 1000;
/** Gap longer than this between ticks means JS was frozen (app backgrounded). */
const SUSPEND_GAP_MS = 1500;

let started = false;

export function startAppSuspendRecovery(): void {
  if (typeof window === 'undefined' || started) {
    return;
  }
  started = true;

  const tick = () => {
    const now = Date.now();
    const previousRaw = sessionStorage.getItem(HEARTBEAT_STORAGE_KEY);
    sessionStorage.setItem(HEARTBEAT_STORAGE_KEY, String(now));

    if (!previousRaw) {
      return;
    }

    const previous = Number(previousRaw);
    if (!Number.isFinite(previous)) {
      return;
    }

    const gapMs = now - previous;
    if (gapMs > SUSPEND_GAP_MS) {
      window.dispatchEvent(
        new CustomEvent(APP_SUSPEND_RESUME_EVENT, {
          detail: { gapMs },
        })
      );
    }
  };

  tick();
  window.setInterval(tick, HEARTBEAT_INTERVAL_MS);
}
