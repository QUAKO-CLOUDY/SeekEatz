/**
 * SeekEatz Ranker
 *
 * Post-SQL ranking logic. The SQL function already orders results by
 * protein (when protein filter set) and calories (when calorie cap set).
 * This ranker adds a matchScore to each result for client-side display
 * and handles deduplication when SQL + vector results are merged.
 */

import type { ParsedQuery } from './query-parser';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawResult {
  id: number | string;
  name: string;
  restaurant_name: string;
  restaurant_id: string;
  macros: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  normalized_category?: string;
  meal_type?: string;
  item_type?: string;
  food_tags?: string[];
  confidence_score?: number;
  description?: string;
  price?: number;
  image_url?: string;
  allergens?: string[];
  // From vector search
  similarity?: number;
  // Computed
  matchScore?: number;
  matchReasons?: string[];
  searchMetadata?: {
    confidence?: number;
    fallbackSource?: 'deterministic' | 'semantic';
  };
}

// ─── Scoring weights ──────────────────────────────────────────────────────────

const WEIGHTS = {
  confidence:     0.15,  // DB confidence_score (0–1)
  proteinMatch:   0.30,  // How close to requested protein
  calorieMatch:   0.25,  // How close to calorie target (under cap)
  categoryMatch:  0.15,  // Exact category hit
  mealTypeMatch:  0.10,  // Exact meal type hit
  vectorSimilarity: 0.05, // Semantic match (when available)
};

// ─── Main ranker ──────────────────────────────────────────────────────────────

/**
 * Computes a matchScore (0–100) for each item based on the parsed query.
 * Higher = better match.
 */
export function rankResults(
  items: RawResult[],
  parsed: ParsedQuery
): RawResult[] {
  const signature = buildSearchSignature(parsed);
  return items
    .map<RawResult>((item) => {
      const scoring = computeScore(item, parsed);
      const fallbackSource: 'deterministic' | 'semantic' =
        item.similarity !== undefined ? 'semantic' : 'deterministic';
      return {
        ...item,
        matchScore: scoring.score,
        matchReasons: scoring.reasons,
        searchMetadata: {
          confidence: Number(item.confidence_score ?? 0.8),
          fallbackSource,
        },
      };
    })
    .sort((a, b) => {
      const scoreDelta = (b.matchScore ?? 0) - (a.matchScore ?? 0);
      if (Math.abs(scoreDelta) > 2) {
        return scoreDelta;
      }
      return tieBreak(a, b, signature);
    });
}

function computeScore(item: RawResult, parsed: ParsedQuery): { score: number; reasons: string[] } {
  const cal = Number(item.macros?.calories ?? 0);
  const pro = Number(item.macros?.protein  ?? 0);
  const name = item.name.toLowerCase();
  const description = (item.description ?? '').toLowerCase();
  const tags = item.food_tags?.map(tag => tag.toLowerCase()) ?? [];

  let score = 0;
  const reasons: string[] = [];

  // ── Confidence score (DB quality signal) ─────────────────────────────────
  score += (Number(item.confidence_score) || 0.80) * 100 * WEIGHTS.confidence;
  reasons.push('confidence');

  // ── Protein match ─────────────────────────────────────────────────────────
  if (parsed.minProtein !== undefined) {
    if (pro >= parsed.minProtein) {
      // Bonus for being meaningfully over the min (up to +20% over)
      const overMin = Math.min(pro - parsed.minProtein, parsed.minProtein * 0.2);
      const proteinRatio = Math.min((pro - parsed.minProtein + overMin) / (parsed.minProtein || 1), 1);
      score += proteinRatio * 100 * WEIGHTS.proteinMatch;
      reasons.push('protein_target');
    }
    // Items below min were excluded by SQL — no penalty needed
  } else {
    // No protein filter: modest bonus for high protein (general preference)
    score += Math.min(pro / 60, 1) * 100 * WEIGHTS.proteinMatch * 0.5;
  }

  // ── Calorie match ─────────────────────────────────────────────────────────
  if (parsed.maxCalories !== undefined) {
    // All items are under the cap (SQL guarantee). Reward lower calories
    const calRatio = 1 - (cal / (parsed.maxCalories || 1));
    score += Math.max(0, calRatio) * 100 * WEIGHTS.calorieMatch;
    reasons.push('calorie_cap');
  } else if (parsed.minCalories !== undefined) {
    // All items are over the min. Reward being in a reasonable range (not extreme)
    const reasonable = cal <= (parsed.minCalories * 1.5);
    score += (reasonable ? 0.8 : 0.3) * 100 * WEIGHTS.calorieMatch;
  } else {
    // No calorie filter: mild preference for moderate-calorie items (400–800)
    const moderate = cal >= 300 && cal <= 900;
    score += (moderate ? 0.5 : 0.2) * 100 * WEIGHTS.calorieMatch;
  }

  // ── Category match ────────────────────────────────────────────────────────
  if (parsed.normalizedCategory) {
    if (item.normalized_category === parsed.normalizedCategory) {
      score += 100 * WEIGHTS.categoryMatch;
      reasons.push(`category:${parsed.normalizedCategory}`);
    }
  } else {
    score += 50 * WEIGHTS.categoryMatch; // neutral
  }

  // ── Meal type match ───────────────────────────────────────────────────────
  if (parsed.mealType) {
    if (item.meal_type === parsed.mealType) {
      score += 100 * WEIGHTS.mealTypeMatch;
      reasons.push(`meal_type:${parsed.mealType}`);
    } else if (item.meal_type === 'all_day') {
      score += 60 * WEIGHTS.mealTypeMatch; // all_day items are acceptable
      reasons.push('meal_type:all_day');
    }
  } else {
    score += 50 * WEIGHTS.mealTypeMatch;
  }

  for (const cuisine of parsed.cuisineOrStyle) {
    if (name.includes(cuisine) || description.includes(cuisine) || tags.includes(cuisine)) {
      score += 8;
      reasons.push(`cuisine:${cuisine}`);
    }
  }

  for (const tag of parsed.includeTags) {
    const normalizedTag = tag.replace(/_/g, ' ');
    if (name.includes(normalizedTag) || description.includes(normalizedTag) || tags.includes(tag)) {
      score += 6;
      reasons.push(`tag:${tag}`);
    }
  }

  for (const protein of parsed.proteinPreference) {
    if (name.includes(protein) || description.includes(protein) || tags.includes(protein)) {
      score += 7;
      reasons.push(`protein:${protein}`);
    }
  }

  // ── Vector similarity (optional) ──────────────────────────────────────────
  if (item.similarity !== undefined) {
    score += item.similarity * 100 * WEIGHTS.vectorSimilarity;
    reasons.push('semantic_similarity');
  }

  // ── Penalties ─────────────────────────────────────────────────────────────
  // Large portions that slipped through (user may have asked for big meals)
  if (item.food_tags?.includes('sharing_platter')) {
    score *= 0.7;
  }

  return {
    score: Math.round(Math.min(score, 100)),
    reasons: [...new Set(reasons)],
  };
}

