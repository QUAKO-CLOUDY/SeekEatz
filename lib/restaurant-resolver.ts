/**
 * Restaurant Resolver Utility
 * Robustly detects and resolves restaurant names from user text with fuzzy matching
 * 
 * Features:
 * - Extracts restaurant names from longer sentences
 * - Fuzzy matches misspellings and punctuation differences
 * - Uses canonical restaurant_name from database
 * - Returns MATCH, AMBIGUOUS, or NOT_FOUND with confidence levels
 * - Only triggers when user explicitly indicates restaurant intent
 */

import { createClient } from '@/utils/supabase/server';

/**
 * Generic food term guard list - prevents misclassification of dish terms as restaurants
 * Normalized versions (lowercase, no punctuation)
 */
const GENERIC_FOOD_TERMS = new Set([
  'burger', 'burgers', 'burrito', 'burritos', 'pizza', 'pizzas', 'tacos', 'taco',
  'salad', 'salads', 'sandwich', 'sandwiches', 'fries', 'fry', 'chicken', 'wings',
  'bowl', 'bowls', 'acai', 'acai bowl', 'smoothie', 'smoothie bowl',
  'wrap', 'wraps', 'sub', 'subs', 'quesadilla', 'quesadillas',
  'nachos', 'nacho', 'soup', 'soups', 'pasta', 'pastas', 'noodles',
  'rice', 'beans', 'steak', 'steaks', 'fish', 'shrimp', 'salmon', 'tuna',
  'breakfast', 'lunch', 'dinner', 'snack', 'snacks', 'appetizer', 'appetizers',
  'dessert', 'desserts', 'drink', 'drinks', 'beverage', 'beverages',
  'ramen', 'sushi', 'sashimi', 'poke', 'poke bowl'
]);

/**
 * Macro-related terms that shouldn't trigger restaurant intent
 */
const MACRO_TERMS = new Set([
  'calories', 'protein', 'carbs', 'carbohydrates', 'fat', 'fats',
  'low carb', 'high protein', 'keto', 'paleo', 'vegan', 'vegetarian'
]);

/**
 * Detects if user text explicitly indicates restaurant intent
 * Returns true ONLY when:
 *   A) Explicit restaurant markers exist (from/at/in + name, or name + menu/restaurant/order)
 *   B) A known restaurant name is actually matched with high confidence
 * 
 * DISH GUARD: Generic dish terms never trigger restaurant intent on their own
 */
