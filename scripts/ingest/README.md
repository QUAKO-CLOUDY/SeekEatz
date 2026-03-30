# SeekEatz Data Ingestion Pipeline

Ingest menu items from national chains, regional chains, and local restaurants into Supabase.

## Quick Start

### 1. Add API credentials to `.env.local`

```env
# Required for Nutritionix adapter (free signup at developer.nutritionix.com)
NUTRITIONIX_APP_ID=your_app_id
NUTRITIONIX_APP_KEY=your_app_key

# Required for AI Estimator adapter (uses gpt-4o-mini)
OPENAI_API_KEY=your_openai_key

# Already in your project — needed for DB writes
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...  # Use service_role (not anon) for write access
```

### 2. Configure target restaurants in `scripts/ingest/index.ts`

There are three sections in `index.ts`:

| Section | Use when | What you provide |
|---|---|---|
| `NUTRITIONIX_RESTAURANTS` | National chains (McDonald's, Shake Shack, etc.) | Just the restaurant name |
| `SCRAPER_TARGETS` | Regional chains with nutrition pages online | URL to their nutrition page |
| `AI_ESTIMATOR_TARGETS` | Local/independent restaurants | Item names + descriptions |

### 3. Test with a dry run first

```bash
npm run ingest:dry
```

This normalizes and logs everything that would be written — no DB changes.

### 4. Run for real

```bash
npm run ingest
```

### CLI options

```bash
# Dry run (no DB writes)
npx tsx scripts/ingest/index.ts --dry-run

# Only run one adapter
npx tsx scripts/ingest/index.ts --adapter=nutritionix
npx tsx scripts/ingest/index.ts --adapter=scraper
npx tsx scripts/ingest/index.ts --adapter=ai

# Only ingest one restaurant
npx tsx scripts/ingest/index.ts --restaurant="Shake Shack"

# Combine flags
npx tsx scripts/ingest/index.ts --adapter=nutritionix --restaurant="Wendy's" --dry-run

# Custom batch label (shows in import_batch_id column)
INGEST_BATCH_LABEL=march-2026 npm run ingest
```

---

## How each adapter works

### Nutritionix (national chains)

- **Coverage**: 1,000+ US chain restaurants
- **Accuracy**: High (verified against nutrition labels)
- **Cost**: Free tier — 500 requests/day. Enough for ~30 restaurants per day.
- **Confidence score**: 0.95

The adapter:
1. Searches Nutritionix by restaurant name to find the brand ID
2. Fetches all menu items for that brand using multiple query seeds
3. Returns full nutrition panel (calories, protein, carbs, fat, sodium, fiber, etc.)

**Tips:**
- Use exact brand names as they appear on menus (e.g. `"Chick-fil-A"` not `"Chickfila"`)
- If a chain isn't found, check nutritionix.com to confirm they're in the database

### Scraper (regional chains)

- **Coverage**: Any restaurant with a public nutrition page
- **Accuracy**: Medium (depends on what the page publishes)
- **Cost**: Free
- **Confidence score**: 0.72–0.82

The adapter tries three extraction strategies in order:
1. **JSON-LD** (`<script type="application/ld+json">`) — most reliable
2. **Inline JSON** (window.__NEXT_DATA__ or similar React/Next data)
3. **HTML tables** (traditional nutrition grids)

**For JavaScript-rendered pages** (where the menu loads dynamically):
```bash
npm install -D playwright
npx playwright install chromium
```
Then set `SCRAPER_USE_PLAYWRIGHT=true` in `.env.local` and re-run.

### AI Estimator (local/independent)

- **Coverage**: Any restaurant — just provide item names and descriptions
- **Accuracy**: ±15–25% (estimates only, not suitable for medical use)
- **Cost**: ~$0.003 per item using gpt-4o-mini
- **Confidence score**: 0.50–0.68

Items ingested via AI estimator get a lower `confidence_score` so SeekEatz
can deprioritize them or display an "estimated nutrition" badge in the future.

---

## Data pipeline

```
Adapter (raw items)
  ↓
normalizer.ts        — classify item_type, meal_type, food_tags, normalized_category
                     — apply 150 cal floor
                     — skip catering/modifier/large-portion items
  ↓
upserter.ts          — upsert restaurants table
                     — upsert menu_items on (restaurant_name, name)
                     — updates existing rows if already present
  ↓
Supabase menu_items table
```

## File structure

```
scripts/ingest/
  index.ts           — Main runner (configure targets here)
  types.ts           — Shared TypeScript types
  classify.ts        — Auto-classifies item_type, meal_type, food_tags
  normalizer.ts      — Maps raw items → DB schema
  upserter.ts        — Writes to Supabase
  adapters/
    nutritionix.ts   — Nutritionix API adapter
    scraper.ts       — HTML/JSON scraper adapter
    ai-estimator.ts  — GPT-4o-mini macro estimator
  README.md          — This file
```

## Deduplication

Upserts use `(restaurant_name, name)` as the conflict key. Re-running ingestion
for the same restaurant will update existing items with fresh nutrition data
rather than creating duplicates.

## After ingestion

Newly ingested items won't have vector embeddings yet. To generate embeddings
(required for the vector similarity search fallback), run:

```bash
# Coming soon: npx tsx scripts/embed.ts
```

Until then, the app will use SQL-first retrieval (which doesn't need embeddings)
for all newly ingested items.
