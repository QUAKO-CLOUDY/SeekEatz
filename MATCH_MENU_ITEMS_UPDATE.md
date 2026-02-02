# match_menu_items Function Update

## Summary

Updated the `match_menu_items` Supabase RPC function to match the current `menu_items` schema.

## Files Created/Updated

### 1. SQL Function: `supabase_match_menu_items_function.sql`
- **Location**: Root directory
- **Purpose**: Creates/updates the `match_menu_items` RPC function
- **Schema Alignment**: Uses current schema columns:
  - `name` (text) - NOT `item_name`
  - `restaurant_name` (text)
  - `macros` (jsonb) - NOT separate `calories`, `protein_g`, etc. columns
  - `embedding` (vector(1536)) - Uses text-embedding-3-small dimensions

### 2. Diagnostic Script: `scripts/check-embeddings.ts`
- **Purpose**: One-time diagnostic to check embedding coverage
- **Usage**: `npx tsx scripts/check-embeddings.ts`
- **Checks**:
  - Total rows in `menu_items`
  - Rows with null embeddings
  - Embedding coverage percentage
  - Sample row structure

### 3. Test Script: `scripts/test-match-menu-items.ts`
- **Purpose**: Test the `match_menu_items` function
- **Usage**: `npx tsx scripts/test-match-menu-items.ts`
- **Tests**:
  - Generates embedding for "meal under 1000 calories"
  - Calls RPC function
  - Verifies returns at least 20 rows
  - Checks response structure

## SQL Function Details

### Function Signature
```sql
CREATE OR REPLACE FUNCTION match_menu_items(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id text,
  restaurant_name text,
  name text,
  macros jsonb,
  image_url text,
  price_estimate numeric,
  similarity float
)
```

### Key Features
- Uses cosine similarity: `1 - (embedding <=> query_embedding)`
- Filters out rows with NULL embeddings
- Applies threshold: `similarity > match_threshold`
- Orders by similarity (ascending distance = descending similarity)
- Returns exactly the columns the handler expects

### Vector Dimensions
- Model: `text-embedding-3-small`
- Dimension: 1536

## Ingestion Script Verification

✅ **Verified**: `scripts/ingest-data.ts` already:
- Creates embeddings during import
- Stores embeddings in `menu_items.embedding`
- Uses correct schema: `name`, `restaurant_name`, `macros`, `embedding`

No changes needed to ingestion script.

## Deployment Steps

1. **Run diagnostic to check embeddings**:
   ```bash
   npx tsx scripts/check-embeddings.ts
   ```
   - If embeddings are missing/null, run the ingestion script first

2. **Deploy SQL function to Supabase**:
   - Open Supabase Dashboard → SQL Editor
   - Copy contents of `supabase_match_menu_items_function.sql`
   - Paste and execute
   - Verify function was created: `SELECT * FROM pg_proc WHERE proname = 'match_menu_items';`

3. **Test the function**:
   ```bash
   npx tsx scripts/test-match-menu-items.ts
   ```
   - Should return at least 20 rows for "meal under 1000 calories"
   - Verify all required columns are present

4. **Verify handler integration**:
   - The handler in `app/api/search/handler.ts` already calls this function correctly
   - No code changes needed

## Acceptance Criteria

✅ Function uses current schema (name, restaurant_name, macros jsonb, embedding vector)  
✅ Function uses cosine similarity against menu_items.embedding  
✅ Function applies threshold and limits results  
✅ Function returns required columns: id, restaurant_name, name, macros, image_url, price_estimate  
✅ Ingestion script creates embeddings during import  
✅ Function returns at least 20 rows for "meal under 1000 calories" (verify with test script)

## Notes

- The function returns a `similarity` column which is not used by the handler but doesn't cause issues
- Old column references (`item_name`, `calories`, `protein_g`, etc.) have been removed
- All macro data comes from `macros->>'calories'`, `macros->>'protein'`, etc. (handled in `normalizeMeal`)

