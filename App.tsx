import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, AppState, AppStateStatus, Linking, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import * as Notifications from "expo-notifications";
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import appConfig from "./app.json";

const APP_VERSION = appConfig?.expo?.version ?? "";
const APP_BUILD = appConfig?.expo?.ios?.buildNumber ?? "";

const DEFAULT_WEB_APP_URL = "https://seekeatz.com";
const webAppUrl = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim() || DEFAULT_WEB_APP_URL;
const isValidUrl = /^https?:\/\//i.test(webAppUrl);
const revenueCatIosPublicSdkKey =
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_PUBLIC_SDK_KEY?.trim() ||
  process.env.EXPO_PUBLIC_REVENUECAT_API_KEY?.trim() ||
  "";
const revenueCatMonthlyProductId =
  process.env.EXPO_PUBLIC_APPLE_IAP_MONTHLY_PRODUCT_ID?.trim() ||
  process.env.EXPO_PUBLIC_REVENUECAT_MONTHLY_PRODUCT_ID?.trim() ||
  "";
const revenueCatYearlyProductId =
  process.env.EXPO_PUBLIC_APPLE_IAP_YEARLY_PRODUCT_ID?.trim() ||
  process.env.EXPO_PUBLIC_REVENUECAT_YEARLY_PRODUCT_ID?.trim() ||
  "";
const revenueCatIapReady =
  process.env.EXPO_PUBLIC_APPLE_IAP_READY?.trim().toLowerCase() !== "false" &&
  process.env.EXPO_PUBLIC_APPLE_IAP_READY?.trim() !== "0" &&
  revenueCatIosPublicSdkKey.startsWith("appl_");

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

type NativeBillingRequest = {
  type?: string;
  requestId?: string;
  tier?: "monthly" | "yearly";
  appUserID?: string;
  email?: string | null;
};