// ─── Restaurant diversity interleaving ───────────────────────────────────────

/**
 * Re-orders items so the same restaurant never appears consecutively.
 * Uses a round-robin strategy: groups items by restaurant name, then
 * picks one from each group in rotation.  Within each group, items
 * keep their ranked order.
 *
 * This runs AFTER rankResults so high-scoring items are still preferred
 * within each restaurant's slot.
 */
export function interleaveByRestaurant(items: RawResult[]): RawResult[] {
  if (items.length === 0) return items;

  // Group items by restaurant (preserve ranked order within each group)
  const groups = new Map<string, RawResult[]>();
  for (const item of items) {
    const key = (item.restaurant_name ?? 'unknown').toLowerCase();
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  // Sort groups by their best-scoring item (descending) so top restaurants
  // appear in the first rotation pass
  const sortedGroups = [...groups.values()].sort(
    (a, b) => (b[0].matchScore ?? 0) - (a[0].matchScore ?? 0)
  );

  // Round-robin: pick one from each group in turn until exhausted
  const result: RawResult[] = [];
  let pointers = sortedGroups.map(() => 0);
  let added = true;
  while (added) {
    added = false;
    for (let i = 0; i < sortedGroups.length; i++) {
      const group = sortedGroups[i];
      if (pointers[i] < group.length) {
        result.push(group[pointers[i]]);
        pointers[i]++;
        added = true;
      }
    }
  }

  return result;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * Merges SQL results and vector results, deduplicating by item ID.
 * SQL results come first (higher precision); vector results fill gaps.
 */
export function mergeAndDeduplicate(
  sqlResults:    RawResult[],
  vectorResults: RawResult[],
  parsed:        ParsedQuery,
  targetCount?:  number
): RawResult[] {
  const seen = new Set<number | string>();
  const merged: RawResult[] = [];

  // SQL results first — they satisfy hard constraints
  for (const item of sqlResults) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }

  // Fill remaining slots from vector results
  for (const item of vectorResults) {
    if (targetCount !== undefined && merged.length >= targetCount) break;
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push({ ...item, matchScore: (item.matchScore ?? 0) * 0.85 }); // slight vector penalty
    }
  }

  const ranked = rankResults(merged, parsed);
  return targetCount !== undefined ? ranked.slice(0, targetCount) : ranked;
}

export function prioritizeRestaurantVariety(
  items: RawResult[],
  topWindow: number
): RawResult[] {
  if (items.length <= 1 || topWindow <= 1) {
    return items;
  }

  const groups = new Map<string, RawResult[]>();
  for (const item of items) {
    const key = (item.restaurant_name ?? 'unknown').trim().toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  if (groups.size <= 1) {
    return items;
  }

  const sortedGroups = [...groups.values()].sort(
    (a, b) => (b[0].matchScore ?? 0) - (a[0].matchScore ?? 0)
  );

  const topSlice: RawResult[] = [];
  const seenIds = new Set<number | string>();
  for (const group of sortedGroups) {
    if (topSlice.length >= topWindow) {
      break;
    }
    const candidate = group[0];
    topSlice.push(candidate);
    seenIds.add(candidate.id);
  }

  const remainder = interleaveByRestaurant(
    items.filter((item) => !seenIds.has(item.id))
  );

  return [...topSlice, ...remainder];
}

function buildSearchSignature(parsed: ParsedQuery): string {
  return [
    parsed.raw,
    parsed.restaurantQuery ?? '',
    parsed.mealTypes.join(','),
    parsed.categories.join(','),
    parsed.cuisineOrStyle.join(','),
    parsed.includeTags.join(','),
    parsed.sortPriority.join(','),
  ].join('|');
}

function tieBreak(a: RawResult, b: RawResult, signature: string): number {
  const aHash = stableHash(`${signature}|${a.id}|${a.restaurant_name}`);
  const bHash = stableHash(`${signature}|${b.id}|${b.restaurant_name}`);

  const aProtein = Number(a.macros?.protein ?? 0);
  const bProtein = Number(b.macros?.protein ?? 0);
  if (aProtein !== bProtein) {
    return bProtein - aProtein;
  }

  return aHash - bHash;
}

function stableHash(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}
