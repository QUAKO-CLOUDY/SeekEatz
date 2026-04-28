import {
  CUISINE_SYNONYMS,
  INTENT_FILTERS,
  DISH_TAXONOMY,
} from '@/lib/tagging/taxonomy';
import {
  detectExplicitRestaurantConstraint,
  detectMacroConstraints,
} from '@/lib/intent-detection';
import { normalizeSearchText } from '@/lib/query-normalization';
import { parsedSearchQuerySchema, type ParsedSearchQuery } from './types';
import { ALIAS_GROUPS, CATEGORY_ENUM, CUISINE_STYLE_ENUM } from './ontology';

const MEAL_TYPE_PATTERNS: Array<[RegExp, NonNullable<ParsedSearchQuery['mealType']>]> = [
  [/\bbreakfast\b/i, 'breakfast'],
  [/\bbrunch\b/i, 'brunch'],
  [/\blunch\b/i, 'lunch'],
  [/\bdinner\b/i, 'dinner'],
  [/\ball[\s-]day\b/i, 'all_day'],
  [/\bsnack\b/i, 'snack'],
  [/\bdessert\b/i, 'dessert'],
  [/\bdrink\b/i, 'drink'],
];

const DIETARY_PATTERNS: Array<[RegExp, NonNullable<ParsedSearchQuery['dietType']>, ParsedSearchQuery['dietaryFlags'][number]?]> = [
  [/\bvegan\b/i, 'vegan', 'vegan'],
  [/\bplant[\s-]?based\b/i, 'vegan', 'vegan'],
  [/\bvegetarian\b/i, 'vegetarian', 'vegetarian'],
  [/\bveggie\b/i, 'vegetarian', 'vegetarian'],
  [/\bpescatarian\b/i, 'pescatarian', 'pescatarian'],
  [/\bgluten[\s-]?(free|aware)\b/i, 'gluten_aware', 'gluten_aware'],
  [/\bketo\b/i, 'keto', 'keto'],
];

const TAG_PATTERNS: Array<[RegExp, ParsedSearchQuery['includeTags'][number], ParsedSearchQuery['sortPriority'][number]?]> = [
  [/\bhearty\b/i, 'hearty', 'category_match'],
  [/\bfilling\b/i, 'filling', 'closest_macros'],
  [/\blight\b/i, 'light', 'lowest_calories'],
  [/\bcomfort\s+food\b/i, 'comfort_food', 'category_match'],
  [/\bfresh\b/i, 'fresh', 'category_match'],
  [/\bgrilled\b/i, 'grilled', 'category_match'],
  [/\bsmoky\b/i, 'smoky', 'cuisine_match'],
  [/\bspicy\b/i, 'spicy', 'category_match'],
  [/\bsweet\b/i, 'sweet', 'category_match'],
  [/\bsavory\b/i, 'savory', 'category_match'],
  [/\bhealthy\b/i, 'healthy', 'closest_macros'],
  [/\bpost[\s-]?workout\b/i, 'post_workout', 'protein_density'],
  [/\bpre[\s-]?workout\b/i, 'pre_workout', 'closest_macros'],
];

const PROTEIN_PATTERNS: Array<[RegExp, ParsedSearchQuery['proteinPreference'][number]]> = [
  [/\bchicken\b/i, 'chicken'],
  [/\bsteak\b/i, 'steak'],
  [/\bbeef\b/i, 'beef'],
  [/\bturkey\b/i, 'turkey'],
  [/\btofu\b/i, 'tofu'],
  [/\bfish\b/i, 'fish'],
  [/\bshrimp\b/i, 'shrimp'],
  [/\bpork\b/i, 'pork'],
  [/\begg\b/i, 'egg'],
];

const LOCATION_PATTERNS: Array<[RegExp, string]> = [
  [/\bnear me\b/i, 'near_me'],
  [/\bnearby\b/i, 'nearby'],
  [/\bwithin\s+\d+\s*(mile|miles|mi)\b/i, 'distance_hint'],
];

const EXCLUDE_PATTERNS = [
  /\b(?:no|not|without|hold|skip)\s+([a-z][a-z\s-]{1,30})/gi,
];

const LARGE_PORTION_PATTERNS = /\b(big|large|huge|giant|family\s+size|family\s+pack|feast|platter|sharing|party\s+size|bulk)\b/i;

