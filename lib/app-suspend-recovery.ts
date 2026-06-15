/**
 * Recover from iOS WKWebView JS freezes when the app is backgrounded.
 *
 * WKWebView suspends JavaScript in the background. Timers and visibility events
 * are unreliable. This module:
 * 1. Detects resume via heartbeat + requestAnimationFrame gaps
 * 2. Resets stuck loading on foreground signals when a search was in-flight
 * 3. Lets Home + Chat register reset handlers in one place
 */

import { resetPendingLocationRequest } from '@/lib/location';

export const APP_SUSPEND_RESUME_EVENT = 'seekeatz:js-resumed';
const INFLIGHT_LOADING_KEY = 'seekeatz_inflight_loading';

const HEARTBEAT_INTERVAL_MS = 250;
/** Any gap above this between ticks means JS was frozen. */
const SUSPEND_GAP_MS = 400;

type ResetHandler = (reason: string) => void;

const resetHandlers = new Set<ResetHandler>();

let started = false;
let lastMonotonicTickAt = Date.now();

export function markInflightLoading(active: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (active) {
    sessionStorage.setItem(INFLIGHT_LOADING_KEY, '1');
  } else {
    sessionStorage.removeItem(INFLIGHT_LOADING_KEY);
  }
}

export function hasInflightLoading(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return sessionStorage.getItem(INFLIGHT_LOADING_KEY) === '1';
}

export function registerAppRequestReset(handler: ResetHandler): () => void {
  resetHandlers.add(handler);
  return () => {
    resetHandlers.delete(handler);
  };
}

export function notifyAppForeground(reason: string, options?: { force?: boolean }): void {
  if (typeof window === 'undefined') {
    return;
  }

  const shouldReset = options?.force === true || hasInflightLoading();
  if (!shouldReset) {
    return;
  }

  console.log(`[app-suspend-recovery] foreground reset (${reason})`);
  markInflightLoading(false);
  resetPendingLocationRequest();

  resetHandlers.forEach((handler) => {
    try {
      handler(reason);
    } catch (error) {
      console.error('[app-suspend-recovery] reset handler failed:', error);
    }
  });

  window.dispatchEvent(
    new CustomEvent(APP_SUSPEND_RESUME_EVENT, {
      detail: { reason, fromRecovery: true },
    })
  );
}

function checkSuspendGap(reason: string, now: number, previous: number): void {
  if (now - previous > SUSPEND_GAP_MS) {
    notifyAppForeground(reason, { force: true });
  }
}

export function startAppSuspendRecovery(): void {
  if (typeof window === 'undefined' || started) {
    return;
  }
  started = true;
  lastMonotonicTickAt = Date.now();

  // Clear stale inflight flag from a prior freeze where finally never ran.
  if (hasInflightLoading()) {
    notifyAppForeground('startup-stale-inflight', { force: true });
  }

  window.setInterval(() => {
    const now = Date.now();
    checkSuspendGap('heartbeat', now, lastMonotonicTickAt);
    lastMonotonicTickAt = now;
  }, HEARTBEAT_INTERVAL_MS);

  let lastRafAt = Date.now();
  const rafLoop = () => {
    const now = Date.now();
    checkSuspendGap('raf', now, lastRafAt);
    lastRafAt = now;
    requestAnimationFrame(rafLoop);
  };
  requestAnimationFrame(rafLoop);

  const handleVisible = () => {
    notifyAppForeground('visibility-visible');
  };

  const handleHidden = () => {
    // Abort before iOS freezes JS so we are not stuck on return.
    notifyAppForeground('visibility-hidden', { force: true });
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      handleHidden();
      return;
    }
    if (document.visibilityState === 'visible') {
      handleVisible();
    }
  });

  window.addEventListener('pageshow', handleVisible);
  window.addEventListener('focus', handleVisible);

  window.addEventListener('seekeatz:app-state', (event) => {
    const state = (event as CustomEvent<{ state?: string }>).detail?.state;
    if (state === 'active') {
      notifyAppForeground('native-active');
      return;
    }
    if (state === 'background' || state === 'inactive') {
      notifyAppForeground('native-background', { force: true });
    }
  });

  window.addEventListener(APP_SUSPEND_RESUME_EVENT, (event) => {
    const detail = (event as CustomEvent<{ fromRecovery?: boolean }>).detail;
    if (detail?.fromRecovery) {
      return;
    }
    notifyAppForeground('native-js-resumed', { force: true });
  });

  // If resume detectors lag, the first tap should unblock the UI.
  document.addEventListener(
    'pointerdown',
    () => {
      if (hasInflightLoading()) {
        notifyAppForeground('pointerdown');
      }
    },
    { capture: true, passive: true }
  );
}
