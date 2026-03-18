// Simple browser notification helper for meal suggestions
// NOTE: This uses the Web Notifications API and will only work
// when the user has granted notification permission in the browser
// and the site is served over HTTPS (or localhost during development).

type MealSuggestion = {
  title: string;
  body: string;
};

export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    console.warn("[notifications] Notification API not available in this environment.");
    return null;
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  if (Notification.permission === "denied") {
    console.warn("[notifications] Notification permission has been denied by the user.");
    return "denied";
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.error("[notifications] Error requesting notification permission:", err);
    return null;
  }
}

export function sendMealSuggestionNotification(meal: MealSuggestion) {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    console.warn("[notifications] Notification API not available in this environment.");
    return;
  }

  if (Notification.permission !== "granted") {
    console.warn("[notifications] Cannot send notification, permission is not granted:", Notification.permission);
    return;
  }

  try {
    new Notification(meal.title, {
      body: meal.body,
      icon: "/logos/seekeatz-logo.png",
    });
  } catch (err) {
    console.error("[notifications] Failed to send notification:", err);
  }
}