const STRIP_PATTERNS: RegExp[] = [
  /\b(under|below|less\s+than|at\s+most|max(?:imum)?|at\s+least|minimum|min(?:imum)?|over|above|more\s+than)\s+\d+\s*(?:calories?|cal|kcal|g|grams?|protein|pro|carbs?|carbohydrates?|fat|fats?)\b/gi,
  /\b\d+\s*(?:g|grams?)\s+(?:protein|pro|carbs?|fat|fats?)\b/gi,
  /\b\d+\s*(?:calories?|cal|kcal)\b/gi,
  /\b(?:from|at)\s+[a-z0-9&'.\s-]{2,30}(?=\s|$|,|\.)/gi,
  /\b(?:for\s+)?(?:breakfast|brunch|lunch|dinner|snack|dessert|drink)\b/gi,
];

const QUERY_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'be', 'best', 'but', 'by', 'find', 'for', 'from', 'get',
  'give', 'healthy', 'i', 'in', 'is', 'it', 'light', 'low', 'me', 'my', 'near', 'of', 'on',
  'option', 'options', 'or', 'please', 'show', 'something', 'that', 'the', 'to', 'under',
  'want', 'with', 'without',
]);

const NON_CUISINE_PROXY_TERMS = new Set([
  'breakfast',
  'brunch',
  'sandwich',
  'sandwiches',
  'burger',
  'burgers',
  'pizza',
  'pasta',
  'pastas',
  'smoothie',
  'bagel',
  'taco',
  'tacos',
  'burrito',
  'burritos',
  'quesadilla',
  'healthy',
  'clean',
  'whole',
  'organic',
  'nutritious',
  'bowls',
  'grain bowl',
  'power bowl',
  'acai',
  'acai bowl',
  'pitaya bowl',
  'smoothie bowl',
  'fish',
  'shrimp',
  'salmon',
  'tuna',
  'crab',
  'lobster',
]);

export type ParsedQuery = ParsedSearchQuery;

