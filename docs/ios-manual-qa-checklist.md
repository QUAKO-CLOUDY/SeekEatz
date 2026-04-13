# iOS Manual QA Checklist

Use this checklist when running SeekEatz inside the Capacitor iOS shell on a real device or simulator.

This is the gate before Apple subscription work and before TestFlight submission.

## Preconditions

- Latest repo changes are pulled
- `npm run build` passes
- Capacitor iOS project exists under [ios/](c:/Users/isaac/my-meals-app/ios)
- App is opened from Xcode on a Mac
- The app loads the intended environment
  - production shell: `https://seekeatz.com`
  - local shell only if `CAP_SERVER_URL` is intentionally set
- Test account credentials are available
- A device with network access is available
- Location permissions can be granted and revoked during testing

## Test Devices

Run at minimum:

- iPhone simulator, latest iOS
- One physical iPhone

If possible, also run:

- Small phone viewport
- Large phone viewport

## Release Blockers

Any of these is a blocker:

- app fails to boot or hangs on splash/blank screen
- auth redirect loops
- sign in or sign up fails in native shell
- AI chat fails to return meal cards
- home search fails to return meal cards
- meal detail cannot open
- logging meals fails
- favorites fail to save or reload
- keyboard covers critical inputs/buttons
- safe area clips CTA/header/footer content
- app crashes or hard reloads during core flows
- native external links fail silently
- upgrade flow is broken or misleading

## Smoke Test

Pass these first before deeper QA:

1. Launch app from cold start.
2. Confirm landing/waitlist/home entry screen renders without layout breakage.
3. Navigate to sign up and sign in screens.
4. Complete one authenticated session.
5. Open AI chat and run one query.
6. Open Home search and run one search.
7. Open one meal detail screen.
8. Save one favorite.
9. Log one meal.
10. Sign out and return to sign in.

## Authentication

### Sign Up

- Open `/auth/signup`
- Confirm no blank screen or Suspense fallback hang
- Create account with email flow
- OTP screen renders correctly
- OTP inputs are usable with iOS keyboard
- Successful verification routes into the app without full-document failure
- Post-signup redirect lands on the intended screen

### Sign In

- Open `/auth/signin`
- Sign in with valid credentials
- Invalid credentials show clear error
- Existing session returns correctly to app
- Auth screen does not flicker/loop

### Sign Out

- Sign out from settings
- Confirm app returns to sign-in state cleanly
- Confirm no stale user data remains on protected screens

### OAuth

If Apple/Google auth is enabled:

- Tap provider button
- Confirm redirect opens correctly in native shell
- Confirm return into app succeeds
- Confirm user session persists after relaunch

## Navigation and Shell Behavior

- Back navigation behaves correctly
- No unexpected full-page white flashes during route changes
- Safe areas are respected on top and bottom
- Content is not clipped under notch/home indicator
- Keyboard does not cover auth or form CTA buttons
- Scrolling works normally on long pages
- No trapped scroll regions

## Home Search

Run these queries and confirm meal cards render:

- `pizza`
- `salad`
- `smoothies`
- `high protein under 600 calories`
- `vegan meals`
- `dominos`
- `qdoba under 700 calories`
- `chopt creative salad`

Verify:

- restaurant-specific queries only show that restaurant
- generic queries show varied restaurants before repeating
- logos render correctly
- no placeholder meal-card logos
- no sauces/add-ons/modifiers appear as meal cards

## AI Chat

Run these prompts:

- `dominos`
- `dominos under 900 calories`
- `smoothies`
- `salads from chopt creative salad co`
- `high protein lunch under 700 calories`
- `vegan dinner near me`

Verify:

- meal cards appear in chat
- restaurant queries stay scoped
- macro constraints are respected
- location queries still work after permission grant
- chat state survives app navigation
- guest and signed-in behavior both work

## Meal Detail and Swaps

Open meal detail from both Home search and AI chat.

Verify:

- meal detail screen opens correctly
- macros render correctly
- restaurant logo renders correctly
- swap suggestions load
- DB-backed swaps appear where expected
- quantity config behaves correctly
- no side-based swap suggestions appear for Chick-fil-A and Zaxby’s yet

Suggested restaurant checks:

- Sweetgreen
- CAVA
- Taziki's Mediterranean Cafe
- Chopt Creative Salad Co.
- WaBa Grill
- QDOBA Mexican Eats
- The Habit Burger & Grill
- Chick-fil-A
- Zaxby's

## Favorites and Logging

- Save a meal to favorites
- Kill app and relaunch
- Confirm favorite persists
- Log a meal with and without swaps
- Confirm logged macros match selected modifications
- Confirm daily log screen loads correctly after relaunch

## Location and Permissions

- Deny location permission and test search/chat
- Grant location permission and test again
- Confirm location-based search still works
- Confirm denied permission does not break the app

## Waitlist and External Links

- Open waitlist screen
- Test native share sheet if available
- Test copy link
- Test one external social share link
- Test support/contact links

Verify:

- external links open via native browser/sheet
- returning to the app is clean

## Upgrade and Entitlement UI

This is UI-only QA for now until Apple billing is implemented.

- Open upgrade screen signed out
- Open upgrade screen signed in
- Confirm current plan messaging is coherent
- Confirm free vs premium CTA labels are correct
- Confirm no dead-end button behavior
- Confirm tutorial and redirect params still behave correctly

## Persistence / Relaunch

Check all of these:

- cold launch after sign in
- cold launch after sign out
- relaunch while chat has content
- relaunch while on Home search
- relaunch after favoriting meals

Verify:

- no corrupted local/session state
- no unexpected onboarding re-entry
- no broken auth session restoration

## Evidence to Capture

For any bug, capture:

- screen name
- exact steps
- expected result
- actual result
- screenshot or screen recording
- device + iOS version
- account state
  - signed out
  - signed in free
  - signed in premium/test

## Exit Criteria

Manual iOS QA is complete when:

- all smoke test items pass
- no release blockers remain
- auth, search, AI chat, swaps, logging, favorites, and settings pass on device
- no critical layout or keyboard issues remain
- external links behave correctly in native shell

After this, the next task is Apple subscription and entitlement implementation.
