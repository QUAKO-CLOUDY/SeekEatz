# Data Rollout And PDF Prompt

## Rollout Order

1. Apply migration `20260401000013_menu_item_relations.sql`.
2. Run a dry run:

```powershell
node scripts/run-ts-script.cjs scripts/backfill-menu-item-relations.ts --dry-run
```

3. Backfill one restaurant first:

```powershell
$env:SINGLE_RESTAURANT='The Original Pancake House'
node scripts/run-ts-script.cjs scripts/backfill-menu-item-relations.ts
```

4. Verify:
   - modifier rows have `is_searchable = false`
   - meals remain `item_type = 'meal'`
   - `menu_item_relations` contains meal-to-modifier links
5. Roll out to the rest of the configured restaurants:

```powershell
node scripts/run-ts-script.cjs scripts/backfill-menu-item-relations.ts
```

## Current Restaurant Coverage

The initial backfill script includes relation templates for:

- `The Original Pancake House`
- `CAVA`
- `True Food Kitchen`
- `Flower Child`
- `North Italia`

This is enough to start the rollout from the category patterns already present in the current database.

## PDF Extraction Prompt

Use this when replacing or expanding a restaurant PDF into the raw JSON format used by the app.

```text
Extract this restaurant nutrition/menu PDF into strict JSON for my app.

Return ONLY valid JSON.
No markdown.
No commentary.
No code fences.

Output schema:

{
  "restaurant_name": "STRING",
  "items": [
    {
      "name": "STRING",
      "category": "STRING",
      "price_estimate": NUMBER OR null,
      "macros": {
        "calories": NUMBER,
        "protein": NUMBER,
        "carbs": NUMBER,
        "fat": NUMBER
      }
    }
  ]
}

Primary goal:
Preserve all real menu rows that matter for searchable signature meals plus swap-relevant modifiers.

Important product constraints:
1. Signature or predefined meals must remain separate meal rows.
2. Modifiers, sauces, dressings, proteins, sides, toppings, and add-ons must remain separate rows when the PDF lists them separately.
3. Do NOT invent full build-your-own combinations.
4. Do NOT create hypothetical bowls, salads, pizzas, or sandwiches by combining ingredients yourself.
5. Include only the official predefined meals and separately listed modifier items that appear in the PDF.

Extraction rules:
1. Extract only rows that actually appear in the PDF.
2. Do not invent meals, macros, prices, or categories.
3. Keep visible category names when possible.
4. Preserve low-calorie sauces, dressings, toppings, sides, and add-ons. Do not filter them out.
5. Keep each source row separate. Do not merge modifiers into a meal row.
6. If a build-your-own section exists, include separately listed proteins, sauces, toppings, and extras as their own rows, but do not generate custom finished meals.
7. Use numeric values only for calories, protein, carbs, and fat.
8. If one macro is unreadable but the rest of the row is clearly valid, keep the row and use 0 only for the missing unreadable macro field.
9. Omit rows only when the item name itself is too unclear to trust or the nutrition row is unusable.
10. Ignore page numbers, headers, footers, legal disclaimers, allergen notes, utensils, and merchandise.
11. Deduplicate only exact repeated rows caused by PDF repetition.

Quality bar:
- Favor preserving real rows over aggressive filtering.
- It is better to keep a real protein add-on or sauce row than to omit it.
- Do not normalize categories during extraction.
- Output must be ready to save directly as a raw restaurant JSON file.
```