type NativeBillingResponse = {
  type: "seekeatz_native_billing_response";
  requestId: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
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
  const webViewRef = useRef<WebView>(null);
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

  const openExternalUrl = useCallback(async (url: string) => {
    if (!/^https?:\/\//i.test(url)) {
      return;
    }

    try {
      await Linking.openURL(url);
    } catch (error) {
      console.warn("Failed to open external URL:", error);
    }
  }, []);

  const postBillingResponseToWebView = useCallback((response: NativeBillingResponse) => {
    const script = `
      window.dispatchEvent(new CustomEvent('seekeatz_native_billing_response', {
        detail: ${JSON.stringify(response)}
      }));
      true;
    `;
    webViewRef.current?.injectJavaScript(script);
  }, []);

  const ensureRevenueCatConfigured = useCallback(async (appUserID: string, email?: string | null) => {
    // Safe to log: only the first 8 chars of the publishable key, never the full value.
    const keyPreview = revenueCatIosPublicSdkKey
      ? `${revenueCatIosPublicSdkKey.slice(0, 8)}...`
      : "(empty)";

    if (!revenueCatIapReady) {
      console.warn("[billing][native] RevenueCat not configured", {
        keyPreview,
        startsWithAppl: revenueCatIosPublicSdkKey.startsWith("appl_"),
        iapReady: revenueCatIapReady,
      });
      throw new Error("RevenueCat is not fully configured in the native app.");
    }

    const alreadyConfigured = await Purchases.isConfigured();
    if (!alreadyConfigured) {
      await Purchases.setLogLevel(LOG_LEVEL.INFO);
      Purchases.configure({
        apiKey: revenueCatIosPublicSdkKey,
        appUserID,
        shouldShowInAppMessagesAutomatically: true,
      });
    }

    const initialized = await Purchases.isConfigured();
    console.log("[billing][native] RevenueCat configure", {
      keyPreview,
      startsWithAppl: revenueCatIosPublicSdkKey.startsWith("appl_"),
      wasAlreadyConfigured: alreadyConfigured,
      initialized,
    });

    const currentAppUserID = await Purchases.getAppUserID();
    console.log("[billing][native] appUserID before login", {
      currentAppUserID,
      requestedAppUserID: appUserID,
      isAnonymous: currentAppUserID?.startsWith("$RCAnonymousID:") ?? false,
    });

    if (currentAppUserID !== appUserID) {
      await Purchases.logIn(appUserID);
    }

    const appUserIDAfterLogin = await Purchases.getAppUserID();
    console.log("[billing][native] appUserID after login", {
      appUserIDAfterLogin,
      requestedAppUserID: appUserID,
      matchesSupabaseUser: appUserIDAfterLogin === appUserID,
      isAnonymous: appUserIDAfterLogin?.startsWith("$RCAnonymousID:") ?? false,
    });

    if (email) {
      await Purchases.setEmail(email);
    }
  }, []);

  const getRevenueCatPackageForTier = useCallback(async (tier: "monthly" | "yearly") => {
    const offerings = await Purchases.getOfferings();
    const currentOffering = offerings.current;
    if (!currentOffering) {
      return null;
    }

    if (tier === "monthly" && currentOffering.monthly) {
      return currentOffering.monthly;
    }

    if (tier === "yearly" && currentOffering.annual) {
      return currentOffering.annual;
    }

    const productId = tier === "monthly" ? revenueCatMonthlyProductId : revenueCatYearlyProductId;
    if (!productId) {
      return null;
    }

    return (
      currentOffering.availablePackages.find(
        (entry) => entry.product.identifier === productId,
      ) ?? null
    );
  }, []);

  const handleNativeBillingRequest = useCallback(async (request: NativeBillingRequest) => {
    const requestId = request.requestId;
    if (!requestId || !request.appUserID) {
      return;
    }

    try {
      await ensureRevenueCatConfigured(request.appUserID, request.email);

      if (request.type === "revenuecat_purchase") {
        if (request.tier !== "monthly" && request.tier !== "yearly") {
          throw new Error("Missing purchase tier.");
        }

        const packageToPurchase = await getRevenueCatPackageForTier(request.tier);
        if (!packageToPurchase) {
          throw new Error(`No ${request.tier} package is available in RevenueCat.`);
        }

        const appUserIDBeforePurchase = await Purchases.getAppUserID();
        console.log("[billing][native] appUserID before purchase", {
          appUserIDBeforePurchase,
          requestedAppUserID: request.appUserID,
          matchesSupabaseUser: appUserIDBeforePurchase === request.appUserID,
          isAnonymous: appUserIDBeforePurchase?.startsWith("$RCAnonymousID:") ?? false,
        });

        const result = await Purchases.purchasePackage(packageToPurchase);

        // Immediately refresh customerInfo so the entitlement reflects the
        // purchase that just completed (the purchase result can lag behind).
        let customerInfo = result.customerInfo;
        try {
          customerInfo = await Purchases.getCustomerInfo();
        } catch (refreshError) {
          console.warn("[billing][native] getCustomerInfo after purchase failed", refreshError);
        }

        const appUserIDAfterPurchase = await Purchases.getAppUserID();
        const entitlementId =
          process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID?.trim() || "premium";
        console.log("[billing][native] purchase success", {
          productIdentifier: result.productIdentifier,
          appUserIDAfterPurchase,
          requestedAppUserID: request.appUserID,
          matchesSupabaseUser: appUserIDAfterPurchase === request.appUserID,
          originalAppUserId: customerInfo?.originalAppUserId,
          activeEntitlementKeys: Object.keys(customerInfo?.entitlements?.active ?? {}),
          premiumIsActive:
            customerInfo?.entitlements?.active?.[entitlementId]?.isActive === true,
        });

        postBillingResponseToWebView({
          type: "seekeatz_native_billing_response",
          requestId,
          ok: true,
          payload: { customerInfo, productIdentifier: result.productIdentifier },
        });
        return;
      }

      if (request.type === "revenuecat_restore") {
        await Purchases.restorePurchases();
        // Re-fetch the canonical customerInfo after restore.
        const customerInfo = await Purchases.getCustomerInfo();
        const appUserIDAfterRestore = await Purchases.getAppUserID();
        const entitlementId =
          process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID?.trim() || "premium";
        console.log("[billing][native] restore success", {
          appUserIDAfterRestore,
          requestedAppUserID: request.appUserID,
          matchesSupabaseUser: appUserIDAfterRestore === request.appUserID,
          originalAppUserId: customerInfo?.originalAppUserId,
          activeEntitlementKeys: Object.keys(customerInfo?.entitlements?.active ?? {}),
          premiumIsActive:
            customerInfo?.entitlements?.active?.[entitlementId]?.isActive === true,
        });
        postBillingResponseToWebView({
          type: "seekeatz_native_billing_response",
          requestId,
          ok: true,
          payload: { customerInfo },
        });
        return;
      }

      if (request.type === "revenuecat_customer_info") {
        const customerInfo = await Purchases.getCustomerInfo();
        postBillingResponseToWebView({
          type: "seekeatz_native_billing_response",
          requestId,
          ok: true,
          payload: { customerInfo },
        });
      }
    } catch (error) {
      postBillingResponseToWebView({
        type: "seekeatz_native_billing_response",
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : "Native billing request failed.",
      });
    }
  }, [ensureRevenueCatConfigured, getRevenueCatPackageForTier, postBillingResponseToWebView]);

  const handleWebViewMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const parsed = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        payload?: SnapshotPayload;
        url?: string;
        requestId?: string;
        tier?: "monthly" | "yearly";
        appUserID?: string;
        email?: string | null;
      };

      if (parsed.type === "seekeatz_snapshot" && parsed.payload) {
        await handleSnapshotMessage(parsed.payload);
        return;
      }

      if (parsed.type === "open_external_url" && typeof parsed.url === "string") {
        await openExternalUrl(parsed.url);
        return;
      }

      if (
        parsed.type === "revenuecat_purchase" ||
        parsed.type === "revenuecat_restore" ||
        parsed.type === "revenuecat_customer_info"
      ) {
        await handleNativeBillingRequest(parsed);
      }
    } catch {
      // Ignore non-JSON postMessage payloads
    }
  }, [handleNativeBillingRequest, handleSnapshotMessage, openExternalUrl]);

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

  const injectedBeforeLoad = useMemo(
    () =>
      `(function(){try{window.__SEEKEATZ_NATIVE__=true;window.__APP_VERSION__=${JSON.stringify(
        APP_VERSION,
      )};window.__APP_BUILD__=${JSON.stringify(APP_BUILD)};}catch(_){}})();true;`,
    [],
  );

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
        ref={webViewRef}
        source={{ uri: webAppUrl }}
        originWhitelist={["*"]}
        contentMode="mobile"
        hideKeyboardAccessoryView
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        cacheEnabled
        startInLoadingState
        allowsBackForwardNavigationGestures
        onMessage={handleWebViewMessage}
        injectedJavaScriptBeforeContentLoaded={injectedBeforeLoad}
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