export async function detectRestaurantIntent(
  userText: string,
  restaurantCandidates?: { normalizedToCanonical: Map<string, string>; canonicalNames: string[]; normalizedIndex?: Map<string, { canonicalName: string; variants: string[] }> }
): Promise<{ intent: boolean; reason: 'marker' | 'matchedRestaurant' | 'dishGuard' | 'none' }> {
  if (!userText || typeof userText !== 'string') {
    return { intent: false, reason: 'none' };
  }

  const trimmed = userText.trim();
  const lowerText = trimmed.toLowerCase();
  const normalizedText = normalizeRestaurantName(trimmed);

  // HARD STOP: Generic phrases like "find me lunch/dinner/breakfast" must NOT trigger restaurant resolution
  const genericPhrases = ['find me lunch', 'find me dinner', 'find me breakfast', 'find me food'];
  const isGenericPhrase = genericPhrases.some(phrase => lowerText.includes(phrase));
  if (isGenericPhrase) {
    console.log('[restaurantResolver] Hard stop: generic phrase detected');
    return { intent: false, reason: 'dishGuard' };
  }

  // DISH GUARD: If normalized text is only dish terms, return false unless explicit markers
  const normalizedWords = normalizedText.split(/\s+/).filter(w => w.length > 0);
  const isOnlyDishTerms = normalizedWords.every(word =>
    GENERIC_FOOD_TERMS.has(word) ||
    MACRO_TERMS.has(word) ||
    GENERIC_FOOD_TERMS.has(normalizedText) // Check full phrase too
  );

  // Check if message contains dish nouns
  const hasDishNoun = Array.from(GENERIC_FOOD_TERMS).some(term => {
    const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return pattern.test(trimmed);
  });

  // Explicit restaurant markers
  const explicitMarkers = [
    /\b(from|at|in)\s+[a-z0-9\s&'-]+/i,  // "from X", "at X", "in X"
    /\b[a-z0-9\s&'-]+\s+(menu|restaurant|order|near me)\b/i,  // "X menu", "X restaurant", "X order"
  ];

  const hasExplicitMarker = explicitMarkers.some(pattern => pattern.test(trimmed));

  // Rule A: Explicit markers always trigger restaurant intent
  if (hasExplicitMarker) {
    return { intent: true, reason: 'marker' };
  }

  // DISH GUARD: If message is only dish terms (or dish terms + macro terms), return false
  if (isOnlyDishTerms || (hasDishNoun && !hasExplicitMarker)) {
    return { intent: false, reason: 'dishGuard' };
  }

  // Rule B: For short messages (<=28 chars), check if it matches a known restaurant
  if (trimmed.length <= 28) {
    // Get restaurant candidates if not provided
    let candidates = restaurantCandidates;
    if (!candidates) {
      candidates = await getRestaurantCandidates();
    }

    // Use normalizedIndex if available, fallback to normalizedToCanonical for backward compatibility
    const normalizedToCanonical = candidates.normalizedIndex
      ? new Map(Array.from(candidates.normalizedIndex.entries()).map(([k, v]) => [k, v.canonicalName]))
      : candidates.normalizedToCanonical;
    const normalizedRestaurantNames = candidates.normalizedIndex
      ? Array.from(candidates.normalizedIndex.keys())
      : Array.from(normalizedToCanonical.keys());

    // Try to match against known restaurants
    const normalizedCandidate = normalizedText;

    // Check exact match
    if (normalizedToCanonical.has(normalizedCandidate)) {
      return { intent: true, reason: 'matchedRestaurant' };
    }

    // Check contains match
    for (const normalizedRestaurant of normalizedRestaurantNames) {
      if (normalizedRestaurant.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedRestaurant)) {
        if (Math.min(normalizedRestaurant.length, normalizedCandidate.length) >= 3) {
          return { intent: true, reason: 'matchedRestaurant' };
        }
      }
    }

    // Check fuzzy match (high confidence only) - use token Jaccard similarity
    if (normalizedRestaurantNames.length > 0) {
      let bestScore = 0;
      for (const normalizedRestaurant of normalizedRestaurantNames) {
        // Simple token-based similarity (Jaccard)
        const userTokens = new Set(normalizedCandidate.split(/\s+/).filter(t => t.length > 0));
        const restaurantTokens = new Set(normalizedRestaurant.split(/\s+/).filter(t => t.length > 0));
        if (userTokens.size > 0 && restaurantTokens.size > 0) {
          const intersection = new Set([...userTokens].filter(t => restaurantTokens.has(t)));
          const union = new Set([...userTokens, ...restaurantTokens]);
          const score = intersection.size / union.size;
          if (score > bestScore) {
            bestScore = score;
          }
        }
      }
      if (bestScore >= 0.5) {
        return { intent: true, reason: 'matchedRestaurant' };
      }
    }
  }

  // Default: no restaurant intent
  return { intent: false, reason: 'none' };
}

// computeFuzzyScore is defined later in the file (exported)

export type RestaurantMatchResult =
  | { status: 'MATCH'; canonicalName: string; restaurantId?: string; variants: string[]; matchType: 'exact' | 'tokenSubset' | 'fuzzy' }
  | { status: 'NOT_FOUND'; missingRestaurantQuery?: string }  // Missing restaurant query for pendingAction
  | { status: 'NO_RESTAURANT' }  // No restaurant intent - proceed with normal dish search
  | { status: 'NO_MEALS'; canonicalName: string }  // Restaurant exists but no menu_items found
  | { status: 'AMBIGUOUS'; candidates: Array<{ name: string; score: number }> };

// In-memory cache for restaurant mapping with TTL
type RestaurantCache = {
  normalizedToCanonical: Map<string, string>; // normalized -> canonical restaurant_name (legacy)
  canonicalNames: string[]; // All canonical names for reference (legacy)
  normalizedIndex: Map<string, { canonicalName: string; variants: string[] }>; // normalized -> { canonicalName, variants }
  timestamp: number;
};

let restaurantCache: RestaurantCache | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Normalizes restaurant name for comparison
 * - lowercase
 * - replace '&' with 'and'
 * - remove punctuation (apostrophes, periods, commas, hyphens)
 * - collapse whitespace
 */
export function normalizeRestaurantName(name: string): string {
  if (!name || typeof name !== 'string') return '';

  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')           // Replace & with 'and'
    .replace(/['.,\-]/g, '')        // Remove punctuation
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .trim();
}

/**
 * Extracts restaurant phrase from message using strong patterns
 * Returns the restaurant phrase or null if not found
 */
export function extractRestaurantPhrase(message: string): string | null {
  if (!message) return null;
  const s = message.toLowerCase().trim();

  // Strong patterns first
  const patterns = [
    /\bfrom\s+(.+?)$/i,
    /\bat\s+(.+?)$/i,
    /\bin\s+(.+?)$/i,
  ];

  for (const p of patterns) {
    const m = s.match(p);
    if (m?.[1]) {
      // clean trailing punctuation / filler words
      let phrase = m[1]
        .replace(/[?.!,;:]+$/g, "")
        .replace(/\b(please|today|tonight|now)\b/g, "")
        .trim();

      // avoid returning dish words as "restaurant"
      if (phrase.length >= 2) return phrase;
    }
  }

  return null;
}

/**
 * Fetches distinct restaurant names from menu_items table with counts
 * Builds normalized index: Map<normalized, { canonicalName, variants[] }>
 * Uses in-memory cache with TTL to avoid repeated DB queries
 */
export async function getRestaurantCandidates(): Promise<{
  normalizedToCanonical: Map<string, string>;
  canonicalNames: string[];
  normalizedIndex: Map<string, { canonicalName: string; variants: string[] }>;
}> {
  // Check cache first
  if (restaurantCache && Date.now() - restaurantCache.timestamp < CACHE_TTL_MS) {
    return {
      normalizedToCanonical: restaurantCache.normalizedToCanonical,
      canonicalNames: restaurantCache.canonicalNames,
      normalizedIndex: restaurantCache.normalizedIndex,
    };
  }

  try {
    const supabase = await createClient();

    // Fetch restaurant names with counts
    const { data, error } = await supabase
      .from('menu_items')
      .select('restaurant_name')
      .not('restaurant_name', 'is', null);

    if (error) {
      console.error('[restaurantResolver] Error fetching restaurants:', error);
      return {
        normalizedToCanonical: new Map(),
        canonicalNames: [],
        normalizedIndex: new Map(),
      };
    }

    // Count occurrences of each restaurant name variant
    const variantCounts = new Map<string, number>();
    const allVariants: string[] = [];

    for (const item of data || []) {
      const name = item.restaurant_name;
      if (typeof name === 'string' && name.length > 0) {
        allVariants.push(name);
        variantCounts.set(name, (variantCounts.get(name) || 0) + 1);
      }
    }

    // Group variants by normalized name
    const normalizedGroups = new Map<string, string[]>();
    for (const variant of Array.from(variantCounts.keys())) {
      const normalized = normalizeRestaurantName(variant);
      if (!normalizedGroups.has(normalized)) {
        normalizedGroups.set(normalized, []);
      }
      normalizedGroups.get(normalized)!.push(variant);
    }

    // Build normalized index: select canonicalName (most frequent, else longest)
    const normalizedIndex = new Map<string, { canonicalName: string; variants: string[] }>();
    const normalizedToCanonical = new Map<string, string>();
    const canonicalNames: string[] = [];

    for (const [normalized, variants] of normalizedGroups.entries()) {
      // Select canonical: prefer most frequent, else longest
      let canonicalName = variants[0];
      let maxCount = variantCounts.get(canonicalName) || 0;

      for (const variant of variants) {
        const count = variantCounts.get(variant) || 0;
        if (count > maxCount || (count === maxCount && variant.length > canonicalName.length)) {
          canonicalName = variant;
          maxCount = count;
        }
      }

      // Sort variants for consistency
      const sortedVariants = [...variants].sort();

      normalizedIndex.set(normalized, { canonicalName, variants: sortedVariants });
      normalizedToCanonical.set(normalized, canonicalName);
      canonicalNames.push(canonicalName);
    }

    // Sort canonical names for consistency
    canonicalNames.sort();

    // Update cache
    restaurantCache = {
      normalizedToCanonical,
      canonicalNames,
      normalizedIndex,
      timestamp: Date.now(),
    };

    // Debug logging (dev only)
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
      console.log(`[restaurantResolver] Loaded ${canonicalNames.length} restaurants with variants (cached)`);
      // Check if chipotle exists
      const chipotleNormalized = normalizeRestaurantName('chipotle');
      const hasChipotle = normalizedIndex.has(chipotleNormalized);
      const chipotleVariants = normalizedIndex.get(chipotleNormalized);
      console.log(`[restaurantResolver] Debug - chipotle check:`, {
        normalized: chipotleNormalized,
        exists: hasChipotle,
        variants: chipotleVariants?.variants || [],
        first20Candidates: Array.from(normalizedIndex.keys()).slice(0, 20),
      });
    } else {
      console.log(`[restaurantResolver] Loaded ${canonicalNames.length} restaurants with variants (cached)`);
    }

    return {
      normalizedToCanonical,
      canonicalNames,
      normalizedIndex,
    };
  } catch (error) {
    console.error('[restaurantResolver] Exception fetching restaurants:', error);
    return {
      normalizedToCanonical: new Map(),
      canonicalNames: [],
      normalizedIndex: new Map(),
    };
  }
}

/**
 * Extracts candidate restaurant phrase from user text
 * ONLY extracts from explicit marker patterns (from/at/in or name + menu/restaurant/order)
 * This is called when restaurant intent is already confirmed
 */
function extractRestaurantCandidateFromMarkers(
  userText: string,
  normalizedRestaurantNames: string[]
): string | null {
  if (!userText || typeof userText !== 'string') return null;

  const trimmed = userText.trim();

  // Pattern 1: "from X", "at X", "in X" - improved to capture everything after "from" until end or punctuation
  const prepositionPatterns = [
    /\bfrom\s+([a-z0-9\s&'-]+?)(?:\s|$|,|\.|!|\?|$)/i,  // More permissive - capture until end if no punctuation
    /\bat\s+([a-z0-9\s&'-]+?)(?:\s|$|,|\.|!|\?|$)/i,
    /\bin\s+([a-z0-9\s&'-]+?)(?:\s|$|,|\.|!|\?|$)/i,
  ];

  for (const pattern of prepositionPatterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      let candidate = match[1].trim();
      // Clean up trailing words
      candidate = candidate.replace(/\s+(restaurant|place|location|near|here|there|menu|meals?)$/i, '');
      // Remove trailing punctuation
      candidate = candidate.replace(/[.,!?;:]+$/, '');
      if (candidate.length > 0 && candidate.length < 50) {
        return candidate;
      }
    }
  }

  // Fallback: if text ends with "from X", extract X (handles "meals from chipotle" case)
  const fromEndPattern = /\bfrom\s+([a-z0-9\s&'-]+)$/i;
  const fromEndMatch = trimmed.match(fromEndPattern);
  if (fromEndMatch && fromEndMatch[1]) {
    let candidate = fromEndMatch[1].trim();
    candidate = candidate.replace(/[.,!?;:]+$/, '');
    if (candidate.length > 0 && candidate.length < 50) {
      return candidate;
    }
  }

  // Pattern 2: "X menu", "X restaurant", "X order", "X near me"
  const menuPattern = /\b([a-z0-9\s&'-]+?)\s+(menu|meals?|restaurant|order|near me)\b/i;
  const menuMatch = trimmed.match(menuPattern);
  if (menuMatch && menuMatch[1]) {
    const candidate = menuMatch[1].trim();
    if (candidate.length > 0 && candidate.length < 50) {
      return candidate;
    }
  }

  // Pattern 3: For short messages that matched a restaurant, extract the matching phrase
  // This handles cases like "jimmy johns" (short message that matched)
  const normalizedUserText = normalizeRestaurantName(trimmed);
  let bestMatch: { normalized: string; words: string[] } | null = null;
  for (const normalizedRestaurant of normalizedRestaurantNames) {
    if (normalizedUserText.includes(normalizedRestaurant) && normalizedRestaurant.length >= 3) {
      const restaurantWords = normalizedRestaurant.split(/\s+/);
      if (!bestMatch || restaurantWords.length > bestMatch.words.length) {
        bestMatch = { normalized: normalizedRestaurant, words: restaurantWords };
      }
    }
  }

  if (bestMatch) {
    // Try to extract the matching words from original text
    const lowerUserText = trimmed.toLowerCase();
    const userWords = lowerUserText.split(/\s+/);
    const restaurantWords = bestMatch.words;

    // Find consecutive matching words (check normalized versions)
    for (let i = 0; i <= userWords.length - restaurantWords.length; i++) {
      const slice = userWords.slice(i, i + restaurantWords.length).join(' ');
      const normalizedSlice = normalizeRestaurantName(slice);
      if (normalizedSlice === bestMatch.normalized) {
        // Extract original text slice (preserve original case/punctuation)
        const originalSlice = trimmed.split(/\s+/).slice(i, i + restaurantWords.length).join(' ');
        return originalSlice;
      }
    }
  }

  return null;
}

/**
 * Computes token-based Jaccard similarity between two strings
 * Returns a score between 0 and 1
 */
function tokenJaccardSimilarity(str1: string, str2: string): number {
  const tokens1 = new Set(str1.toLowerCase().split(/\s+/).filter(t => t.length > 0));
  const tokens2 = new Set(str2.toLowerCase().split(/\s+/).filter(t => t.length > 0));

  if (tokens1.size === 0 && tokens2.size === 0) return 1;
  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);

  return intersection.size / union.size;
}

/**
 * Computes fuzzy match score between user text and restaurant name
 * Uses token-based Jaccard similarity with prefix bonus
 * This is used both by detectRestaurantIntent and resolveRestaurantFromText
 */
export function computeFuzzyScore(userNormalized: string, restaurantNormalized: string): number {
  if (!userNormalized || !restaurantNormalized) return 0;

  // Base score: Jaccard similarity
  const jaccard = tokenJaccardSimilarity(userNormalized, restaurantNormalized);

  // Prefix bonus: if restaurant tokens appear in order at the start of user text
  const userTokens = userNormalized.split(/\s+/).filter(t => t.length > 0);
  const restaurantTokens = restaurantNormalized.split(/\s+/).filter(t => t.length > 0);

  let prefixBonus = 0;
  if (restaurantTokens.length > 0 && userTokens.length >= restaurantTokens.length) {
    const userPrefix = userTokens.slice(0, restaurantTokens.length).join(' ');
    if (userPrefix === restaurantNormalized) {
      prefixBonus = 0.2; // Bonus for exact prefix match
    } else {
      // Check if restaurant tokens appear in order (not necessarily consecutive)
      let restaurantIdx = 0;
      for (const userToken of userTokens) {
        if (restaurantIdx < restaurantTokens.length && userToken === restaurantTokens[restaurantIdx]) {
          restaurantIdx++;
        }
      }
      if (restaurantIdx === restaurantTokens.length) {
        prefixBonus = 0.1; // Bonus for tokens in order
      }
    }
  }

  return Math.min(1.0, jaccard + prefixBonus);
}

/**
 * Determines if a query is restaurant-only (should use generic search query instead of vector search)
 * Returns true if:
 * - Restaurant is matched AND
 * - Query does NOT contain dish keywords (burger, bowl, pizza, etc.)
 * - Query does NOT contain macro terms (calories, protein, etc.)
 * - Query has explicit restaurant markers OR is short (<=28 chars)
 */
export function isRestaurantOnlyQuery(userText: string, hasRestaurantMatch: boolean): boolean {
  if (!hasRestaurantMatch) return false;
  if (!userText || typeof userText !== 'string') return false;

  const trimmed = userText.trim();
  const lowerText = trimmed.toLowerCase();

  // Check for dish keywords
  const dishKeywords = [
    'burger', 'burgers', 'burrito', 'burritos', 'pizza', 'pizzas', 'taco', 'tacos',
    'salad', 'salads', 'sandwich', 'sandwiches', 'sub', 'subs',
    'bowl', 'bowls', 'wrap', 'wraps', 'fries', 'chicken', 'wings',
    'quesadilla', 'nachos', 'soup', 'soups', 'pasta', 'noodles',
    'breakfast', 'lunch', 'dinner', 'snack', 'sushi', 'poke'
  ];

  for (const keyword of dishKeywords) {
    const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(lowerText)) {
      return false; // Contains dish keyword, not restaurant-only
    }
  }

  // Check for macro terms
  const macroKeywords = [
    'calories', 'calorie', 'cal', 'protein', 'carbs', 'carb', 'carbohydrates',
    'fat', 'fats', 'macros', 'macro', 'grams', 'gram', 'g'
  ];

  for (const keyword of macroKeywords) {
    const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(lowerText)) {
      return false; // Contains macro terms, not restaurant-only
    }
  }

  // Check for explicit restaurant markers
  const explicitMarkers = [
    /\b(from|at|in)\s+[a-z0-9\s&'-]+/i,
    /\b[a-z0-9\s&'-]+\s+(menu|meals?|restaurant)\b/i,
  ];

  const hasExplicitMarker = explicitMarkers.some(pattern => pattern.test(trimmed));
  if (hasExplicitMarker) {
    return true; // Has explicit marker, restaurant-only
  }

  // If message is short (<=28 chars), treat as restaurant-only
  if (trimmed.length <= 28) {
    return true;
  }

  return false;
}

/**
 * Resolves restaurant name from user text with robust matching
 * Returns MATCH, NOT_FOUND, NO_RESTAURANT, or AMBIGUOUS with candidates
 * Uses query-length-aware scoring and filters candidates before deciding
 */
export async function resolveRestaurantFromText(
  userText: string,
  restaurantIntent?: boolean | { intent: boolean; reason: string } // Optional: if not provided, will be detected
): Promise<RestaurantMatchResult> {
  if (!userText || typeof userText !== 'string' || userText.trim().length === 0) {
    return { status: 'NO_RESTAURANT' };
  }

  // Detect restaurant intent if not provided
  let intentResult: { intent: boolean; reason: string };
  if (restaurantIntent === undefined) {
    intentResult = await detectRestaurantIntent(userText);
  } else if (typeof restaurantIntent === 'boolean') {
    // Legacy: convert boolean to result object
    intentResult = { intent: restaurantIntent, reason: restaurantIntent ? 'marker' : 'none' };
  } else {
    intentResult = restaurantIntent;
  }

  const hasRestaurantIntent = intentResult.intent;

  // Get restaurant candidates with normalized index
  const { normalizedIndex, canonicalNames } = await getRestaurantCandidates();

  if (canonicalNames.length === 0) {
    console.warn('[restaurantResolver] No restaurants found in database');
    return { status: 'NO_RESTAURANT' };
  }

  const normalizedRestaurantNames = Array.from(normalizedIndex.keys());

  // Diagnostics (dev only)
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    console.log('[restaurantResolver] Diagnostics:', {
      userText: userText.substring(0, 100),
      restaurantIntent: hasRestaurantIntent,
      intentReason: intentResult.reason,
    });
  }

  // If no restaurant intent, return NO_RESTAURANT (proceed with normal dish search)
  if (!hasRestaurantIntent) {
    if (isDev) {
      console.log('[restaurantResolver] No restaurant intent detected - returning NO_RESTAURANT');
    }
    return { status: 'NO_RESTAURANT' };
  }

  // Extract candidate phrase ONLY from marker patterns (when restaurant intent is true)
  const candidatePhrase = extractRestaurantCandidateFromMarkers(userText, normalizedRestaurantNames);

  if (isDev) {
    console.log('[restaurantResolver] Extracted candidate phrase:', candidatePhrase);
    console.log('[restaurantResolver] Available normalized keys (first 30):', normalizedRestaurantNames.slice(0, 30));
  }

  if (!candidatePhrase) {
    if (isDev) {
      console.log('[restaurantResolver] No candidate phrase extracted from markers');
    }
    // Try to extract restaurant query from "from X" pattern as fallback
    const fromMatch = userText.match(/\bfrom\s+([a-z0-9\s&'-]+)/i);
    const fallbackQuery = fromMatch?.[1]?.trim();
    return { status: 'NOT_FOUND', missingRestaurantQuery: fallbackQuery || undefined };
  }

  const normalizedCandidate = normalizeRestaurantName(candidatePhrase);
  const queryLength = candidatePhrase.trim().length;

  if (isDev) {
    console.log('[restaurantResolver] Matching:', {
      candidatePhrase,
      normalizedCandidate,
      queryLength,
      hasExactMatch: normalizedIndex.has(normalizedCandidate),
    });
  }

  // Define query-length-aware minScore
  // len <= 4: minScore = 0.55 (prefer exact/prefix/contains, trigram is LAST resort)
  // len 5-7: minScore = 0.40
  // len >= 8: minScore = 0.32
  let minScore: number;
  if (queryLength <= 4) {
    minScore = 0.55;
  } else if (queryLength <= 7) {
    minScore = 0.40;
  } else {
    minScore = 0.32;
  }

  // Generate ALL candidates with scores (exact, contains, fuzzy)
  type Candidate = {
    canonicalName: string;
    variants: string[];
    normalized: string;
    score: number;
    matchType: 'exact' | 'tokenSubset' | 'fuzzy'
  };
  const candidates: Candidate[] = [];

  // A) Exact normalized key match (score = 1.0)
  const exactMatch = normalizedIndex.get(normalizedCandidate);
  if (exactMatch) {
    candidates.push({
      canonicalName: exactMatch.canonicalName,
      variants: exactMatch.variants,
      normalized: normalizedCandidate,
      score: 1.0,
      matchType: 'exact',
    });
  }

  // B) Contains matches on normalized keys (score = 0.8)
  for (const [normalized, entry] of normalizedIndex.entries()) {
    // Skip if already added as exact match
    if (normalized === normalizedCandidate) continue;

    if (normalized.includes(normalizedCandidate) || normalizedCandidate.includes(normalized)) {
      // Only accept if the match is substantial (at least 3 characters)
      if (Math.min(normalized.length, normalizedCandidate.length) >= 3) {
        candidates.push({
          canonicalName: entry.canonicalName,
          variants: entry.variants,
          normalized,
          score: 0.8,
          matchType: 'tokenSubset',
        });
      }
    }
  }

  // C) Fuzzy matches with typo tolerance (only if query length > 4 or no exact/contains matches)
  // For queries <= 4, prefer exact/contains over fuzzy
  if (queryLength > 4 || candidates.length === 0) {
    // Compute similarity scores for all normalized keys
    const similarityScores: Array<{ normalized: string; entry: { canonicalName: string; variants: string[] }; score: number }> = [];

    for (const [normalized, entry] of normalizedIndex.entries()) {
      // Skip if already added
      if (candidates.some(c => c.normalized === normalized)) continue;

      const fuzzyScore = computeFuzzyScore(normalizedCandidate, normalized);
      if (fuzzyScore > 0) {
        similarityScores.push({ normalized, entry, score: fuzzyScore });
      }
    }

    // Sort by score descending
    similarityScores.sort((a, b) => b.score - a.score);

    // Add candidates that meet minScore threshold
    for (const { normalized, entry, score } of similarityScores) {
      if (score >= minScore) {
        candidates.push({
          canonicalName: entry.canonicalName,
          variants: entry.variants,
          normalized,
          score,
          matchType: 'fuzzy',
        });
      }
    }
  }

  // Filter candidates by minScore (DO NOT include candidates with score <= 0)
  const candidatesUsed = candidates.filter(c => c.score > 0 && c.score >= minScore);

  // Sort by score descending
  candidatesUsed.sort((a, b) => b.score - a.score);

  if (isDev) {
    console.log('[restaurantResolver] Candidates generated:', {
      candidatePhrase,
      queryLength,
      minScore,
      totalCandidates: candidates.length,
      candidatesUsed: candidatesUsed.length,
      top5: candidatesUsed.slice(0, 5).map(c => ({
        canonicalName: c.canonicalName,
        variants: c.variants.length,
        score: c.score,
        matchType: c.matchType
      })),
    });
  }

  // Decide MATCH/AMBIGUOUS/NOT_FOUND
  if (candidatesUsed.length === 0) {
    // No candidates meet the threshold
    if (isDev) {
      console.log('[restaurantResolver] NOT_FOUND: no candidates meet minScore threshold', {
        candidatePhrase,
        normalizedCandidate,
        availableKeys: normalizedRestaurantNames.slice(0, 10),
      });
    }
    return { status: 'NOT_FOUND', missingRestaurantQuery: candidatePhrase };
  }

  if (candidatesUsed.length === 1) {
    // Single candidate - MATCH
    const match = candidatesUsed[0];

    if (isDev) {
      console.log('[restaurantResolver] MATCH (single candidate):', {
        candidatePhrase,
        canonicalName: match.canonicalName,
        variants: match.variants,
        score: match.score,
        matchType: match.matchType,
      });
    }
    return {
      status: 'MATCH',
      canonicalName: match.canonicalName,
      variants: match.variants,
      matchType: match.matchType,
    };
  }

  // Multiple candidates - check if top one is clearly better
  const top = candidatesUsed[0];
  const second = candidatesUsed[1];
  const scoreDiff = top.score - second.score;

  // If top score - second score >= 0.15, treat as MATCH
  if (scoreDiff >= 0.15) {
    if (isDev) {
      console.log('[restaurantResolver] MATCH (clear winner):', {
        candidatePhrase,
        canonicalName: top.canonicalName,
        variants: top.variants,
        topScore: top.score,
        secondScore: second.score,
        scoreDiff,
        matchType: top.matchType,
      });
    }
    return {
      status: 'MATCH',
      canonicalName: top.canonicalName,
      variants: top.variants,
      matchType: top.matchType,
    };
  }

  // Ambiguous - multiple strong candidates with similar scores
  const ambiguousCandidates = candidatesUsed.slice(0, 5).map(c => ({ name: c.canonicalName, score: c.score }));
  if (isDev) {
    console.log('[restaurantResolver] AMBIGUOUS:', {
      candidatePhrase,
      candidates: ambiguousCandidates.map(c => c.name),
      topScore: top.score,
      secondScore: second.score,
      scoreDiff,
    });
  }
  return {
    status: 'AMBIGUOUS',
    candidates: ambiguousCandidates,
  };
}

/**
 * Verifies that a restaurant name exists in menu_items table
 * Returns true if any restaurant_name variant normalizes to the given canonical name
 */
async function verifyRestaurantAvailability(canonicalName: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const normalizedTarget = normalizeRestaurantName(canonicalName);

    // Fetch distinct restaurant names from menu_items
    const { data, error } = await supabase
      .from('menu_items')
      .select('restaurant_name')
      .not('restaurant_name', 'is', null)
      .limit(1000); // Reasonable limit

    if (error) {
      console.error('[restaurantResolver] Error verifying restaurant availability:', error);
      return false;
    }

    if (!data || data.length === 0) {
      return false;
    }

    // Check if any restaurant_name normalizes to the target
    const uniqueNames = Array.from(new Set(
      data.map(item => item.restaurant_name).filter((name): name is string => typeof name === 'string')
    ));

    for (const name of uniqueNames) {
      const normalized = normalizeRestaurantName(name);
      if (normalized === normalizedTarget) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('[restaurantResolver] Exception verifying restaurant availability:', error);
    return false;
  }
}

/**
 * Stopwords to exclude from token matching
 */
const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'of', 'co', 'company', 'restaurant', 'grill', 'cafe', 'bar', 'kitchen']);

/**
 * Tokenizes a normalized string, excluding stopwords
 */
function tokenizeExcludingStopwords(normalized: string): string[] {
  return normalized
    .split(/\s+/)
    .filter(token => token.length > 0 && !STOPWORDS.has(token));
}

/**
 * Computes Dice coefficient (bigram similarity) between two strings
 */
function diceCoefficient(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const bigrams1 = new Set<string>();
  const bigrams2 = new Set<string>();

  for (let i = 0; i < str1.length - 1; i++) {
    bigrams1.add(str1.slice(i, i + 2));
  }
  for (let i = 0; i < str2.length - 1; i++) {
    bigrams2.add(str2.slice(i, i + 2));
  }

  let intersection = 0;
  for (const bigram of bigrams1) {
    if (bigrams2.has(bigram)) intersection++;
  }

  const union = bigrams1.size + bigrams2.size;
  return union > 0 ? (2 * intersection) / union : 0;
}

/**
 * Extracts restaurant query from explicit patterns (deterministic)
 * Patterns:
 * - (meals|menu|food|lunch|dinner|breakfast)?\s*(from|at|in)\s+(.+)
 * - ^(.+?)\s+(menu|meals)$
 * - exact message that looks like a restaurant (1-6 tokens, no macro terms)
 */
export function extractExplicitRestaurantQuery(message: string): string | null {
  if (!message || typeof message !== 'string') return null;

  const trimmed = message.trim();
  const lowerTrimmed = trimmed.toLowerCase();

  // Pattern 1: (meals|menu|food|lunch|dinner|breakfast)?\s*(from|at|in)\s+(.+)
  const pattern1 = /(?:meals|menu|food|lunch|dinner|breakfast)?\s*(?:from|at|in)\s+(.+)/i;
  const match1 = trimmed.match(pattern1);
  if (match1 && match1[1]) {
    let query = match1[1].trim();
    // Remove trailing punctuation and filler words
    query = query.replace(/[.,!?;:]+$/, '');
    query = query.replace(/\s+(restaurant|place|location|near|here|there|menu|meals?)$/i, '');
    if (query.length > 0 && query.length < 100) {
      return query;
    }
  }

  // Pattern 2: ^(.+?)\s+(menu|meals)$
  const pattern2 = /^(.+?)\s+(?:menu|meals)$/i;
  const match2 = trimmed.match(pattern2);
  if (match2 && match2[1]) {
    const query = match2[1].trim();
    if (query.length > 0 && query.length < 100) {
      return query;
    }
  }

  // Pattern 3: Exact message that looks like a restaurant (1-6 tokens, no macro terms)
  const tokens = trimmed.split(/\s+/).filter(t => t.length > 0);
  if (tokens.length >= 1 && tokens.length <= 6) {
    // Check if it contains macro terms
    const macroTerms = ['calories', 'protein', 'carbs', 'fat', 'calorie', 'carb', 'gram', 'grams'];
    const hasMacroTerm = macroTerms.some(term => lowerTrimmed.includes(term));
    if (!hasMacroTerm) {
      // Check if it's not a generic dish term
      const isGenericDish = GENERIC_FOOD_TERMS.has(lowerTrimmed) ||
        tokens.some(t => GENERIC_FOOD_TERMS.has(t.toLowerCase()));
      if (!isGenericDish) {
        return trimmed;
      }
    }
  }

  return null;
}

/**
 * Universal restaurant resolver - queries restaurants table FIRST, then builds variants from menu_items
 * This is the primary resolver for explicit restaurant queries
 */
export async function resolveRestaurantUniversal(
  userText: string,
  preExtractedQuery?: string // Optional: if provided, skip internal extraction
): Promise<RestaurantMatchResult> {
  if (!userText || typeof userText !== 'string' || userText.trim().length === 0) {
    return { status: 'NO_RESTAURANT' };
  }

  // PART A: Use pre-extracted query if provided, otherwise extract from text
  const restaurantQuery = preExtractedQuery || extractExplicitRestaurantQuery(userText);
  if (!restaurantQuery) {
    return { status: 'NO_RESTAURANT' };
  }

  const qNorm = normalizeRestaurantName(restaurantQuery);
  const qTokens = tokenizeExcludingStopwords(qNorm);

  if (qTokens.length === 0) {
    return { status: 'NOT_FOUND', missingRestaurantQuery: restaurantQuery };
  }

  const isDev = process.env.NODE_ENV === 'development';
  console.log('[restaurantResolver] Universal resolver starting:', {
    restaurantQuery,
    qNorm,
    qTokens,
  });

  // PART B: Query restaurants table for canonical matching
  try {
    const supabase = await createClient();

    // Fetch all restaurants (can be cached, but for now query directly)
    const { data: restaurants, error } = await supabase
      .from('restaurants')
      .select('id, name')
      .not('name', 'is', null);

    if (error) {
      console.error('[restaurantResolver] Error fetching restaurants:', error);
      return { status: 'NOT_FOUND', missingRestaurantQuery: restaurantQuery };
    }

    if (!restaurants || restaurants.length === 0) {
      return { status: 'NOT_FOUND', missingRestaurantQuery: restaurantQuery };
    }

    // Normalize all restaurant names and build candidates
    type Candidate = {
      id: string;
      name: string;
      normalized: string;
      tokens: string[];
      score: number;
      matchType: 'exact' | 'tokenSubset' | 'fuzzy';
    };

    const candidates: Candidate[] = [];

    // 1) Exact normalized match
    for (const restaurant of restaurants) {
      const rNorm = normalizeRestaurantName(restaurant.name);
      if (rNorm === qNorm) {
        candidates.push({
          id: restaurant.id,
          name: restaurant.name,
          normalized: rNorm,
          tokens: tokenizeExcludingStopwords(rNorm),
          score: 1.0,
          matchType: 'exact',
        });
      }
    }

    // 2) Token subset match - run for all restaurants (like CAVA works)
    // This catches partial matches like "playa" -> "Playa Bowls" or "chipotle" -> "Chipotle Mexican Grill"
    for (const restaurant of restaurants) {
      // Skip if already matched exactly
      const alreadyCandidate = candidates.some(c => c.id === restaurant.id);
      if (alreadyCandidate) continue;

      const rNorm = normalizeRestaurantName(restaurant.name);
      const rTokens = tokenizeExcludingStopwords(rNorm);

      // Check if ALL qTokens are contained in rTokens (token subset match)
      // This allows "playa" to match "Playa Bowls" because "playa" is in ["playa", "bowls"]
      const allTokensMatch = qTokens.every(qToken =>
        rTokens.some(rToken => rToken === qToken)
      );

      if (allTokensMatch && qTokens.length > 0) {
        // Compute score: (#matchedTokens / #qTokens) + 0.25*(#matchedTokens / #rTokens)
        const matchedCount = qTokens.length;
        const score = (matchedCount / qTokens.length) + 0.25 * (matchedCount / Math.max(rTokens.length, 1));

        console.log('[restaurantResolver] Token subset match found:', {
          query: restaurantQuery,
          qTokens,
          restaurant: restaurant.name,
          rTokens,
          score,
        });

        candidates.push({
          id: restaurant.id,
          name: restaurant.name,
          normalized: rNorm,
          tokens: rTokens,
          score,
          matchType: 'tokenSubset',
        });
      }
    }

    // 3) Soft scoring to rank candidates
    candidates.sort((a, b) => b.score - a.score);

    // 4) Typo tolerance (if no token hits and query length allows)
    if (candidates.length === 0 && restaurantQuery.length >= 5) {
      const minScore = restaurantQuery.length <= 7 ? 0.65 : 0.6;

      for (const restaurant of restaurants) {
        const rNorm = normalizeRestaurantName(restaurant.name);
        const diceScore = diceCoefficient(qNorm, rNorm);

        if (diceScore >= minScore) {
          candidates.push({
            id: restaurant.id,
            name: restaurant.name,
            normalized: rNorm,
            tokens: tokenizeExcludingStopwords(rNorm),
            score: diceScore,
            matchType: 'fuzzy',
          });
        }
      }

      candidates.sort((a, b) => b.score - a.score);
    }

    console.log('[restaurantResolver] Candidates found:', {
      count: candidates.length,
      top5: candidates.slice(0, 5).map(c => ({ name: c.name, score: c.score, matchType: c.matchType })),
    });

    // Decide MATCH/AMBIGUOUS/NOT_FOUND
    if (candidates.length === 0) {
      return { status: 'NOT_FOUND', missingRestaurantQuery: restaurantQuery };
    }

    if (candidates.length === 1) {
      const match = candidates[0];
      console.log('[restaurantResolver] Single candidate match, building variants:', {
        canonicalName: match.name,
        restaurantId: match.id,
        matchType: match.matchType,
      });

      // PART C: Build variants from menu_items (does not use restaurant_id)
      const variants = await buildRestaurantVariants(match.name, supabase);

      console.log('[restaurantResolver] Variants built for single match:', {
        canonicalName: match.name,
        variantsCount: variants.length,
        variants: variants.slice(0, 5),
      });

      // If variants is empty, return NO_MEALS
      if (variants.length === 0) {
        console.warn('[restaurantResolver] NO_MEALS: Restaurant matched but no variants found:', match.name);
        return {
          status: 'NO_MEALS',
          canonicalName: match.name,
        };
      }

      return {
        status: 'MATCH',
        canonicalName: match.name,
        restaurantId: match.id,
        variants,
        matchType: match.matchType,
      };
    }

    // Multiple candidates - check if top one is clearly better
    // Use same logic as CAVA: if we have a reasonable match, use it
    const top = candidates[0];
    const second = candidates[1];
    const scoreDiff = second ? (top.score - second.score) : top.score;

    // If top score >= 1.0 and (topScore - secondScore) >= 0.15, treat as MATCH (exact match)
    if (top.score >= 1.0 && scoreDiff >= 0.15) {
      console.log('[restaurantResolver] Clear winner match (exact), building variants:', {
        canonicalName: top.name,
        restaurantId: top.id,
        topScore: top.score,
        secondScore: second?.score,
      });

      const variants = await buildRestaurantVariants(top.name, supabase);

      console.log('[restaurantResolver] Variants built for clear winner:', {
        canonicalName: top.name,
        variantsCount: variants.length,
        variants: variants.slice(0, 5),
      });

      // If variants is empty, return NO_MEALS
      if (variants.length === 0) {
        console.warn('[restaurantResolver] NO_MEALS: Restaurant matched but no variants found:', top.name);
        return {
          status: 'NO_MEALS',
          canonicalName: top.name,
        };
      }

      return {
        status: 'MATCH',
        canonicalName: top.name,
        restaurantId: top.id,
        variants,
        matchType: top.matchType,
      };
    }

    // For token subset matches (like "playa" -> "Playa Bowls"), if top score is reasonable
    // and clearly better than second, treat as MATCH (same logic as CAVA)
    if (top.score >= 0.7 && (!second || scoreDiff >= 0.1)) {
      console.log('[restaurantResolver] Clear winner match (token subset), building variants:', {
        canonicalName: top.name,
        restaurantId: top.id,
        topScore: top.score,
        secondScore: second?.score,
        scoreDiff,
      });

      const variants = await buildRestaurantVariants(top.name, supabase);

      console.log('[restaurantResolver] Variants built for token subset winner:', {
        canonicalName: top.name,
        variantsCount: variants.length,
        variants: variants.slice(0, 5),
      });

      // If variants is empty, return NO_MEALS
      if (variants.length === 0) {
        console.warn('[restaurantResolver] NO_MEALS: Restaurant matched but no variants found:', top.name);
        return {
          status: 'NO_MEALS',
          canonicalName: top.name,
        };
      }

      return {
        status: 'MATCH',
        canonicalName: top.name,
        restaurantId: top.id,
        variants,
        matchType: top.matchType,
      };
    }

    // AMBIGUOUS - return top 5 candidates with scores
    return {
      status: 'AMBIGUOUS',
      candidates: candidates.slice(0, 5).map(c => ({ name: c.name, score: c.score })),
    };
  } catch (error) {
    console.error('[restaurantResolver] Exception in universal resolver:', error);
    return { status: 'NOT_FOUND', missingRestaurantQuery: restaurantQuery };
  }
}

/**
 * Builds variants array from menu_items for a matched restaurant
 * Does NOT depend on restaurant_id - queries all menu_items and matches by normalization
 * Input: canonicalName (restaurants.name)
 * Output: variants[] from menu_items.restaurant_name that correspond to this canonical restaurant
 */
async function buildRestaurantVariants(
  canonicalName: string,
  supabase: any
): Promise<string[]> {
  try {
    const canonicalNorm = normalizeRestaurantName(canonicalName);
    const canonicalTokens = tokenizeExcludingStopwords(canonicalNorm);

    // Check if canonicalNorm is only stopwords (guard for partial brand match)
    const isOnlyStopwords = canonicalTokens.length === 0 ||
      canonicalTokens.every(token => STOPWORDS.has(token));
    const allowPartialMatch = canonicalNorm.length >= 4 && !isOnlyStopwords;

    // Fetch DISTINCT restaurant_name from menu_items (must paginate / no implicit limit)
    const variantSet = new Set<string>();
    let offset = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: menuItems, error } = await supabase
        .from('menu_items')
        .select('restaurant_name')
        .not('restaurant_name', 'is', null)
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.warn('[restaurantResolver] Error fetching menu_items variants:', error);
        break;
      }

      if (!menuItems || menuItems.length === 0) {
        hasMore = false;
        break;
      }

      // Process this page of menu items
      for (const item of menuItems) {
        const itemName = item.restaurant_name;
        if (typeof itemName !== 'string' || itemName.length === 0) continue;

        const itemNorm = normalizeRestaurantName(itemName);

        // a) Exact normalized match
        if (itemNorm === canonicalNorm) {
          variantSet.add(itemName);
          continue;
        }

        // b) Token subset match: tokens(canonicalNorm) subset of tokens(itemNorm)
        const itemTokens = tokenizeExcludingStopwords(itemNorm);
        const isTokenSubset = canonicalTokens.length > 0 &&
          canonicalTokens.every(ct => itemTokens.some(it => it === ct));

        if (isTokenSubset) {
          variantSet.add(itemName);
          continue;
        }

        // c) Reverse token subset: tokens(itemNorm) subset of tokens(canonicalNorm)
        // This handles cases where menu_items has "Chipotle" and canonical is "Chipotle Mexican Grill"
        const isReverseTokenSubset = itemTokens.length > 0 &&
          itemTokens.every(it => canonicalTokens.some(ct => ct === it));

        if (isReverseTokenSubset) {
          variantSet.add(itemName);
          continue;
        }

        // d) Partial brand match (with guard)
        if (allowPartialMatch) {
          if (itemNorm.includes(canonicalNorm) || canonicalNorm.includes(itemNorm)) {
            variantSet.add(itemName);
          }
        }
      }

      // Check if we need to fetch more
      if (menuItems.length < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize;
      }
    }

    const variants = Array.from(variantSet).sort();

    // Logging (always log for debugging)
    console.log('[restaurantResolver] REST_VARIANTS_BUILT:', {
      canonicalName,
      canonicalNorm,
      variantsCount: variants.length,
      sampleVariants: variants.slice(0, 5),
      totalPagesProcessed: Math.floor(offset / pageSize) + (hasMore ? 1 : 0),
    });

    if (variants.length === 0) {
      console.warn('[restaurantResolver] Restaurant matched canonically but no menu_items variants found:', {
        canonicalName,
        canonicalNorm,
        canonicalTokens,
      });
    }

    // IMPORTANT: Return [] if no variants found (not [canonicalName])
    return variants;
  } catch (error) {
    console.error('[restaurantResolver] Exception building variants:', error);
    return [];
  }
}

/**
 * Finds similar restaurants to a given query using normalization similarity
 * Returns top N similar restaurant names (canonical names)
 */
export async function findSimilarRestaurants(
  query: string,
  limit: number = 5
): Promise<string[]> {
  if (!query || typeof query !== 'string') return [];

  const { normalizedIndex } = await getRestaurantCandidates();
  const queryNormalized = normalizeRestaurantName(query);

  // Compute similarity scores for all normalized keys
  const similarityScores: Array<{ canonicalName: string; score: number }> = [];

  for (const [normalized, entry] of normalizedIndex.entries()) {
    const fuzzyScore = computeFuzzyScore(queryNormalized, normalized);
    if (fuzzyScore > 0) {
      similarityScores.push({ canonicalName: entry.canonicalName, score: fuzzyScore });
    }
  }

  // Sort by score descending and return top N canonical names
  similarityScores.sort((a, b) => b.score - a.score);
  return similarityScores.slice(0, limit).map(item => item.canonicalName);
}

/**
 * Clears the restaurant cache (useful for testing or forced refresh)
 */
export function clearRestaurantCache(): void {
  restaurantCache = null;
}
