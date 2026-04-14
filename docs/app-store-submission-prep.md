# App Store Submission Prep

This is the final release gate for SeekEatz before App Store submission.

Use this as a strict checklist, not a brainstorming doc.

## Current repo-side status

These are already in place:

- `npm run lint` passes with `0 errors` and `0 warnings`
- Search retrieval audits are passing
- Exact restaurant-name coverage is passing
- iOS location usage string exists in [Info.plist](/c:/Users/isaac/my-meals-app/ios/App/App/Info.plist)
- App privacy manifest exists in [PrivacyInfo.xcprivacy](/c:/Users/isaac/my-meals-app/ios/App/App/PrivacyInfo.xcprivacy)
- In-app account deletion exists in [app/settings/account/page.tsx](/c:/Users/isaac/my-meals-app/app/settings/account/page.tsx) and [app/api/account/delete/route.ts](/c:/Users/isaac/my-meals-app/app/api/account/delete/route.ts)
- RevenueCat/App Store scaffolding exists in [lib/billing/revenuecat-client.ts](/c:/Users/isaac/my-meals-app/lib/billing/revenuecat-client.ts), [app/upgrade/page.tsx](/c:/Users/isaac/my-meals-app/app/upgrade/page.tsx), and [app/api/account/app-store/sync/route.ts](/c:/Users/isaac/my-meals-app/app/api/account/app-store/sync/route.ts)
- Public legal/support pages exist:
  - Privacy Policy: `https://seekeatz.com/legal/privacy`
  - Terms: `https://seekeatz.com/legal/terms`
  - Support: `https://seekeatz.com/help/contact`
  - FAQ: `https://seekeatz.com/help/faq`

## What is actually release-blocking

Do not submit until all of these are true:

- The native iPhone build launches reliably from a cold start
- Sign up, sign in, sign out, and account deletion work inside the iOS shell
- AI chat returns meal cards without `401`, blank states, or spinner hangs
- Home search returns meal cards and opens meal detail reliably
- Location allow and deny both behave correctly
- Upgrade, restore purchases, and subscription management are coherent on-device
- App Store Connect privacy answers match the app’s actual behavior
- App Review can access the app without getting stuck
- No crash, white screen, auth loop, or dead-end CTA exists in the core flow

## Repo-side verification before handoff to Xcode

Run all of these from the repo root:

```powershell
npm run lint
npm run build
npm run audit:retrieval-queries
npm run audit:restaurant-search
npm run audit:restaurant-readiness
npm run audit:db-quality
npm run test:retrieval-parser
npm run test:retrieval-guardrails
```

If any of these fail, fix them before native QA.

## Native iPhone QA checklist

Run the full device pass in [ios-manual-qa-checklist.md](/c:/Users/isaac/my-meals-app/docs/ios-manual-qa-checklist.md).

Minimum required coverage:

- one real iPhone on current iOS
- one simulator
- one signed-out pass
- one signed-in free-user pass
- one signed-in premium/sandbox pass

## App Store Connect metadata checklist

Prepare all of this before submission:

- App name
- Subtitle
- Category
- Age rating questionnaire
- Description
- Keywords
- Promotional text
- What’s New text
- Support URL
- Privacy Policy URL
- Review contact name/email/phone
- App Review notes
- Demo account credentials if reviewer needs authentication

Review notes should explicitly mention:

- the app provides AI-assisted meal search and meal cards
- location access is optional and used only for nearby results
- subscriptions are handled through Apple billing / RevenueCat
- account deletion is available in `Settings -> Account`

## App Privacy checklist

Before submission, verify the App Privacy form against the actual app.

Based on the codebase, review at minimum:

- Contact Info
  - email address
- Location
  - optional location data for nearby results
- User Content
  - search/chat prompts, saved meals, logged meals, favorites
- Identifiers
  - account/user id
- Purchases
  - subscription and entitlement state
- Usage Data
  - if you are logging feature/search usage

Do not guess here. Match App Store Connect answers to the app and third-party services actually used.

## Billing checklist

Before submission, verify:

- App Store product IDs are finalized
- RevenueCat iOS public SDK key is set in production env
- RevenueCat entitlement ID matches the app logic
- purchase flow works on a sandbox test account
- restore purchases works on-device
- manage subscription opens correctly from the account screen

Relevant implementation files:

- [app/upgrade/page.tsx](/c:/Users/isaac/my-meals-app/app/upgrade/page.tsx)
- [app/settings/account/page.tsx](/c:/Users/isaac/my-meals-app/app/settings/account/page.tsx)
- [lib/billing/revenuecat-client.ts](/c:/Users/isaac/my-meals-app/lib/billing/revenuecat-client.ts)
- [lib/billing/apple-products.ts](/c:/Users/isaac/my-meals-app/lib/billing/apple-products.ts)

## Auth and account checklist

Must be verified on-device:

- sign up
- email verification / OTP if used
- sign in with valid credentials
- invalid sign-in error state
- sign out
- account deletion
- post-delete redirect and local cleanup
- anonymous-to-authenticated data claim if applicable

Relevant files:

- [app/auth/signup/page.tsx](/c:/Users/isaac/my-meals-app/app/auth/signup/page.tsx)
- [app/auth/signin/page.tsx](/c:/Users/isaac/my-meals-app/app/auth/signin/page.tsx)
- [app/settings/account/page.tsx](/c:/Users/isaac/my-meals-app/app/settings/account/page.tsx)
- [app/api/account/delete/route.ts](/c:/Users/isaac/my-meals-app/app/api/account/delete/route.ts)
- [app/api/claim-anon-data/route.ts](/c:/Users/isaac/my-meals-app/app/api/claim-anon-data/route.ts)

## Location checklist

Must be verified on-device:

- first-time location prompt appears only when expected
- allow location returns nearby meal results
- deny location does not break search/chat
- app still works after permission denial
- location explanation text is accurate

Relevant files:

- [ios/App/App/Info.plist](/c:/Users/isaac/my-meals-app/ios/App/App/Info.plist)
- [app/components/OnboardingFlow.tsx](/c:/Users/isaac/my-meals-app/app/components/OnboardingFlow.tsx)
- [app/components/HomeScreen.tsx](/c:/Users/isaac/my-meals-app/app/components/HomeScreen.tsx)
- [app/components/AIChat.tsx](/c:/Users/isaac/my-meals-app/app/components/AIChat.tsx)

## Creative assets checklist

Prepare:

- final app icon
- iPhone screenshots
- optional iPad screenshots if supported
- optional app preview video
- subscription/paywall screenshots if useful for review or marketing

Recommended screenshot set:

- home search
- AI chat
- meal cards
- meal detail with swaps
- saved/logged meals
- upgrade screen
- account screen showing subscription management

## Final submission sequence

1. Freeze repo changes for the submission build.
2. Run the repo-side verification commands.
3. Open the iOS app in Xcode on the Mac.
4. Run the full native QA checklist.
5. Fix any iOS-only issues.
6. Archive the app.
7. Upload to TestFlight.
8. Run one final smoke pass from the TestFlight build.
9. Submit with final metadata, privacy answers, and review notes.

## Practical recommendation

The codebase is no longer the obvious blocker. The highest-risk remaining work is operational:

- native iPhone QA
- billing/restore validation
- App Store Connect privacy answers
- accurate App Review notes

That is where submission effort should go next.
