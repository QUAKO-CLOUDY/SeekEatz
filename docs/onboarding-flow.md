# SeekEatz Onboarding Flow

## Full Flow
1. Landing page
   CTA: `Find meals near you`
2. Direct to AI chat
   No login and no onboarding before search.
3. First results
   Show real meal cards with calories and macros.
   Show a blurred premium teaser card beneath results.
4. Second query
   Allow one refinement pass to confirm value.
5. Post-value onboarding
   Four swipe-fast benefit slides appear only after the second successful query.
6. Soft account gate
   Prompt: `Create a free account to keep going`
   Options: Google, Apple, email.
7. Free account state
   User returns to chat.
   Free account gets limited daily AI searches and full browsing of search results.
8. Premium feature locks
   Saved meals, meal logging, and AI swaps open the premium upgrade modal.
9. Paywall
   Triggered when free signed-in users hit the daily AI limit or try a premium feature.

## Screen Breakdown
- Landing hero
  Headline remains product-first.
  CTA sends to `/chat`.
- Chat empty state
  Intro copy explains macros + cravings + cuisine search.
  Example prompts anchor the first action.
- Results state
  Meal cards show verified macros clearly.
  Premium teaser reinforces future value without blocking.
- Post-value onboarding
  One sentence per slide.
  Single primary action moves forward quickly.
- Account gate
  Outcome-first headline.
  Social-first auth options plus email fallback.
- Upgrade modal
  Outcome-based title with premium benefits list.

## Core Copy
### Post-value onboarding
- `Eating out shouldn’t mean guessing your calories and macros.`
- `Search anything-your goals, cravings, or calories-and we find meals that fit.`
- `Every result is based on verified nutrition data. No estimates. No guesswork.`
- `Know what to order before you order-and stay on track effortlessly.`

### Account gate
- Title: `Create a free account to keep going`
- Body: `You’ve already seen the meal search work. Create your account to keep searching and unlock your daily free usage.`

### Feature lock
- `This feature is part of premium.`

### Paywall
- Title: `You’re one step away from always knowing what to order.`
- Benefits:
  `Unlimited AI searches`
  `Smarter results`
  `AI swaps`
  `Meal logging`
  `Saved meals`

## Frontend Structure
- [app/page.tsx](/c:/Users/isaac/my-meals-app/app/page.tsx)
  Landing entry.
- [app/components/landing/HeroSection.tsx](/c:/Users/isaac/my-meals-app/app/components/landing/HeroSection.tsx)
  Value-first CTA.
- [app/components/AIChat.tsx](/c:/Users/isaac/my-meals-app/app/components/AIChat.tsx)
  Trial search, post-value onboarding, account gate, free query limit paywall.
- [app/components/PostValueOnboarding.tsx](/c:/Users/isaac/my-meals-app/app/components/PostValueOnboarding.tsx)
  Four-slide onboarding.
- [app/components/AuthProviders.tsx](/c:/Users/isaac/my-meals-app/app/components/AuthProviders.tsx)
  Google, Apple, email auth entry.
- [app/components/UpgradeModal.tsx](/c:/Users/isaac/my-meals-app/app/components/UpgradeModal.tsx)
  Premium upgrade messaging.
- [app/components/MainApp.tsx](/c:/Users/isaac/my-meals-app/app/components/MainApp.tsx)
  Signed-in free vs premium navigation and feature gates.
- [app/components/MealDetail.tsx](/c:/Users/isaac/my-meals-app/app/components/MealDetail.tsx)
  Swap and log gating.
- [lib/onboarding-flow.ts](/c:/Users/isaac/my-meals-app/lib/onboarding-flow.ts)
  Query counts, onboarding completion, free vs premium local state.

## State Logic
- Guest
  `2` successful queries allowed before onboarding + account gate.
- Signed-in free
  `3` daily AI queries.
- Premium
  No AI query cap.
- Premium-only actions
  Save meal.
  Meal logging.
  AI swaps.

## Conversion Notes
- Keep the first search fast and visually dense with macros.
- Delay all auth friction until after the second successful result set.
- Preserve social auth at the soft gate to reduce abandonment.
- Keep upgrade language outcome-based, not plan-based.
- Measure:
  landing CTA to first query
  first query to second query
  second query to account creation
  free account to premium modal open
  premium modal open to upgrade intent
