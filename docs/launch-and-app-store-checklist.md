# Launch And App Store Checklist

Last updated: 2026-04-13

This consolidates the current repo state, prior Codex planning docs, and the gaps that still need to be closed before iOS rollout and App Store submission.

## Verified Current State

- [x] Production web build succeeds with `npm run build`.
- [x] iOS shell is configured with bundle ID `com.seekeatz.app` and app name `SeekEatz` in [capacitor.config.ts](/c:/Users/isaac/my-meals-app/capacitor.config.ts:7) and [project.pbxproj](/c:/Users/isaac/my-meals-app/ios/App/App.xcodeproj/project.pbxproj:313).
- [x] Location usage copy exists in [Info.plist](/c:/Users/isaac/my-meals-app/ios/App/App/Info.plist:27).
- [x] App privacy manifest file exists in [PrivacyInfo.xcprivacy](/c:/Users/isaac/my-meals-app/ios/App/App/PrivacyInfo.xcprivacy:1).
- [x] In-app account deletion exists in [account settings](/c:/Users/isaac/my-meals-app/app/settings/account/page.tsx:598) and [delete route](/c:/Users/isaac/my-meals-app/app/api/account/delete/route.ts:34).
- [x] App Store / RevenueCat purchase plumbing exists in [upgrade page](/c:/Users/isaac/my-meals-app/app/upgrade/page.tsx:125), [account screen](/c:/Users/isaac/my-meals-app/app/settings/account/page.tsx:401), [RevenueCat client](/c:/Users/isaac/my-meals-app/lib/billing/revenuecat-client.ts:174), and [App Store sync route](/c:/Users/isaac/my-meals-app/app/api/account/app-store/sync/route.ts:77).
- [x] Waitlist free-month bootstrap exists in [bootstrap route](/c:/Users/isaac/my-meals-app/app/api/account/bootstrap/route.ts:118) and [signup flow](/c:/Users/isaac/my-meals-app/app/auth/signup/page.tsx:359).
- [x] App Store submission, QA, listing, and rollout planning docs already exist in:
  - [app-store-submission-prep.md](/c:/Users/isaac/my-meals-app/docs/app-store-submission-prep.md:1)
  - [ios-manual-qa-checklist.md](/c:/Users/isaac/my-meals-app/docs/ios-manual-qa-checklist.md:1)
  - [app-store-listing-draft.md](/c:/Users/isaac/my-meals-app/docs/app-store-listing-draft.md:1)
  - [restaurant-rollout-audit.md](/c:/Users/isaac/my-meals-app/docs/restaurant-rollout-audit.md:1)
  - [data-rollout-and-pdf-prompt.md](/c:/Users/isaac/my-meals-app/docs/data-rollout-and-pdf-prompt.md:1)

## Verified Blockers And Risks

- [ ] Fix lint before cutting the release candidate. `npm run lint` currently fails in [utils/supabase/admin.ts](/c:/Users/isaac/my-meals-app/utils/supabase/admin.ts:3) with `@typescript-eslint/no-explicit-any`.
- [ ] Configure production Apple billing env vars. The code expects:
  - `NEXT_PUBLIC_APPLE_IAP_READY`
  - `NEXT_PUBLIC_APPLE_IAP_MONTHLY_PRODUCT_ID`
  - `NEXT_PUBLIC_APPLE_IAP_YEARLY_PRODUCT_ID`
  - `NEXT_PUBLIC_REVENUECAT_IOS_PUBLIC_SDK_KEY`
  - optional `NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID`
  - Source: [apple-products.ts](/c:/Users/isaac/my-meals-app/lib/billing/apple-products.ts:16)
- [ ] Confirm those Apple / RevenueCat vars exist in the actual release environment. They were not present in the repo-local `.env.local` during this audit.
- [ ] Run real-device iPhone QA. There is no evidence in the repo that the full native pass in [ios-manual-qa-checklist.md](/c:/Users/isaac/my-meals-app/docs/ios-manual-qa-checklist.md:1) has been completed.
- [ ] Run sandbox purchase, restore, and manage-subscription verification on-device. Billing code exists, but operational validation is still required.
- [ ] Finalize App Store Connect privacy answers against real behavior and third-party services. The local privacy manifest is currently empty, so App Store Connect answers need to be derived carefully from the code and SDK usage.
- [ ] Resolve product copy inconsistency around free usage:
  - landing still says `No signup required · 3 free searches` in [HeroSection.tsx](/c:/Users/isaac/my-meals-app/app/components/landing/HeroSection.tsx:85)
  - upgrade and API responses still mention `2 free` searches/chats in [upgrade page](/c:/Users/isaac/my-meals-app/app/upgrade/page.tsx:31), [chat route](/c:/Users/isaac/my-meals-app/app/api/chat/route.ts:910), [search route](/c:/Users/isaac/my-meals-app/app/api/search/route.ts:66), and auth screens
  - actual gating is disabled in [usage-gate.ts](/c:/Users/isaac/my-meals-app/lib/usage-gate.ts:2)
- [ ] Treat older guest-trial summaries as stale. Current code no longer enforces those limits.

## Release Checklist

### 1. Release-Candidate Cleanup

- [ ] Fix the lint errors in `utils/supabase/admin.ts`.
- [ ] Reconcile all free-tier messaging so pricing, landing copy, API error copy, and upgrade UI agree with actual behavior.
- [ ] Decide the actual free plan before launch:
  - unlimited guest access
  - limited daily searches
  - auth-required free tier
