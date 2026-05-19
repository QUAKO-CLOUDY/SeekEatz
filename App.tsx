import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, AppState, AppStateStatus, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import * as Notifications from "expo-notifications";

const DEFAULT_WEB_APP_URL = "https://seekeatz.com";
const webAppUrl = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim() || DEFAULT_WEB_APP_URL;
const isValidUrl = /^https?:\/\//i.test(webAppUrl);

type NotificationPreferences = {
  mealSuggestions: boolean;
  dailySummary: boolean;
  progressReminders: boolean;
};

type MealSummary = {
  name?: string;
  restaurant?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
};

type LoggedMeal = {
  timestamp?: string;
  date?: string;
  meal?: MealSummary;
};

type UserProfile = {
  target_calories?: number;
  target_protein_g?: number;
  target_carbs_g?: number;
  target_fats_g?: number;
};

type SnapshotPayload = {
  userId?: string | null;
  userEmail?: string | null;
  prefs?: NotificationPreferences;
  profile?: UserProfile;
  loggedMeals?: LoggedMeal[];
  recommendedMeals?: MealSummary[];
  lastActivityAt?: string | null;
  ts?: number;
};

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  mealSuggestions: false,
  dailySummary: false,
  progressReminders: false,
};

const PROGRESS_REMINDER_LINES = [
  "Don't forget to log your last meal.",
  "Quick reminder: log your latest meal so your totals stay accurate.",
  "Keep your day on track. Log your most recent meal.",
  "Small step: log your last meal to keep your progress dialed in.",
];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function summarizeTotals(snapshot: SnapshotPayload) {
  const today = localDateKey();
  const meals = Array.isArray(snapshot.loggedMeals) ? snapshot.loggedMeals : [];

  return meals
    .filter((entry) => (entry.date ?? "") === today)
    .reduce(
      (totals, entry) => {
        totals.calories += toNumber(entry.meal?.calories);
        totals.protein += toNumber(entry.meal?.protein);
        totals.carbs += toNumber(entry.meal?.carbs);
        totals.fats += toNumber(entry.meal?.fats);
        totals.count += 1;
        return totals;
      },
      { calories: 0, protein: 0, carbs: 0, fats: 0, count: 0 },
    );
}

function buildDailySummaryBody(snapshot: SnapshotPayload): string {
  const totals = summarizeTotals(snapshot);
  const profile = snapshot.profile ?? {};

  const pieces = [
    `${Math.round(totals.calories)} cal`,
    `${Math.round(totals.protein)}g protein`,
    `${Math.round(totals.carbs)}g carbs`,
    `${Math.round(totals.fats)}g fat`,
  ];

  const nutrientWins: string[] = [];
  if (totals.protein >= toNumber(profile.target_protein_g) * 0.8 && toNumber(profile.target_protein_g) > 0) {
    nutrientWins.push("strong protein intake");
  }
  if (totals.carbs >= 100) {
    nutrientWins.push("solid energy carbs");
  }
  if (totals.fats >= 40) {
    nutrientWins.push("healthy fats");
  }

  const nutrientSummary = nutrientWins.length
    ? `Nutrient highlight: ${nutrientWins.slice(0, 2).join(" and ")}.`
    : "Nutrient highlight: balanced macro coverage today.";

  return `Today: ${pieces.join(" | ")}. ${nutrientSummary}`;
}

function chooseMealSuggestion(snapshot: SnapshotPayload): string {
  const meals = Array.isArray(snapshot.recommendedMeals) ? snapshot.recommendedMeals : [];
  if (!meals.length) {
    return "Open SeekEatz for nearby meal picks that fit your remaining macros.";
  }

  const totals = summarizeTotals(snapshot);
  const profile = snapshot.profile ?? {};

  const remainingCalories = Math.max(0, toNumber(profile.target_calories) - totals.calories);
  const remainingProtein = Math.max(0, toNumber(profile.target_protein_g) - totals.protein);
  const remainingCarbs = Math.max(0, toNumber(profile.target_carbs_g) - totals.carbs);
  const remainingFats = Math.max(0, toNumber(profile.target_fats_g) - totals.fats);

  const sorted = [...meals].sort((a, b) => {
    const aScore =
      Math.abs(toNumber(a.calories) - remainingCalories) * 1.0 +
      Math.abs(toNumber(a.protein) - remainingProtein) * 2.5 +
      Math.abs(toNumber(a.carbs) - remainingCarbs) * 1.2 +
      Math.abs(toNumber(a.fats) - remainingFats) * 1.4;

    const bScore =
      Math.abs(toNumber(b.calories) - remainingCalories) * 1.0 +
      Math.abs(toNumber(b.protein) - remainingProtein) * 2.5 +
      Math.abs(toNumber(b.carbs) - remainingCarbs) * 1.2 +
      Math.abs(toNumber(b.fats) - remainingFats) * 1.4;

    return aScore - bScore;
  });

  const best = sorted[0];
  return `${best.name ?? "Nearby meal"} at ${best.restaurant ?? "a nearby spot"}: ${Math.round(toNumber(best.calories))} cal, ${Math.round(toNumber(best.protein))}g protein.`;
}

