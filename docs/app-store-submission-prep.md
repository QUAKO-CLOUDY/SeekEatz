# App Store Submission Prep

## Current repo-side status

These are already in place:

- Production build passes
- TypeScript passes
- Search / chat / swap / logo / DB audits pass
- Capacitor iOS scaffold exists
- Native-safe external link handling is in place
- RevenueCat client and App Store sync scaffold are in place
- Public legal/support pages exist:
  - Privacy Policy: `https://seekeatz.com/legal/privacy`
  - Terms of Service: `https://seekeatz.com/legal/terms`
  - Support: `https://seekeatz.com/help/contact`
  - FAQ: `https://seekeatz.com/help/faq`

## Main blocker before submission

### 1. In-app account deletion flow

This is the main App Store compliance gap.

Current state:

- Users can create accounts in-app
- Privacy policy says users may request deletion
- There is no actual in-app account deletion flow yet

Why it matters:

- Apple requires apps that let users create accounts to also let users initiate account deletion in-app

Required implementation:

- Add an account deletion entry in Settings / Account
- Require explicit confirmation
- Delete or deactivate the auth account and user data through a secure server route
- Handle signed-out redirect and local state cleanup

This should be treated as a release blocker.

## App Store Connect metadata to prepare

These should be drafted now so submission is fast once Apple approves the developer account.

### App information

- App name: `SeekEatz`
- Subtitle
- Category:
  - Primary: likely `Food & Drink` or `Health & Fitness`
  - Recommendation: `Food & Drink`
- Secondary category: optional
- Age rating questionnaire

### Listing copy

- Promotional text
- Description
- Keywords
- What’s New text for version `1.0.0`

### URLs

- Support URL: `https://seekeatz.com/help/contact`
- Privacy Policy URL: `https://seekeatz.com/legal/privacy`
- Marketing URL: optional but recommended

### Review information

- App Review contact name
- App Review contact email
- App Review phone number
- Demo/test account if needed
- Notes for reviewer:
  - explain AI meal recommendation flow
  - explain premium/paywall behavior
  - explain that subscriptions are handled through Apple billing

## Subscription metadata to prepare

These must exist in App Store Connect before real purchase testing.

- Monthly product id
- Yearly product id
- Subscription group
- Display names
- Descriptions
- Pricing
- Localization
- Review screenshots for the subscription products

Recommended product ids:

- `com.seekeatz.premium.monthly`
- `com.seekeatz.premium.yearly`

Recommended entitlement name in RevenueCat:

- `premium`

## Privacy label prep

You will need App Privacy answers in App Store Connect. Based on current app behavior, these are the likely categories to review carefully:

- Contact Info
  - email address
- Location
  - if location-based restaurant search is enabled
- User Content
  - meal logs, saved meals, search/chat inputs
- Usage Data
  - search activity, feature interactions
- Diagnostics
  - if crash/error monitoring is added
- Identifiers
  - account/user id

These answers should be finalized from actual implementation, not guesses.

## Creative assets to prepare

### Required

- App icon set for iOS
- iPhone screenshots

### Recommended

- iPad screenshots if you support iPad
- App preview video
- Subscription paywall screenshots

Suggested screenshot set:

- Home search
- AI chat
- Meal results
- Meal detail with swaps
- Favorites / logging
- Upgrade / premium screen

## Repo-side checks before handoff to Mac/Xcode

Run these before final iOS packaging:

```powershell
npx tsc -p tsconfig.json --noEmit
npm run build
npm run audit:retrieval-queries
npm run audit:chat-routing
npm run audit:restaurant-search
npm run audit:restaurant-logos
npm run audit:swap-relations
npm run audit:db-quality
```

## Final Mac-side sequence

Do this only after repo-side release work is frozen:

1. Open `ios/` in Xcode on Mac
2. Configure signing/team/bundle id
3. Add icons / splash assets
4. Run simulator/device QA
5. Verify RevenueCat + App Store products
6. Run the iOS manual QA checklist
7. Archive
8. Upload to TestFlight
9. Fix mobile-only issues
10. Submit for App Review

## Recommended next repo-side task

Implement the in-app account deletion flow.

That is the cleanest next move because it removes the most obvious App Store compliance blocker while keeping scope focused.