export function parseQuery(raw: string): ParsedQuery {
  const normalizedQuery = normalizeSearchText(raw);
  const query = normalizedQuery.text.trim();

  const restaurantResult = detectExplicitRestaurantConstraint(query);
  const macroResult = detectMacroConstraints(query);
  const contentQuery = stripRestaurantConstraintForContent(query, restaurantResult.restaurantQuery);
  const lowerQuery = query.toLowerCase();
  const lowerContent = contentQuery.toLowerCase();

  const categories = prioritizeSpecificCategories(detectCategories(lowerContent));
  if (/\b(acai|pitaya|smoothie)\s+bowl\b/i.test(lowerContent)) {
    const bowlOnlyCategories = categories.filter((category) => category !== 'smoothie' && category !== 'entree');
    bowlOnlyCategories.unshift('bowl');
    categories.splice(0, categories.length, ...dedupe(bowlOnlyCategories));
  }
  const mealTypes = dedupe<string>(MEAL_TYPE_PATTERNS.filter(([pattern]) => pattern.test(lowerQuery)).map(([, type]) => type));
  if (!mealTypes.includes('breakfast') && /\begg\b/i.test(lowerQuery) && /\b(wrap|sandw(?:ich(?:es)?|hich)|bagel|biscuit)\b/i.test(lowerQuery)) {
    mealTypes.unshift('breakfast');
  }
  if (mealTypes.includes('breakfast') && /\bbreakfast\s+sandw(?:ich(?:es)?|hich)\b/i.test(lowerQuery)) {
    categories.unshift('breakfast_sandwich');
    const entreeIndex = categories.indexOf('entree');
    if (entreeIndex >= 0) {
      categories.splice(entreeIndex, 1);
    }
  }
  if (mealTypes.includes('breakfast') && /\bbreakfast\s+burrito\b/i.test(lowerQuery)) {
    categories.unshift('burrito');
    const entreeIndex = categories.indexOf('entree');
    if (entreeIndex >= 0) {
      categories.splice(entreeIndex, 1);
    }
  }
  if (mealTypes.includes('breakfast') && /\bbreakfast\s+wrap\b/i.test(lowerQuery)) {
    categories.unshift('wrap');
    const entreeIndex = categories.indexOf('entree');
    if (entreeIndex >= 0) {
      categories.splice(entreeIndex, 1);
    }
  }
  if (mealTypes.includes('breakfast') && categories.length === 1 && categories[0] === 'entree') {
    categories.length = 0;
  }
  if ((/\bsteak\s+salad\b/i.test(lowerContent) || /\bsalad\s+with\s+steak\b/i.test(lowerContent)) && categories.includes('entree')) {
    categories.unshift('salad');
    const entreeIndex = categories.indexOf('entree');
    if (entreeIndex >= 0) {
      categories.splice(entreeIndex, 1);
    }
  }
  const cuisineOrStyle = detectCuisineOrStyle(lowerContent);
  const proteinPreference = dedupe<string>(PROTEIN_PATTERNS.filter(([pattern]) => pattern.test(lowerContent)).map(([, value]) => value));
  const locationHints = dedupe<string>(LOCATION_PATTERNS.filter(([pattern]) => pattern.test(lowerContent)).map(([, value]) => value));

  const includeTags: string[] = [];
  const cravingTerms: string[] = [];
  const sortPriority = new Set<ParsedQuery['sortPriority'][number]>(['calorie_match']);

  for (const [pattern, tag, priority] of TAG_PATTERNS) {
    if (pattern.test(lowerContent)) {
      includeTags.push(tag);
      cravingTerms.push(tag.replace(/_/g, ' '));
      if (priority) sortPriority.add(priority);
    }
  }

  const dietaryFlags: string[] = [];
  let dietType: string | undefined;
  for (const [pattern, detectedDiet, flag] of DIETARY_PATTERNS) {
    if (pattern.test(lowerContent)) {
      dietType = detectedDiet;
      if (flag) dietaryFlags.push(flag);
    }
  }

  const intentSignal = detectIntentSignal(lowerContent);
  const normalizedCategory = categories[0] ?? undefined;
  const dishKeywords = normalizedCategory ? DISH_TAXONOMY[normalizedCategory]?.keywords?.slice(0, 3) : undefined;
  const mealType = mealTypes[0] ?? undefined;
  const cuisineType = cuisineOrStyle[0] ?? undefined;
  const excludeTags = extractExcludedTerms(query);
  const confidenceNotes = buildConfidenceNotes({
    query,
    intentSignal,
    categories,
    mealTypes,
    cuisineOrStyle,
    proteinPreference,
    dietaryFlags,
    includeTags: dedupe(includeTags),
    excludeTags: dedupe(excludeTags),
    hasMacros: macroResult.hasMacroConstraints,
  });

  applyIntentFilters(lowerContent, macroResult);

  const hasStructuredFilters = Boolean(
    restaurantResult.restaurantQuery ||
    categories.length > 0 ||
    mealTypes.length > 0 ||
    cuisineOrStyle.length > 0 ||
    proteinPreference.length > 0 ||
    dietaryFlags.length > 0 ||
    macroResult.hasMacroConstraints
  );

  if (macroResult.proteinMin !== undefined || includeTags.includes('post_workout')) {
    sortPriority.add('protein_density');
  }
  if (categories.length > 0) {
    sortPriority.add('category_match');
  }
  if (mealTypes.length > 0) {
    sortPriority.add('meal_type_match');
  }
  if (cuisineOrStyle.length > 0) {
    sortPriority.add('cuisine_match');
  }

  const parsed: ParsedQuery = parsedSearchQuerySchema.parse({
    intent: 'meal_search',
    raw: query,
    restaurantQuery: restaurantResult.restaurantQuery || undefined,
    mealTypes,
    cuisineOrStyle,
    categories,
    proteinPreference,
    minCalories: macroResult.caloriesMin,
    maxCalories: macroResult.caloriesMax,
    minProtein: macroResult.proteinMin,
    maxProtein: macroResult.proteinMax,
    maxCarbs: macroResult.carbsMax,
    minCarbs: macroResult.carbsMin,
    maxFat: macroResult.fatsMax,
    minFat: macroResult.fatsMin,
    includeTags: dedupe(includeTags),
    excludeTags: dedupe(excludeTags),
    dietaryFlags: dedupe(dietaryFlags),
    cravingTerms: dedupe(cravingTerms),
    sortPriority: Array.from(sortPriority),
    locationHints,
    confidenceNotes,
    parserConfidence: computeParserConfidence({
      hasStructuredFilters,
      confidenceNotes,
      categories,
      mealTypes,
      cuisineOrStyle,
      proteinPreference,
      locationHints,
    }),
    semanticQuery: buildSemanticQuery(query, {
      restaurantQuery: restaurantResult.restaurantQuery,
    }),
    normalizedCategory,
    dishKeywords,
    mealType,
    cuisineType,
    dietType,
    intentLabel: intentSignal,
    excludeLargePortions: !LARGE_PORTION_PATTERNS.test(lowerContent),
    hasStructuredFilters,
  });

  return parsed;
}

