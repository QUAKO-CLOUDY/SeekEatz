"use client";

// TEMPORARY billing diagnostics page. Open https://seekeatz.com/debug/billing
// inside the iOS app to see exactly what RevenueCat returns for the currently
// signed-in account, and how it maps to the backend entitlement. Safe to delete
// once the subscription flow is confirmed working.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { isNativeApp } from "@/lib/native-runtime";
import {
  getRevenueCatCustomerInfo,
  isNativeBillingBridgeAvailable,
  reconcileRevenueCatEntitlement,
} from "@/lib/billing/revenuecat-client";

type Line = { label: string; value: string };

function Section({ title, lines }: { title: string; lines: Line[] }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {lines.map((line) => (
          <div
            key={line.label}
            style={{
              display: "flex",
              flexDirection: "column",
              borderBottom: "1px solid #e5e7eb",
              paddingBottom: 6,
            }}
          >
            <span style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>
              {line.label}
            </span>
            <span style={{ fontSize: 14, wordBreak: "break-all", fontFamily: "monospace" }}>
              {line.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BillingDebugPage() {
  const [lines, setLines] = useState<Line[]>([]);
  const [raw, setRaw] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    const next: Line[] = [];

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      next.push({ label: "Native app?", value: String(isNativeApp()) });
      next.push({ label: "Billing bridge available?", value: String(isNativeBillingBridgeAvailable()) });
      next.push({ label: "Supabase user id (= RC appUserID)", value: user?.id ?? "(not signed in)" });
      next.push({ label: "Supabase email", value: user?.email ?? "(none)" });

      if (!user) {
        setLines(next);
        return;
      }

      // 1) What does RevenueCat say this account owns?
      try {
        const customerInfo = (await getRevenueCatCustomerInfo({
          appUserID: user.id,
          email: user.email ?? null,
        })) as unknown as {
          originalAppUserId?: string;
          entitlements?: { active?: Record<string, { isActive?: boolean; expirationDate?: string | null; productIdentifier?: string }> };
        };

        const active = customerInfo.entitlements?.active ?? {};
        const activeKeys = Object.keys(active);
        const premium = active["premium"];

        next.push({ label: "RC originalAppUserId", value: customerInfo.originalAppUserId ?? "(none)" });
        next.push({
          label: "RC appUserID matches Supabase id?",
          value: String((customerInfo.originalAppUserId ?? "") === user.id) + " (originalAppUserId vs current)",
        });
        next.push({ label: "RC active entitlement keys", value: activeKeys.length ? activeKeys.join(", ") : "(none)" });
        next.push({ label: "RC premium.isActive", value: String(premium?.isActive === true) });
        next.push({ label: "RC premium expires", value: premium?.expirationDate ?? "(n/a)" });
        next.push({ label: "RC premium product", value: premium?.productIdentifier ?? "(n/a)" });

        setRaw(JSON.stringify(customerInfo, null, 2));
      } catch (rcError) {
        next.push({
          label: "RC getCustomerInfo ERROR",
          value: rcError instanceof Error ? rcError.message : String(rcError),
        });
      }

      // 2) Reconcile (pull RC -> sync to backend) and show what backend wrote.
      try {
        const reconciled = await reconcileRevenueCatEntitlement({
          appUserID: user.id,
          email: user.email ?? null,
        });
        const ent = reconciled?.synced?.entitlement as
          | { billingTier?: string; billingStatus?: string; hasPremiumAccess?: boolean }
          | undefined;
        next.push({ label: "Sync -> billingTier", value: ent?.billingTier ?? "(no sync / null)" });
        next.push({ label: "Sync -> billingStatus", value: ent?.billingStatus ?? "(no sync / null)" });
        next.push({ label: "Sync -> hasPremiumAccess", value: String(ent?.hasPremiumAccess ?? "(no sync / null)") });
      } catch (syncError) {
        next.push({
          label: "Reconcile ERROR",
          value: syncError instanceof Error ? syncError.message : String(syncError),
        });
      }

      // 3) What the app's entitlement endpoint currently returns.
      try {
        const resp = await fetch("/api/account/entitlement", { cache: "no-store" });
        const ent = (await resp.json()) as {
          billingTier?: string;
          billingStatus?: string;
          hasPremiumAccess?: boolean;
        };
        next.push({ label: "Backend billingTier", value: ent.billingTier ?? "(none)" });
        next.push({ label: "Backend billingStatus", value: ent.billingStatus ?? "(none)" });
        next.push({ label: "Backend hasPremiumAccess", value: String(ent.hasPremiumAccess) });
      } catch (entError) {
        next.push({
          label: "Entitlement endpoint ERROR",
          value: entError instanceof Error ? entError.message : String(entError),
        });
      }

      setLines(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLines(next);
    } finally {
      setIsRunning(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <div style={{ padding: 20, maxWidth: 640, margin: "0 auto", color: "#111827", background: "#fff", minHeight: "100%" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Billing diagnostics</h1>
      <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 16px" }}>
        Temporary page. Compares the signed-in account against RevenueCat and the backend entitlement.
      </p>

      <button
        type="button"
        onClick={() => void run()}
        disabled={isRunning}
        style={{
          marginBottom: 20,
          padding: "10px 16px",
          borderRadius: 999,
          border: "none",
          background: isRunning ? "#9ca3af" : "#0891b2",
          color: "#fff",
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        {isRunning ? "Running..." : "Re-run checks"}
      </button>

      {error ? (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "#fef2f2", color: "#b91c1c", fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <Section title="Results" lines={lines} />

      {raw ? (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>Raw customerInfo</h2>
          <pre
            style={{
              fontSize: 11,
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 12,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {raw}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
