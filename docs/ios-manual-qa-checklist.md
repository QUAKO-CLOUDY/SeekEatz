# iOS Manual QA Checklist

Use this checklist against the native iOS build, not just the web app.

Run it before TestFlight submission and again on the final build you submit to App Review.

## Preconditions

- Latest release candidate code is on the Mac
- `npm run lint` passes
- `npm run build` passes
- Core search audits pass
- The iOS project opens in Xcode
- Signing and bundle ID are configured
- Required env vars are set for the build you are testing
- Test accounts are ready:
  - one new/free account
  - one existing account
  - one sandbox billing account

## Required devices

Minimum:

- one physical iPhone on current iOS
- one simulator

Recommended:

- one smaller phone viewport
- one larger phone viewport

## Immediate release blockers

Stop the pass and fix before submission if any of these happen:

- app crashes
- blank screen or stuck splash
- auth redirect loop
- chat or search does not return meal cards
- meal detail fails to open
- favorites or meal logging fail silently
- location permission breaks the app
- purchase, restore, or manage-subscription flow is broken
- account deletion is missing or fails
- critical CTA is hidden behind keyboard or safe area

## Smoke test

Pass this first:

1. Cold launch the app.
2. Confirm initial screen renders cleanly.
3. Sign up or sign in.
4. Run one AI chat query that returns meal cards.
5. Run one Home search that returns meal cards.
6. Open meal detail.
7. Favorite one meal.
8. Log one meal.
9. Open settings/account.
10. Sign out.

## Authentication

### Sign up

- Open the sign-up flow
- Create a new account
- Complete OTP/email verification if enabled
- Confirm redirect lands in the intended app flow
- Confirm no white screen or stuck loading state

### Sign in

- Sign in with valid credentials
- Confirm invalid credentials show a clean error
- Confirm authenticated state persists across relaunch

### Anonymous to authenticated state

- Use the app signed out if supported
- Sign in afterward
- Confirm guest/session data claims correctly if applicable

### Sign out

- Sign out from settings/account
- Confirm protected screens are no longer accessible
- Confirm stale user data is cleared

## Core search and chat

### Home search

Run all of these:

- `pizza`
- `salad`
- `high protein under 600 calories`
- `dominos`
- `sweetgreen under 600 calories`
- `qdoba bowl under 700 calories`

Verify:

- meal cards render
- restaurant-specific queries stay scoped
- no obvious modifiers/sauces appear as meal cards
- tapping a card opens meal detail

### AI chat

Run all of these:

- `dominos`
- `high protein lunch under 700 calories`
- `greek salad at cava`
- `acai bowl for breakfast`
- `vegan dinner near me`

Verify:

- meal cards appear inside chat
- constraints are respected
- location queries behave correctly
- no blank result bubbles or hanging spinners

## Meal detail, swaps, favorites, logging

### Meal detail

- Open detail from Home search
- Open detail from AI chat
- Confirm restaurant logo, macros, and core metadata render correctly

### Swaps

- Open meals that should have swaps
- Confirm swap suggestions load
- Confirm selecting a swap updates the detail state correctly

### Favorites

- Save a favorite
- Relaunch the app
- Confirm favorite persists

### Meal logging

- Log a meal
- Log a meal with modifications if supported
- Confirm the daily log screen updates correctly

## Location and permissions

### Denied path

- Deny location when prompted
- Run chat and search flows
- Confirm no crash or broken state

### Allowed path

- Allow location
- Run nearby-style queries
- Confirm nearby results still work

### Settings path

- Revoke location from iOS settings
- Relaunch app
- Confirm app still behaves gracefully

## Billing and subscriptions

Run this inside the native iOS app with sandbox billing configured.

### Upgrade screen

- Open upgrade while signed out
- Open upgrade while signed in
- Confirm copy and CTA state are coherent

### Purchase flow

- Start a purchase
- Complete it with sandbox Apple ID
- Confirm entitlement/UI updates after success

### Restore purchases

- Use the restore action from:
  - upgrade screen
  - account screen
- Confirm restored access is reflected correctly

### Manage subscription

- Open subscription management from the account screen
- Confirm the App Store management path opens correctly

## Account management and deletion

### Account screen

- Open `Settings -> Account`
- Confirm plan, restore, and management actions are visible and coherent

### Delete account

- Trigger delete account
- Confirm destructive confirmation is shown
- Confirm account is deleted successfully
- Confirm the app signs out / redirects cleanly
- Confirm relogin with deleted account fails as expected

Important:

- App Store subscriptions are managed separately through Apple
- Verify the deletion messaging states that clearly

## Navigation, layout, and polish

- top safe area is respected
- bottom safe area is respected
- keyboard does not cover primary CTAs
- scrolling is smooth on long screens
- no trapped nested scroll regions
- back navigation is predictable
- no full-screen white flashes on route changes

## External links and support

- privacy policy link opens
- terms link opens
- support/contact link opens
- return to app is clean after opening external browser

## Persistence and relaunch

Test:

- cold launch signed in
- cold launch signed out
- relaunch while chat has content
- relaunch after favorite/save/log activity

Verify:

- session restores correctly
- chat/search state is not obviously corrupted
- no unexpected onboarding loop

## Evidence to capture for any issue

- device model
- iOS version
- signed-out / signed-in / premium state
- exact steps
- expected result
- actual result
- screenshot or screen recording

## Exit criteria

This pass is complete only when:

- all smoke-test items pass
- no release blockers remain
- auth, search, chat, logging, favorites, location, billing, and account deletion all work on a physical iPhone
- there are no critical layout or keyboard issues
- reviewer access is not blocked by missing credentials or broken flows