function stripRestaurantConstraintForContent(query: string, restaurantQuery?: string): string {
  if (!restaurantQuery) {
    return query;
  }

  const escapedRestaurant = restaurantQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return query
    .replace(new RegExp(`\\b(from|at)\\s+${escapedRestaurant}\\b`, 'gi'), ' ')
    .replace(new RegExp(`\\b${escapedRestaurant}\\b`, 'gi'), ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function isSQLSufficient(parsed: ParsedQuery): boolean {
  const hasHardNutrition = (
    parsed.minCalories !== undefined ||
    parsed.maxCalories !== undefined ||
    parsed.minProtein !== undefined ||
    parsed.maxProtein !== undefined ||
    parsed.maxCarbs !== undefined ||
    parsed.minCarbs !== undefined ||
    parsed.maxFat !== undefined ||
    parsed.minFat !== undefined
  );

  return Boolean(
    hasHardNutrition ||
    parsed.restaurantQuery ||
    parsed.categories.length > 0 ||
    parsed.mealTypes.length > 0 ||
    parsed.cuisineOrStyle.length > 0 ||
    parsed.proteinPreference.length > 0 ||
    parsed.includeTags.length > 0 ||
    parsed.dietaryFlags.length > 0
  );
}

function detectCategories(lower: string): string[] {
  const matches: string[] = [];
  const sortedDishes = Object.entries(DISH_TAXONOMY).sort(
    (a, b) =>
      Math.max(...b[1].keywords.map(k => k.length)) -
      Math.max(...a[1].keywords.map(k => k.length))
  );

  for (const [, { keywords, normalized }] of sortedDishes) {
    for (const keyword of keywords) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
        const normalizedCategory = normalizeCategoryValue(normalized, keyword);
        if (normalizedCategory) {
          matches.push(normalizedCategory);
        }
        break;
      }
    }
  }

  return dedupe(matches);
}

function prioritizeSpecificCategories(categories: string[]): string[] {
  if (!categories.includes('entree')) {
    return categories;
  }

  const specificCategories = categories.filter((category) => category !== 'entree');
  if (specificCategories.length === 0) {
    return categories;
  }

  return [...specificCategories, 'entree'];
}

function detectCuisineOrStyle(lower: string): string[] {
  const detected = new Set<string>();
  const sortedCuisines = Object.entries(CUISINE_SYNONYMS).sort((a, b) => b[0].length - a[0].length);

  for (const [phrase, cuisineType] of sortedCuisines) {
    if (NON_CUISINE_PROXY_TERMS.has(phrase)) {
      continue;
    }

    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
      const normalizedCuisine = normalizeCuisineValue(cuisineType, phrase);
      if (normalizedCuisine) {
        detected.add(normalizedCuisine);
      }

      const aliasValues = ALIAS_GROUPS[normalizedCuisine ?? cuisineType];
      if (aliasValues) {
        aliasValues.forEach((value) => {
          const normalizedAlias = normalizeCuisineValue(value, value);
          if (normalizedAlias) {
            detected.add(normalizedAlias);
          }
        });
      }
    }
  }

  return dedupe(Array.from(detected)).filter((value): value is string => Boolean(value));
}