async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  const grantedNow =
    current.granted ||
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (grantedNow) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });

  return (
    requested.granted ||
    requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

const INJECTED_SNAPSHOT_SCRIPT = `
(function() {
  function safeParse(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function readSnapshot() {
    try {
      var keys = Object.keys(localStorage || {});
      var authKey = keys.find(function(k) { return k.indexOf('supabase.auth.token') !== -1; });
      var auth = authKey ? safeParse(localStorage.getItem(authKey)) : null;
      var user = auth && auth.user ? auth.user : null;
      var userId = user && user.id ? user.id : null;
      var userEmail = user && user.email ? user.email : null;

      var prefsKey = 'seekeatz-notification-prefs:' + (userEmail || 'guest');
      var prefs = safeParse(localStorage.getItem(prefsKey)) || {
        mealSuggestions: false,
        dailySummary: false,
        progressReminders: false,
      };

      var profile = safeParse(localStorage.getItem('userProfile')) || {};

      var scopedLoggedKey = userId ? 'seekeatz_logged_meals:' + userId : 'seekeatz_logged_meals:guest';
      var legacyLoggedKey = 'seekeatz_logged_meals';
      var loggedMeals = safeParse(localStorage.getItem(scopedLoggedKey)) || safeParse(localStorage.getItem(legacyLoggedKey)) || [];
      if (!Array.isArray(loggedMeals)) loggedMeals = [];

      var recommendedMeals = safeParse(localStorage.getItem('seekeatz_recommended_meals')) || [];
      if (!Array.isArray(recommendedMeals)) recommendedMeals = [];

      var payload = {
        type: 'seekeatz_snapshot',
        payload: {
          userId: userId,
          userEmail: userEmail,
          prefs: {
            mealSuggestions: prefs.mealSuggestions === true,
            dailySummary: prefs.dailySummary === true,
            progressReminders: prefs.progressReminders === true,
          },
          profile: profile,
          loggedMeals: loggedMeals,
          recommendedMeals: recommendedMeals.slice(0, 30),
          lastActivityAt: localStorage.getItem('seekEatz_lastActivity'),
          ts: Date.now(),
        }
      };

      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    } catch (_) {}
  }

  readSnapshot();
  setInterval(readSnapshot, 30000);
  window.addEventListener('storage', readSnapshot);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') readSnapshot();
  });
})();
true;
`;

export default function App() {
  const prefsRef = useRef<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const snapshotRef = useRef<SnapshotPayload | null>(null);
  const reminderIndexRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastActivityMsRef = useRef(0);
  const lastLoggedCountRef = useRef(0);
  const scheduleSignatureRef = useRef<string>("");

  const cancelManagedNotificationsByKind = useCallback(async (kind: string) => {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    const managed = pending.filter((request) => {
      const data = request.content.data as Record<string, unknown> | undefined;
      return data?.seekeatzManaged === true && data?.kind === kind;
    });

    await Promise.all(managed.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
  }, []);

  const scheduleDailySummary = useCallback(async () => {
    await cancelManagedNotificationsByKind("daily-summary");

    const snapshot = snapshotRef.current;
    if (!snapshot || !prefsRef.current.dailySummary) {
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Your SeekEatz daily summary",
        body: buildDailySummaryBody(snapshot),
        data: {
          seekeatzManaged: true,
          kind: "daily-summary",
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 21,
        minute: 0,
      },
    });
  }, [cancelManagedNotificationsByKind]);

  const scheduleMealSuggestion = useCallback(async () => {
    await cancelManagedNotificationsByKind("meal-suggestion");

    const snapshot = snapshotRef.current;
    if (!snapshot || !prefsRef.current.mealSuggestions) {
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Meal suggestion based on your remaining macros",
        body: chooseMealSuggestion(snapshot),
        data: {
          seekeatzManaged: true,
          kind: "meal-suggestion",
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 12,
        minute: 30,
      },
    });
  }, [cancelManagedNotificationsByKind]);

  const scheduleProgressReminder = useCallback(async () => {
    await cancelManagedNotificationsByKind("progress-reminder");

    if (!prefsRef.current.progressReminders) {
      return;
    }

    const line = PROGRESS_REMINDER_LINES[reminderIndexRef.current % PROGRESS_REMINDER_LINES.length];
    reminderIndexRef.current += 1;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "SeekEatz reminder",
        body: line,
        data: {
          seekeatzManaged: true,
          kind: "progress-reminder",
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 45 * 60,
        repeats: false,
      },
    });
  }, [cancelManagedNotificationsByKind]);

  const syncSchedules = useCallback(async () => {
    const snapshot = snapshotRef.current;
    const prefs = prefsRef.current;

    const signature = JSON.stringify({
      prefs,
      totals: snapshot ? summarizeTotals(snapshot) : null,
      suggestionAnchor: snapshot?.recommendedMeals?.[0]?.name ?? null,
    });

    if (signature === scheduleSignatureRef.current) {
      return;
    }

    const permission = await ensureNotificationPermission();
    if (!permission) {
      return;
    }

    scheduleSignatureRef.current = signature;
    await scheduleDailySummary();
    await scheduleMealSuggestion();

    if (!prefs.progressReminders) {
      await cancelManagedNotificationsByKind("progress-reminder");
    }
  }, [cancelManagedNotificationsByKind, scheduleDailySummary, scheduleMealSuggestion]);

  const handleSnapshotMessage = useCallback(async (snapshot: SnapshotPayload) => {
    snapshotRef.current = snapshot;

    const incomingPrefs = snapshot.prefs ?? DEFAULT_NOTIFICATION_PREFERENCES;
    prefsRef.current = {
      mealSuggestions: incomingPrefs.mealSuggestions === true,
      dailySummary: incomingPrefs.dailySummary === true,
      progressReminders: incomingPrefs.progressReminders === true,
    };

    const activityMs = toNumber(snapshot.lastActivityAt);
    const loggedCount = Array.isArray(snapshot.loggedMeals) ? snapshot.loggedMeals.length : 0;

    if (prefsRef.current.progressReminders && activityMs > 0 && activityMs > lastActivityMsRef.current) {
      lastActivityMsRef.current = activityMs;
      const permission = await ensureNotificationPermission();
      if (permission) {
        await scheduleProgressReminder();
      }
    }

    if (loggedCount > lastLoggedCountRef.current) {
      await cancelManagedNotificationsByKind("progress-reminder");
    }
    lastLoggedCountRef.current = loggedCount;

    await syncSchedules();
  }, [cancelManagedNotificationsByKind, scheduleProgressReminder, syncSchedules]);

  const handleWebViewMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const parsed = JSON.parse(event.nativeEvent.data) as { type?: string; payload?: SnapshotPayload };
      if (parsed.type === "seekeatz_snapshot" && parsed.payload) {
        await handleSnapshotMessage(parsed.payload);
      }
    } catch {
      // Ignore non-JSON postMessage payloads
    }
  }, [handleSnapshotMessage]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      appStateRef.current = nextAppState;

      if (wasBackground && nextAppState === "active") {
        void syncSchedules();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [syncSchedules]);

  const injectedJavaScript = useMemo(() => INJECTED_SNAPSHOT_SCRIPT, []);

  if (!isValidUrl) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.errorTitle}>SeekEatz iOS Shell</Text>
        <Text style={styles.errorText}>
          Invalid EXPO_PUBLIC_WEB_APP_URL. Set it to a valid https URL.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <WebView
        source={{ uri: webAppUrl }}
        originWhitelist={["*"]}
        hideKeyboardAccessoryView
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        allowsBackForwardNavigationGestures
        onMessage={handleWebViewMessage}
        injectedJavaScript={injectedJavaScript}
        renderLoading={() => (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#0891b2" />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#ffffff",
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 12,
    textAlign: "center",
  },
  errorText: {
    fontSize: 15,
    color: "#475569",
    textAlign: "center",
    lineHeight: 22,
  },
});
