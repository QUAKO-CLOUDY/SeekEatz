/**
 * Modifier Candidates Fetcher
 * Fetches single-ingredient (modifier) rows from menu_items for a specific restaurant
 */

import { createClient } from '@/utils/supabase/server';
import { normalizeMacros, type Macros } from '@/lib/macro-utils';

export type ModifierCandidate = {
  id: string;
  name: string;
  category: string;
  macros: Macros;
};

/**
 * Fetches modifier candidates from menu_items for a specific restaurant
 * Returns array of items likely to be single-ingredient add-ons/modifiers
 * 
 * Rules:
 * - Same restaurant only
 * - Must have macros object and calories in reasonable modifier range (0 < calories <= 400)
 * - Exclude "full meals" heuristically:
 *   - if calories >= 450 AND protein/carbs/fats all non-trivial -> treat as meal, exclude
 * - Prefer category keywords if available:
 *   category ILIKE any of: '%modifier%', '%ingredient%', '%add%', '%topping%', '%protein%', '%side%', '%sauce%', '%extra%'
 */
export async function getModifierCandidates(
  supabase: any,
  restaurant_name: string
): Promise<ModifierCandidate[]> {
  if (!restaurant_name || !supabase) {
    return [];
  }

  try {
    // Fetch all items from the restaurant
    const { data: items, error } = await supabase
      .from('menu_items')
      .select('id, restaurant_name, name, category, macros')
      .eq('restaurant_name', restaurant_name);

    if (error) {
      console.error('[modifierCandidates] Error fetching items:', error);
      return [];
    }

    if (!items || items.length === 0) {
      return [];
    }

    // Filter to modifier candidates
    const candidates: ModifierCandidate[] = [];

    for (const item of items) {
      // Must have macros
      if (!item.macros || typeof item.macros !== 'object') {
        continue;
      }

      // Normalize macros
      const normalizedMacros = normalizeMacros(item.macros);
      if (!normalizedMacros) {
        continue;
      }

      // Calories must be in modifier range (0 < calories <= 400)
      if (normalizedMacros.calories <= 0 || normalizedMacros.calories > 400) {
        continue;
      }

      // Exclude "full meals" heuristically:
      // If calories >= 450 AND protein/carbs/fats all non-trivial -> treat as meal, exclude
      // Actually, we already filtered calories <= 400, so this check is redundant but kept for clarity
      if (normalizedMacros.calories >= 450) {
        const hasNonTrivialMacros = 
          normalizedMacros.protein >= 15 ||
          normalizedMacros.carbs >= 20 ||
          normalizedMacros.fats >= 10;
        
        if (hasNonTrivialMacros) {
          continue; // Likely a meal, not a modifier
        }
      }

      // Prefer category keywords (but don't require them - some modifiers may not have category set)
      const category = (item.category || '').toLowerCase();
      const preferredCategoryKeywords = [
        'modifier', 'ingredient', 'add', 'topping', 'protein', 
        'side', 'sauce', 'extra', 'add-on', 'addon'
      ];
      
      const hasPreferredCategory = preferredCategoryKeywords.some(keyword => 
        category.includes(keyword)
      );

      // Include item if:
      // 1. Has preferred category keyword, OR
      // 2. Calories are low enough to be a modifier (already checked above)
      // Additional heuristic: if calories < 200, more likely to be a modifier
      const isLikelyModifier = hasPreferredCategory || normalizedMacros.calories < 200;

      if (isLikelyModifier) {
        candidates.push({
          id: item.id,
          name: item.name || 'Unknown',
          category: item.category || '',
          macros: normalizedMacros,
        });
      }
    }

    // Log in dev
    if (process.env.NODE_ENV === 'development') {
      console.log(`[modifierCandidates] Found ${candidates.length} modifier candidates for ${restaurant_name}`);
    }

    return candidates;
  } catch (error) {
    console.error('[modifierCandidates] Exception fetching candidates:', error);
    return [];
  }
}