function normalizeCategoryValue(value: string, keyword?: string): string | undefined {
  const normalized = value.toLowerCase().replace(/\s+/g, '_');
  const normalizedKeyword = keyword?.toLowerCase().replace(/\s+/g, '_');

  if (
    normalized === 'entree' &&
    (
      normalizedKeyword?.includes('sushi') ||
      normalizedKeyword?.includes('roll') ||
      normalizedKeyword?.includes('sashimi') ||
      normalizedKeyword?.includes('nigiri') ||
      normalizedKeyword?.includes('maki')
    )
  ) {
    return undefined;
  }

  const allowed = new Set<string>(CATEGORY_ENUM);

  if (allowed.has(normalized)) {
    return normalized;
  }

  if (normalized === 'taco') return 'tacos';
  if (normalized === 'breakfast_item') {
    if (normalizedKeyword?.includes('sandwich') || normalizedKeyword?.includes('bagel') || normalizedKeyword?.includes('biscuit')) {
      return 'breakfast_sandwich';
    }
    return 'entree';
  }

  if (['quesadilla', 'chicken', 'wings', 'soup', 'seafood'].includes(normalized)) {
    return 'entree';
  }

  return undefined;
}

function normalizeCuisineValue(value: string, phrase?: string): string | undefined {
  const normalized = value.toLowerCase().replace(/\s+/g, '_');
  const normalizedPhrase = phrase?.toLowerCase().replace(/\s+/g, '_');
  const allowed = new Set<string>(CUISINE_STYLE_ENUM);

  if (normalizedPhrase === 'greek') return 'greek';
  if (normalizedPhrase === 'sushi') return 'sushi';
  if (normalizedPhrase === 'southern') return 'southern';
  if (normalizedPhrase === 'seafood') return 'seafood';

  if (allowed.has(normalized)) {
    return normalized;
  }

  if (normalized === 'bbq') return 'barbecue';
  if (normalized === 'pizza') return 'italian';
  if (normalized === 'sandwiches') return 'american';
  if (normalized === 'smoothie_juice') return 'healthy';
  if (normalized === 'breakfast') return 'american';
  if (normalizedPhrase === 'healthy') return 'healthy';
  if (normalizedPhrase === 'barbecue' || normalizedPhrase === 'bbq' || normalizedPhrase === 'smoked') {
    return 'barbecue';
  }

  return undefined;
}

function detectIntentSignal(lower: string): string | undefined {
  const sortedIntents = Object.entries(INTENT_FILTERS).sort((a, b) => b[0].length - a[0].length);
  for (const [phrase, filters] of sortedIntents) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
      return filters.label;
    }
  }
  return undefined;
}

function applyIntentFilters(lower: string, macroResult: ReturnType<typeof detectMacroConstraints>): void {
  const sortedIntents = Object.entries(INTENT_FILTERS).sort((a, b) => b[0].length - a[0].length);
  for (const [phrase, filters] of sortedIntents) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
      if (macroResult.caloriesMax === undefined && filters.maxCalories !== undefined) {
        macroResult.caloriesMax = filters.maxCalories;
      }
      if (macroResult.caloriesMin === undefined && filters.minCalories !== undefined) {
        macroResult.caloriesMin = filters.minCalories;
      }
      if (macroResult.proteinMin === undefined && filters.minProtein !== undefined) {
        macroResult.proteinMin = filters.minProtein;
      }
      if (macroResult.proteinMax === undefined && filters.maxProtein !== undefined) {
        macroResult.proteinMax = filters.maxProtein;
      }
      if (macroResult.carbsMax === undefined && filters.maxCarbs !== undefined) {
        macroResult.carbsMax = filters.maxCarbs;
      }
      if (macroResult.carbsMin === undefined && filters.minCarbs !== undefined) {
        macroResult.carbsMin = filters.minCarbs;
      }
      if (macroResult.fatsMax === undefined && filters.maxFat !== undefined) {
        macroResult.fatsMax = filters.maxFat;
      }
    }
  }
}

function buildSemanticQuery(
  raw: string,
  parsed: { restaurantQuery?: string }
): string {
  let semantic = raw;

  for (const pattern of STRIP_PATTERNS) {
    semantic = semantic.replace(pattern, ' ');
  }

  if (parsed.restaurantQuery) {
    const escaped = parsed.restaurantQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    semantic = semantic.replace(new RegExp(`\\b(from|at)\\s+${escaped}\\b`, 'gi'), ' ');
  }

  semantic = semantic.replace(/\s{2,}/g, ' ').trim();
  return semantic.length >= 3 ? semantic : raw;
}

