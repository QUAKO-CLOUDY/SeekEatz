# SeekEatz

AI-assisted restaurant meal search with subscriptions, onboarding, favorites, logging, and swap-aware meal detail.

## Stack

- Next.js App Router
- Supabase (auth + data)
- RevenueCat/App Store billing integration (iOS shell path)
- Expo config + EAS project metadata

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Configure `.env.local` with required keys:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `USAGE_TOKEN_SECRET` (or fallback uses service-role key)
- `OPENAI_API_KEY`
- Billing envs used by `lib/billing/apple-products.ts`:
  - `NEXT_PUBLIC_APPLE_IAP_READY`
  - `NEXT_PUBLIC_APPLE_IAP_MONTHLY_PRODUCT_ID`
  - `NEXT_PUBLIC_APPLE_IAP_YEARLY_PRODUCT_ID`
  - `NEXT_PUBLIC_REVENUECAT_IOS_PUBLIC_SDK_KEY`
  - optional `NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID`

3. Start dev server:

```bash
npm run dev
```

## Core scripts

- `npm run lint` - ESLint (must be clean before release cut)
- `npm run build` - production build
- `npm run test:retrieval-parser`
- `npm run test:retrieval-guardrails`
- `npm run audit:retrieval-queries`
- `npm run audit:restaurant-search`
- `npm run audit:restaurant-readiness`
- `npm run audit:db-quality`
- `npm run audit:searchable-non-cards`
- `npm run cleanup:searchable-non-cards`
- `npm run cleanup:ambiguous-searchable-rows`

## Release gate (repo-side)

Run before native QA or submission handoff:

```bash
npm run lint
npm run build
npm run test:retrieval-parser
npm run test:retrieval-guardrails
npm run audit:retrieval-queries
npm run audit:restaurant-search
npm run audit:restaurant-readiness
npm run audit:db-quality
```

## iOS / Expo notes

- EAS project metadata is in `app.json` and `eas.json`.
- Native iOS verification and archive/upload are done from Xcode on macOS.
- See release docs in `docs/`:
  - `docs/launch-and-app-store-checklist.md`
  - `docs/ios-manual-qa-checklist.md`
  - `docs/app-store-submission-prep.md`
