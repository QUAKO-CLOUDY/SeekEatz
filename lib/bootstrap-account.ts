import type { AppEntitlement } from "@/lib/entitlements";
import { writeCachedEntitlement } from "@/lib/entitlements";
import type { UserProfile } from "@/app/types";

type BootstrapResponse = {
  entitlement: AppEntitlement;
  waitlistGrantApplied: boolean;
};

export async function bootstrapAccount(params: {
  profile?: Partial<UserProfile> | null;
  hasCompletedOnboarding?: boolean;
}) {
  const response = await fetch("/api/account/bootstrap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Bootstrap failed with status ${response.status}`);
  }

  const payload = (await response.json()) as BootstrapResponse;
  writeCachedEntitlement(payload.entitlement);
  return payload;
}