function extractExcludedTerms(query: string): string[] {
  const terms: string[] = [];
  for (const pattern of EXCLUDE_PATTERNS) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(query)) !== null) {
      const extracted = match[1]?.trim().toLowerCase();
      if (extracted) {
        const cleaned = extracted.split(/\b(?:for|with|from|under|over|at)\b/i)[0].trim();
        if (cleaned && cleaned.length <= 32) {
          terms.push(cleaned.replace(/\s+/g, '_'));
        }
      }
    }
  }
  return terms;
}

function buildConfidenceNotes(input: {
  query: string;
  intentSignal?: string;
  categories: string[];
  mealTypes: string[];
  cuisineOrStyle: string[];
  proteinPreference: string[];
  dietaryFlags: string[];
  includeTags: string[];
  excludeTags: string[];
  hasMacros: boolean;
}): string[] {
  const notes: string[] = [];
  if (!input.hasMacros && input.query.split(/\s+/).length <= 2) {
    notes.push('short_query');
  }
  if (input.intentSignal) {
    notes.push(`intent:${input.intentSignal}`);
  }
  if (input.categories.length === 0 && input.cuisineOrStyle.length === 0 && input.proteinPreference.length === 0) {
    notes.push('needs_semantic_support');
  }
  if (input.mealTypes.length === 0) {
    notes.push('meal_type_unspecified');
  }
  if (input.dietaryFlags.length > 0) {
    notes.push('dietary_filters_detected');
  }
  if (hasUnsupportedTerms(input)) {
    notes.push('unsupported_terms_detected');
  }
  if (hasConflictingCategorySignals(input.categories)) {
    notes.push('conflicting_categories');
  }
  return notes;
}

function computeParserConfidence(input: {
  hasStructuredFilters: boolean;
  confidenceNotes: string[];
  categories: string[];
  mealTypes: string[];
  cuisineOrStyle: string[];
  proteinPreference: string[];
  locationHints: string[];
}): number {
  let confidence = input.hasStructuredFilters ? 0.72 : 0.42;
  confidence += Math.min(input.categories.length, 1) * 0.08;
  confidence += Math.min(input.mealTypes.length, 1) * 0.05;
  confidence += Math.min(input.cuisineOrStyle.length, 1) * 0.05;
  confidence += Math.min(input.proteinPreference.length, 1) * 0.04;
  confidence += Math.min(input.locationHints.length, 1) * 0.03;
  if (input.confidenceNotes.includes('needs_semantic_support')) {
    confidence -= 0.1;
  }
  if (input.confidenceNotes.includes('short_query')) {
    confidence -= 0.05;
  }
  if (input.confidenceNotes.includes('unsupported_terms_detected')) {
    confidence -= 0.18;
  }
  return Math.max(0.15, Math.min(0.98, Number(confidence.toFixed(2))));
}

function dedupe<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function hasUnsupportedTerms(input: {
  query: string;
  intentSignal?: string;
  categories: string[];
  mealTypes: string[];
  cuisineOrStyle: string[];
  proteinPreference: string[];
  dietaryFlags: string[];
  includeTags: string[];
  excludeTags: string[];
}): boolean {
  const informativeTokens = input.query
    .toLowerCase()
    .match(/[a-z][a-z'-]{2,}/g) ?? [];

  const recognizedTokens = new Set<string>();
  const recognizedValues = [
    ...(input.categories ?? []),
    ...(input.mealTypes ?? []),
    ...(input.cuisineOrStyle ?? []),
    ...(input.proteinPreference ?? []),
    ...(input.dietaryFlags ?? []),
    ...(input.includeTags ?? []),
    ...(input.excludeTags ?? []),
    input.intentSignal ?? '',
  ];

  for (const value of recognizedValues) {
    for (const token of value.split(/[_\s-]+/g)) {
      const normalized = token.trim().toLowerCase();
      if (normalized.length >= 3) {
        recognizedTokens.add(normalized);
      }
    }
  }

  const unknownTokens = informativeTokens.filter((token) => {
    if (QUERY_STOPWORDS.has(token)) {
      return false;
    }

    if (recognizedTokens.has(token)) {
      return false;
    }

    return true;
  });

  return unknownTokens.length >= 2;
}

function hasConflictingCategorySignals(categories: string[]): boolean {
  if (categories.length < 2) {
    return false;
  }

  const uniqueCategories = new Set(categories);
  if (!uniqueCategories.has('smoothie')) {
    return false;
  }

  return Array.from(uniqueCategories).some((category) => category !== 'smoothie');
}