- [ ] Remove or update any stale summaries that could mislead release decisions, especially guest-trial docs.
- [ ] Replace the placeholder README with project-specific runbook basics if the repo will be handed to anyone else during launch week.

### 2. Billing And Backend Readiness

- [ ] Create App Store Connect subscription products for monthly and yearly tiers.
- [ ] Configure the matching RevenueCat products, offering, and entitlement ID.
- [ ] Set production env vars for Apple IAP and RevenueCat.
- [ ] Verify [upgrade page purchase flow](/c:/Users/isaac/my-meals-app/app/upgrade/page.tsx:125) works inside the iOS shell.
- [ ] Verify [restore flow](/c:/Users/isaac/my-meals-app/app/settings/account/page.tsx:401) updates entitlement correctly.
- [ ] Verify [manage subscription](/c:/Users/isaac/my-meals-app/app/settings/account/page.tsx:421) opens the correct App Store management path.
- [ ] Verify the backend sync route writes `app_store_subscriptions` and updates `profiles` correctly in production via [sync route](/c:/Users/isaac/my-meals-app/app/api/account/app-store/sync/route.ts:126).
- [ ] Verify waitlist free-month users do not lose premium state when they later upgrade to paid.

### 3. Data Rollout

- [ ] Apply `20260401000013_menu_item_relations.sql` if it is not already live.
- [ ] Run the relation backfill in the sequence captured in [data-rollout-and-pdf-prompt.md](/c:/Users/isaac/my-meals-app/docs/data-rollout-and-pdf-prompt.md:3).
- [ ] Fix the known raw JSON data issues listed in [restaurant-rollout-audit.md](/c:/Users/isaac/my-meals-app/docs/restaurant-rollout-audit.md:82) before broader rollout.
- [ ] Roll out Tier 1 swap-ready restaurants first, using the order in [restaurant-rollout-audit.md](/c:/Users/isaac/my-meals-app/docs/restaurant-rollout-audit.md:172).
- [ ] Re-run restaurant readiness and search audits after any major data import.

### 4. Native iOS QA

- [ ] Run the full smoke test on one physical iPhone and one simulator.
- [ ] Verify sign up, sign in, sign out, account deletion, and waitlist grant flow.
- [ ] Verify chat and home search both return meal cards without hangs or blank states.
- [ ] Verify meal detail, swaps, favorites, and meal logging.
- [ ] Verify location allow, deny, and later-revoked states.
- [ ] Verify safe areas, keyboard behavior, and navigation polish.
- [ ] Verify cold launch while signed in and signed out.
- [ ] Capture issue evidence for every failure using the format in [ios-manual-qa-checklist.md](/c:/Users/isaac/my-meals-app/docs/ios-manual-qa-checklist.md:140).

### 5. App Store Connect Setup

- [ ] Finalize listing metadata from [app-store-listing-draft.md](/c:/Users/isaac/my-meals-app/docs/app-store-listing-draft.md:19):
  - app name
  - subtitle
  - promotional text
  - keywords
  - description
  - What’s New
  - category
- [ ] Finalize support, privacy, and terms URLs.
- [ ] Complete the App Privacy questionnaire using actual data flows, not assumptions.
- [ ] Prepare App Review notes that explain:
  - AI-assisted restaurant meal search
  - optional location access
  - Apple billing via RevenueCat
  - account deletion path
- [ ] Prepare reviewer access details if a reviewer account is needed.
- [ ] Capture final screenshots. Apple only requires one 6.5-inch or 6.9-inch iPhone screenshot set for iPhone submissions per Apple’s September 11, 2024 App Store Connect release notes.

### 6. TestFlight And Submission

- [ ] Freeze the release candidate branch.
- [ ] Run `npm run lint` and `npm run build` on the final candidate.
- [ ] Archive the iOS app in Xcode with the final signing configuration.
- [ ] Upload to TestFlight.
- [ ] Install the TestFlight build on a real iPhone and run one final smoke pass.
- [ ] Submit to App Review with final metadata, privacy answers, and review notes.

### 7. Public Rollout

- [ ] Decide whether the waitlist page should remain live or redirect to the App Store when the app goes live.
- [ ] Export and prepare launch messaging for waitlist users, especially if the first-month-free offer is still active.
- [ ] Confirm support inbox ownership and response process before public launch.
- [ ] Confirm production monitoring plan for:
  - auth failures
  - search / chat 401s
  - billing sync failures
  - crash / blank-screen reports

## Recommended Next Moves

1. Fix the current lint failure.
2. Decide the real free-tier behavior and clean up every conflicting copy path.
3. Configure App Store products and RevenueCat in the release environment.
4. Run the full physical-iPhone QA pass, with sandbox billing.
5. Complete App Store Connect metadata, privacy answers, screenshots, and review notes.
6. Ship to TestFlight, smoke test the TestFlight build, then submit.

## External Notes

- Apple requires in-app account deletion for apps that create accounts. Current SeekEatz account deletion flow is directionally aligned, but it still needs full device validation.
  - Source: https://developer.apple.com/news/?id=i71db0mv
- App Store Connect privacy answers must reflect your actual app and third-party SDK behavior.
  - Source: https://developer.apple.com/app-store/user-privacy-and-data-use/
- Apple reduced screenshot requirements for iPhone submissions to a single 6.5-inch or 6.9-inch screenshot set.
  - Source: https://developer.apple.com/testflight/release-notes/
