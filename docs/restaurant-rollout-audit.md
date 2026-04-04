# Restaurant Rollout Audit

Last updated: 2026-04-02

## Goal

Use the relation-backed swap model only where the raw JSON already has enough structure to make it worth doing:

- signature meals
- separately listed modifiers
- sauces/dressings
- proteins/add-ons
- sides/toppings/base items

## Tier 1: Ready Now

These already have strong modifier categories or clear relation patterns and are the best next rollout targets.

- `North Italia`
- `Chopt Creative Salad Co.`
- `Sweetgreen`
- `Taziki's Mediterranean Cafe`
- `WaBa Grill`
- `Dig Inn`
- `Little Beet`
- `QDOBA Mexican Eats`
- `Moe's Southwest Grill`
- `El Pollo Loco`
- `Pollo Tropical`
- `Playa Bowls`
- `Clean Eatz`
- `Firehouse Subs`
- `Jimmy John's`
- `Subway`
- `The Habit Burger & Grill`
- `Wendy's`
- `Shake Shack`
- `Culver's`

## Tier 2: Worth Doing, But Template Cleanup First

These can support swaps, but the current JSON/category shape needs custom templates or light cleanup before rollout.

- `Tender Greens`
- `Original ChopShop`
- `Core Life Eatery`
- `Crisp & Green`
- `Pura Vida Miami (South Florida)`
- `Seasons 52`
- `Olive Garden`
- `P.F. Chang's`
- `Cheesecake Factory`
- `BJ's Restaurant & Brewhouse`
- `Lazy Dog Restaurant & Bar`
- `Red Lobster`
- `Yard House`
- `Miller's Ale House`
- `Famous Dave's`
- `McDonald's`
- `Chick-fil-A`
- `Arby's`
- `Sonic Drive-In`
- `Taco Bell`
- `Tropical Smoothie Cafe`

## Tier 3: Lower Swap ROI For Now

These are lower value for the current modifier-linked swap phase or have weak modifier coverage.

- `Starbucks`
- `Gregorys Coffee`
- `Nekter Juice Bar`
- `Jamba`
- `Paris Baguette`
- `In-N-Out Burger`
- `Whataburger`
- `Pei Wei Asian Kitchen`
- `Maggiano's Little Italy`
- `Jinya Ramen Bar`
- `Postino`

## Known Data Issues

These should be corrected before broader rollout.

- `saladandgo_raw.json`
  - `restaurant_name` is wrong. It currently reports `Muscle Maker Grill`.
- `justsalad_raw.json`
  - `restaurant_name` is wrong. It currently reports `CHOPT Creative Salad Co.`.
- `parisbaguette_raw.json`
  - `restaurant_name` is wrong. It currently reports `Tous les Jours`.
- `burgerking_raw.json`
  - category corruption present: `EntrFlame Grilled Burgersee`.
- `dunkindonuts_raw.json`
  - category corruption present: `EntrSandwiches & Wrapsee`.
- `smashburger_raw.json`
  - category corruption present: `13.91`.
- `eiinsteinbrosbagels_raw.json`
  - filename typo; keep in mind for scripts and manual ops.

## Template Archetypes

These are the rollout buckets to use instead of treating each restaurant as unique.

### Bowl / Salad / BYO-Signature

- `CAVA`
- `Sweetgreen`
- `Chopt Creative Salad Co.`
- `QDOBA Mexican Eats`
- `Moe's Southwest Grill`
- `WaBa Grill`
- `Dig Inn`
- `Little Beet`
- `Playa Bowls`
- `Pura Vida Miami (South Florida)`

Expected categories:

- meals: `Bowls`, `Salads`, `Curated Bowls`, `Entree`
- modifiers: `Protein`, `Bowl Add-ons`, `Sauce`, `Dressing`, `Topping`, `Base`, `Greens + Grains`

### Breakfast

- `The Original Pancake House`
- `First Watch`
- `Another Broken Egg Cafe`
- `Original ChopShop`
- `True Food Kitchen` brunch subset

Expected categories:

- meals: `PANCAKES`, `OMELETTES`, `TRADITIONAL FAVORITES`, `Brunch`, `Entree`
- modifiers: egg rows, side meats, dressings, breakfast sides, add-ons

### Sandwich / Burger / Wrap

- `The Habit Burger & Grill`
- `Shake Shack`
- `Wendy's`
- `Jimmy John's`
- `Firehouse Subs`
- `Jersey Mike's Subs`
- `Subway`
- `Chick-fil-A`
- `Arby's`
- `Culver's`
- `Sonic Drive-In`

Expected categories:

- meals: burgers, sandwiches, wraps, entrees
- modifiers: `Protein`, `Sauce`, `Topping`, `Sides`

### Sit-Down Entree / Sauce

- `North Italia`
- `Carrabba's Italian Grill`
- `Bonefish Grill`
- `Cheesecake Factory`
- `P.F. Chang's`
- `Lazy Dog Restaurant & Bar`
- `Seasons 52`
- `Yard House`
- `Red Lobster`

Expected categories:

- meals: `Appetizer`, `Entree`, `Salad`, `Soup`
- modifiers: `Sauce`, `Dressing`, `Protein Add-on`, `Sides`

## Recommended Next Rollout Order

Best sequence after the current four validated restaurants:

1. `North Italia`
2. `Sweetgreen`
3. `Chopt Creative Salad Co.`
4. `Taziki's Mediterranean Cafe`
5. `WaBa Grill`
6. `QDOBA Mexican Eats`
7. `Moe's Southwest Grill`
8. `El Pollo Loco`
9. `Pollo Tropical`
10. `The Habit Burger & Grill`

## Image Cost Guidance

Do not download every PNG manually.

Recommended strategy:

1. store remote `image_url`
2. render that directly in the app
3. cache only high-value images later if needed

Cost view:

- remote URL only: effectively `$0` storage cost in your app
- selective caching: still cheap
- manual download + full asset hosting up front: unnecessary

Ballpark:

- 10,000 meal images at ~250 KB each is about `2.5 GB`
- 20,000 meal images at ~250 KB each is about `5 GB`

Current pricing references:

- Supabase Storage: `$0.021 / GB-month` over included quota, with Pro including `100 GB` storage and egress overages at `$0.09 / GB` uncached or `$0.03 / GB` cached
  - Source: https://supabase.com/docs/guides/storage/pricing
  - Source: https://supabase.com/docs/guides/platform/manage-your-usage/egress
- Cloudflare R2: `10 GB` free tier, then `$0.015 / GB-month` storage and `no egress fees`
  - Source: https://developers.cloudflare.com/r2/pricing/

Practical recommendation:

- if you do images later, start with URL-only
- if you cache, prefer `Cloudflare R2` or keep it inside included `Supabase Pro` quota
- do not build a large image-hosting pipeline before the restaurant rollout is complete
