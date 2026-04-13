# Apple Subscription Implementation Plan

This is the repo-side implementation plan for App Store billing in SeekEatz.

The current app already has:

- plan UI on [upgrade page](c:/Users/isaac/my-meals-app/app/upgrade/page.tsx)
- entitlement calculation in [entitlements.ts](c:/Users/isaac/my-meals-app/lib/entitlements.ts)
- account bootstrap logic in [bootstrap route](c:/Users/isaac/my-meals-app/app/api/account/bootstrap/route.ts)
- waitlist free-month support in `profiles`

What is missing is the App Store purchase source of truth and the client/server sync path.

## Recommendation

Use **RevenueCat** as the first implementation.

Reason:

- fastest path to stable iOS subscriptions for a startup
- handles receipt validation and subscription state better than a hand-rolled implementation
- simpler restore purchase flow
- better operational tooling

Do **not** hand-roll StoreKit receipt verification as the first version unless there is a strong reason to avoid RevenueCat.

## Billing Model

Map App Store products to existing app tiers:

- monthly → `subscription_tier = 'monthly'`
- yearly → `subscription_tier = 'yearly'`

Profile entitlement remains the app-facing read model:

- `subscription_tier`
- `subscription_status`
- `trial_source`
- `trial_expires_at`

App Store verification data becomes the source of truth for paid subscriptions:

- `profiles.billing_provider = 'app_store'`
- `profiles.app_store_product_id`
- `profiles.app_store_original_transaction_id`
- `profiles.app_store_environment`
- `profiles.app_store_last_verified_at`
- `app_store_subscriptions` table for latest verified snapshot

## Product IDs

Expected client env vars:

- `NEXT_PUBLIC_APPLE_IAP_READY=true`
- `NEXT_PUBLIC_APPLE_IAP_MONTHLY_PRODUCT_ID`
- `NEXT_PUBLIC_APPLE_IAP_YEARLY_PRODUCT_ID`

These are now centralized in:

- [apple-products.ts](c:/Users/isaac/my-meals-app/lib/billing/apple-products.ts)

## Client Flow

Inside the Capacitor iOS app:

1. Load available App Store products.
2. User taps monthly or yearly purchase.
3. Start native purchase flow.
4. Receive purchase result from StoreKit / RevenueCat SDK.
5. Send verified purchase payload to backend sync endpoint.
6. Backend writes App Store source-of-truth rows.
7. Backend updates `profiles` entitlement columns.
8. Client refreshes `/api/account/entitlement`.
9. Upgrade/settings UI reflects premium access.

Required client features:

- purchase monthly
- purchase yearly
- restore purchases
- refresh entitlement after purchase/restore
- pending/error/canceled states

## Server Flow

Required server endpoint:

- `POST /api/account/app-store/sync`

Expected responsibilities:

1. Require authenticated user.
2. Validate purchase payload from client or trusted provider.
3. Resolve product id → billing tier.
4. Upsert `app_store_subscriptions`.
5. Update `profiles`:
   - `billing_provider`
   - `subscription_tier`
   - `subscription_status`
   - `app_store_product_id`
   - `app_store_original_transaction_id`
   - `app_store_environment`
   - `app_store_last_verified_at`
6. Preserve waitlist trial logic where appropriate.
7. Return fresh entitlement payload.

Optional but recommended later:

- App Store server notifications endpoint
- scheduled revalidation/repair job

## Entitlement Rules

Priority order:

1. admin/master override
2. active App Store paid subscription
3. active waitlist free-month trial
4. free tier

Rules:

- active App Store subscription overrides free tier
- waitlist trial should not overwrite a valid paid App Store entitlement
- restore purchase must recover premium state even after reinstall
- canceled subscription with unexpired term still has access until expiry
- expired sandbox purchase should degrade cleanly to free unless another active source exists

## Upgrade Screen Changes Needed Later

Current [upgrade page](c:/Users/isaac/my-meals-app/app/upgrade/page.tsx):

- already shows free / monthly / yearly plans
- already checks entitlement
- now uses centralized Apple config readiness

What still needs implementation:

- signed-in purchase CTA should call native billing, not stay disabled
- signed-in restore purchases CTA
- signed-in manage subscription CTA
- purchase loading/error state

## Settings Screen Changes Needed Later

Settings should eventually include:

- current billing provider
- current plan
- restore purchases
- manage subscription

Do not add these until the purchase flow exists.

## QA Matrix

Minimum billing QA:

- signed-out free user → upgrade path
- signed-in free user → monthly purchase
- signed-in free user → yearly purchase
- restore purchases after reinstall
- canceled but still active subscription
- expired subscription
- waitlist free-month user upgrading to paid
- premium user sign out / sign in persistence

## Task Order

1. Create App Store Connect products.
2. Decide billing stack:
   - recommended: RevenueCat
3. Add iOS purchase SDK in Capacitor shell.
4. Implement client purchase + restore flow.
5. Implement backend sync endpoint.
6. Update entitlement refresh flow.
7. Run manual billing QA.
8. Then TestFlight.

## What Is Already Done

- App-side tier/status/trial model exists.
- Upgrade screen is premium-aware.
- Waitlist free-month entitlement exists.
- DB migration now includes App Store-specific source-of-truth fields and table.

## Remaining Repo Work After This Plan

The next implementation task should be:

- choose RevenueCat vs direct StoreKit
- then build the backend sync endpoint and client abstraction around that choice
