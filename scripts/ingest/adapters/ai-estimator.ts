/**
 * SeekEatz Ingestion — AI Macro Estimator Adapter
 *
 * For local/independent restaurants where no nutrition data exists publicly.
 * Given a restaurant name + list of menu items (name + description), this
 * adapter calls GPT-4o-mini to estimate macros for each item.
 *
 * Limitations:
 *  - Estimates only — not suitable for medical/dietary use
 *  - Items get confidence_score: 0.60 so the app can deprioritize them
 *  - Accuracy is ±15–25% for most dishes; higher variance for complex items
 *
 * Required env var:
 *   OPENAI_API_KEY — used to call gpt-4o-mini
 *
 * Cost:
 *   ~$0.002–0.004 per menu item at gpt-4o-mini pricing (very cheap)
 *   A 100-item menu costs roughly $0.20–0.40
 *
 * Usage:
 *   import { createAIEstimatorAdapter } from './adapters/ai-estimator';
 *   const adapter = createAIEstimatorAdapter({
 *     'Local Grill': [
 *       { name: 'BBQ Brisket Plate', description: 'Slow smoked brisket with two sides' },
 *       { name: 'Chicken Caesar Wrap', description: 'Grilled chicken, romaine, parmesan' },
 *     ]
 *   });
 */

import type { IngestAdapter, RawIngestionItem } from '../types';

export interface ManualMenuItem {
  name:         string;
  description?: string;
  category?:    string;
  price?:       number;
}

export type AIEstimatorTargetMap = Record<string, ManualMenuItem[]>;

// ─── Estimated nutrition response ────────────────────────────────────────────

interface EstimatedNutrition {
  calories:        number;
  protein_g:       number;
  carbs_g:         number;
  fat_g:           number;
  fiber_g?:        number;
  sodium_mg?:      number;
  serving_notes?:  string;
  confidence?:     'high' | 'medium' | 'low';
}

// ─── Single item estimation via OpenAI ───────────────────────────────────────

async function estimateItem(
  item: ManualMenuItem,
  restaurantName: string
): Promise<EstimatedNutrition | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing OPENAI_API_KEY in .env.local — required for AI macro estimation.'
    );
  }

  const prompt = `You are a professional nutritionist. Estimate the nutrition facts for the following restaurant menu item.

Restaurant: ${restaurantName}
Item name: ${item.name}${item.description ? `\nDescription: ${item.description}` : ''}${item.category ? `\nMenu category: ${item.category}` : ''}

Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "calories": <integer>,
  "protein_g": <number with 1 decimal>,
  "carbs_g": <number with 1 decimal>,
  "fat_g": <number with 1 decimal>,
  "fiber_g": <number with 1 decimal or null>,
  "sodium_mg": <integer or null>,
  "serving_notes": "<brief note about assumed serving size>",
  "confidence": "high" | "medium" | "low"
}

Base estimates on typical restaurant portion sizes. If it's a combination plate, include all components. Be realistic, not idealized.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:       'gpt-4o-mini',
      messages:    [{ role: 'user', content: prompt }],
      temperature: 0.2, // low temp for consistent, factual responses
      max_tokens:  250,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return null;

  try {
    return JSON.parse(content) as EstimatedNutrition;
  } catch {
    // Occasionally GPT wraps in backticks — strip and retry
    const stripped = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(stripped) as EstimatedNutrition; } catch { return null; }
  }
}

// ─── Batch estimation with rate limiting ─────────────────────────────────────

const BATCH_SIZE     = 5;   // concurrent requests per batch
const BATCH_DELAY_MS = 500; // delay between batches (ms)

async function estimateBatch(
  items: ManualMenuItem[],
  restaurantName: string
): Promise<Array<{ item: ManualMenuItem; nutrition: EstimatedNutrition | null }>> {
  const results: Array<{ item: ManualMenuItem; nutrition: EstimatedNutrition | null }> = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async item => {
        try {
          const nutrition = await estimateItem(item, restaurantName);
          return { item, nutrition };
        } catch (err) {
          console.warn(`  [ai-estimator] Failed for "${item.name}":`, err);
          return { item, nutrition: null };
        }
      })
    );

    results.push(...batchResults);

    if (i + BATCH_SIZE < items.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }

    const done = Math.min(i + BATCH_SIZE, items.length);
    console.log(`  [ai-estimator] Estimated ${done}/${items.length} items...`);
  }

  return results;
}

// ─── Adapter factory ──────────────────────────────────────────────────────────

export function createAIEstimatorAdapter(
  targets: AIEstimatorTargetMap
): IngestAdapter {
  return {
    name: 'ai_estimator',

    async fetch(restaurantName: string): Promise<RawIngestionItem[]> {
      const menuItems = targets[restaurantName];
      if (!menuItems || menuItems.length === 0) {
        console.warn(
          `  [ai-estimator] No menu items configured for "${restaurantName}".\n` +
          `  Add items to the AI_ESTIMATOR_TARGETS map in scripts/ingest/index.ts`
        );
        return [];
      }

      console.log(
        `  [ai-estimator] Estimating macros for ${menuItems.length} items at "${restaurantName}"...`
      );

      const batchResults = await estimateBatch(menuItems, restaurantName);
      const output: RawIngestionItem[] = [];

      for (const { item, nutrition } of batchResults) {
        if (!nutrition) continue;

        // Confidence score: base 0.60 + bump if GPT is confident
        const confScore =
          nutrition.confidence === 'high'   ? 0.68 :
          nutrition.confidence === 'medium' ? 0.60 :
          0.50;

        output.push({
          source:           'ai_estimator',
          restaurantName,
          name:             item.name,
          description:      item.description
            ? `${item.description}${nutrition.serving_notes ? ` (${nutrition.serving_notes})` : ''}`
            : nutrition.serving_notes,
          calories:         nutrition.calories,
          protein_g:        nutrition.protein_g,
          carbs_g:          nutrition.carbs_g,
          fat_g:            nutrition.fat_g,
          fiber_g:          nutrition.fiber_g ?? undefined,
          sodium_mg:        nutrition.sodium_mg ?? undefined,
          rawCategory:      item.category,
          price:            item.price,
          sourceConfidence: confScore,
        });
      }

      console.log(`  [ai-estimator] Got ${output.length} estimated items`);
      return output;
    },
  };
}
