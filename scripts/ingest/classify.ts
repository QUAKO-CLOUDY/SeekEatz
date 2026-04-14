/**
 * SeekEatz Data Ingestion — Auto Classifier
 *
 * Given a raw item name, description, and optional category hint, this module
 * infers item_type, normalized_category, meal_type, and food_tags so that
 * ingested items match SeekEatz's classification system.
 */

// ─── item_type detection ──────────────────────────────────────────────────────

const DRINK_KEYWORDS = [
  'smoothie', 'shake', 'lemonade', 'iced tea', 'coffee', 'espresso', 'latte',
  'cappuccino', 'juice', 'soda', 'water', 'beer', 'wine', 'cocktail', 'mocktail',
  'slushie', 'frappuccino', 'cold brew', 'hot chocolate', 'cider', 'kombucha',
  'protein shake', 'sports drink', 'energy drink', 'sparkling water',
];

const SIDE_KEYWORDS = [
  'side salad', 'side of', 'small side', 'coleslaw', 'apple slices',
  'house salad', 'cup of soup', 'breadstick', 'garlic bread',
  'corn on the cob', 'mashed potato side', 'mac side',
];

const MODIFIER_KEYWORDS = [
  'dressing', 'sauce', 'topping', 'add-on', 'add on', 'extra', 'substitution',
  'condiment', 'syrup', 'jam', 'butter', 'spread', 'creamer', 'packet',
  'garnish', 'drizzle', 'seasoning', 'vinaigrette', 'ranch', 'ketchup', 'mustard',
];

const INGREDIENT_SECTION_REGEX = /\bingredients?\b|\btoppings?\b|\bdressings?\b|\bsauces?\b|\bextras?\b|\badd[\s-]?ons?\b/i;
const COMPOSED_MEAL_REGEX = /\bbowls?\b|\bburritos?\b|\btacos?\b|\bsalads?\b|\bwraps?\b|\bsandw(?:ich|hich)(?:es)?\b|\bquesadilla\b|\bpita\b|\bflatbread\b|\bplate\b|\bplatter\b/i;

const SNACK_KEYWORDS = [
  'cookie', 'brownie', 'muffin', 'croissant', 'donut', 'bagel chip',
  'granola bar', 'snack pack', 'chips', 'crackers', 'pretzel',
];

const LARGE_PORTION_KEYWORDS = [
  'family', 'feast', 'party tray', 'party pack', 'group', 'catering',
  'large order', 'bulk', 'dozen', 'half dozen', 'bucket', 'platter for',
  'serves 4', 'serves 6', 'serves 8', 'feeds',
];

export function detectItemType(
  name: string,
  description: string = '',
  calories: number = 0,
  rawCategory: string = ''
): 'meal' | 'side' | 'drink' | 'snack' | 'modifier' {
  const text = `${name} ${description} ${rawCategory}`.toLowerCase();

  // Hard-disqualify: tiny items are almost certainly modifiers
  if (calories > 0 && calories < 50) return 'modifier';

  if (INGREDIENT_SECTION_REGEX.test(rawCategory) && !COMPOSED_MEAL_REGEX.test(text)) {
    return 'modifier';
  }

  if (MODIFIER_KEYWORDS.some(k => text.includes(k))) return 'modifier';
  if (DRINK_KEYWORDS.some(k => text.includes(k))) return 'drink';
  if (SNACK_KEYWORDS.some(k => text.includes(k) && calories < 400)) return 'snack';
  if (SIDE_KEYWORDS.some(k => text.includes(k))) return 'side';

  return 'meal';
}

// ─── food_tags detection ──────────────────────────────────────────────────────

export function detectFoodTags(
  name: string,
  description: string = '',
  calories: number = 0,
  rawCategory: string = ''
): string[] {
  void calories;
  const text = `${name} ${description} ${rawCategory}`.toLowerCase();
  const tags: string[] = [];

  if (LARGE_PORTION_KEYWORDS.some(k => text.includes(k))) {
    tags.push('large_portion');
  }

  const cateringWords = ['catering', 'party tray', 'party pack', 'large order', 'bulk'];
  if (cateringWords.some(k => text.includes(k))) {
    tags.push('catering');
  }

  const sharingWords = ['for 2', 'for two', 'sharing', 'platter for', 'to share'];
  if (sharingWords.some(k => text.includes(k))) {
    tags.push('sharing_platter');
  }

  const multiWords = ['family size', 'family pack', 'serves ', 'feeds '];
  if (multiWords.some(k => text.includes(k))) {
    tags.push('multi_serving');
  }

  // Diet tags
  if (/\bvegan\b/.test(text)) tags.push('vegan');
  if (/\bvegetarian\b/.test(text)) tags.push('vegetarian');
  if (/\bgluten.?free\b/.test(text)) tags.push('gluten_free');
  if (/\bketo\b/.test(text)) tags.push('keto');
  if (/\bpaleo\b/.test(text)) tags.push('paleo');
  if (/\blow.?carb\b/.test(text)) tags.push('low_carb');
  if (/\bdairy.?free\b/.test(text)) tags.push('dairy_free');

  return [...new Set(tags)];
}

// ─── meal_type detection ──────────────────────────────────────────────────────

const BREAKFAST_KEYWORDS = [
  'breakfast', 'egg', 'waffle', 'pancake', 'french toast', 'omelette', 'omelet',
  'benedict', 'hash brown', 'hashbrown', 'bacon', 'sausage patty', 'bagel sandwich',
  'morning', 'brunch', 'avocado toast', 'granola bowl', 'acai bowl', 'pitaya bowl', 'smoothie bowl',
];

const DINNER_KEYWORDS = [
  'dinner', 'steak', 'prime rib', 'filet', 'lobster',
  'salmon fillet', 'roast', 'surf and turf',
];

export function detectMealType(
  name: string,
  description: string = '',
  rawMealType: string = '',
  rawCategory: string = ''
): 'breakfast' | 'lunch' | 'dinner' | 'brunch' | 'snack' | 'all_day' {
  const text = `${name} ${description} ${rawMealType} ${rawCategory}`.toLowerCase();

  if (/\bbrunch\b/.test(text)) return 'brunch';
  if (/\bbreakfast\b/.test(text) || BREAKFAST_KEYWORDS.some(k => text.includes(k))) return 'breakfast';
  if (/\blunch\b/.test(text)) return 'lunch';
  if (/\bdinner\b/.test(text) || DINNER_KEYWORDS.some(k => text.includes(k))) return 'dinner';
  if (/\bsnack\b/.test(text)) return 'snack';

  return 'all_day';
}

// ─── normalized_category detection ───────────────────────────────────────────

const BREAKFAST_SANDWICH_REGEX =
  /\bbreakfast sandw(?:ich|hich)\b|\begg sandw(?:ich|hich)\b|\bbagel sandw(?:ich|hich)\b|\bbiscuit sandw(?:ich|hich)\b|\bcroissant sandw(?:ich|hich)\b|\bmcgriddle\b|\bmcmuffin\b|\begg white grill\b|\belevated egg sandw(?:ich|hich)\b/;

const GENERIC_ENTREE_REGEX = /\bentr(?:e|é)e?s?\b/i;
const BOWL_REGEX = /\b(?:grain\s+|rice\s+|power\s+|protein\s+|signature\s+|curated\s+|acai\s+)?bowls?\b/i;
const SALAD_REGEX = /\bsalads?\b(?!\s+sandw(?:ich|hich)\b)/i;
const WRAP_REGEX = /\b(?:wrap|wraps|pita|pitas|flatbread|flatbreads)\b/i;
const SANDWICH_REGEX = /\bsandw(?:ich|hich)(?:es)?\b|\bsubs?\b|\bhoagie\b|\bgrinder\b/i;
const TACO_REGEX = /\btacos?\b/i;
const BURRITO_REGEX = /\bburritos?\b/i;
const SMOOTHIE_REGEX = /\b(?:smoothie|smoothies|juice|juices|shake|shakes)\b/i;

const SALAD_FORWARD_RESTAURANTS = [
  /\bjust salad\b/i,
  /\bchopt\b/i,
  /\bsweetgreen\b/i,
  /\bsalad and go\b/i,
  /\bcrisp\s*&\s*green\b/i,
  /\bcrisp\s+and\s+green\b/i,
];

const CATEGORY_MAP: Array<[RegExp, string]> = [
  [BREAKFAST_SANDWICH_REGEX, 'breakfast_sandwich'],
  [/\bbreakfast burrito\b/, 'burrito'],
  [BOWL_REGEX, 'bowl'],
  [SMOOTHIE_REGEX, 'smoothie'],
  [SALAD_REGEX, 'salad'],
  [WRAP_REGEX, 'wrap'],
  [SANDWICH_REGEX, 'sandwich'],
  [BURRITO_REGEX, 'burrito'],
  [TACO_REGEX, 'tacos'],
  [/\burger\b|\bcheeseburger\b|\bpatty\b/, 'burger'],
  [/\bpizza\b|\bcalzone\b|\bstromboli\b/, 'pizza'],
  [/\bquesadilla\b|\bfajita\b|\bnachos\b/, 'entree'],
  [/\bpasta\b|\bspaghetti\b|\bpenne\b|\bfettuccine\b|\blasagna\b|\bravioli\b/, 'pasta'],
  [/\bsushi\b|\broll\b.*japanese|\bsashimi\b|\bmaki\b/, 'entree'],
  [/\bsteak\b|\bsirloin\b|\bribye\b|\bfilet mignon\b|\brib-eye\b|\bstrip steak\b/, 'entree'],
  [/\bsalmon\b|\btilapia\b|\bhaddock\b|\bcod\b|\bshrimp\b|\blobster\b|\bscallop\b|\bseafood\b|\bfish\b/, 'entree'],
  [/\bchicken\b/, 'entree'],
  [/\bsoup\b|\bchowder\b|\bbisque\b|\bstew\b/, 'entree'],
  [/\bwing\b|\bwings\b/, 'entree'],
  [/\bbreakfast\b|\begg\b|\bomelet\b|\bpancake\b|\bwaffle\b/, 'entree'],
  [/\brice\b|\bfried rice\b|\bbibimbap\b/, 'entree'],
  [/\bbbq\b|\bbarbecue\b|\bribs\b|\bbrisket\b/, 'entree'],
  [/\bpoke\b/, 'bowl'],
];

export function detectNormalizedCategory(
  name: string,
  description: string = '',
  rawCategory: string = '',
  restaurantName: string = ''
): string | undefined {
  const explicitText = `${name} ${description}`.toLowerCase();
  const text = `${name} ${description} ${rawCategory}`.toLowerCase();
  const restaurantText = restaurantName.toLowerCase();

  // Strong name-level signals should always win over source metadata.
  if (/\bsalads?\b(?!\s+sandw(?:ich|hich)\b)/i.test(name)) return 'salad';
  if (/\b(?:grain\s+|rice\s+|power\s+|protein\s+|signature\s+|curated\s+|acai\s+|pitaya\s+)?bowls?\b/i.test(name)) return 'bowl';
  if (/\b(?:smoothie|smoothies|juice|juices|shake|shakes)\b/i.test(name)) return 'smoothie';
  if (/\bwraps?\b/i.test(name)) return 'wrap';
  if (/\bsandw(?:ich|hich)(?:es)?\b|\bsubs?\b|\bhoagie\b|\bgrinder\b/i.test(name)) return 'sandwich';

  if (BREAKFAST_SANDWICH_REGEX.test(explicitText)) return 'breakfast_sandwich';
  if (/\bbreakfast burrito\b/.test(explicitText)) return 'burrito';
  if (SALAD_REGEX.test(explicitText)) return 'salad';
  if (BOWL_REGEX.test(explicitText)) return 'bowl';
  if (SMOOTHIE_REGEX.test(explicitText)) return 'smoothie';
  if (WRAP_REGEX.test(explicitText)) return 'wrap';
  if (SANDWICH_REGEX.test(explicitText)) return 'sandwich';
  if (BURRITO_REGEX.test(explicitText)) return 'burrito';
  if (TACO_REGEX.test(explicitText)) return 'tacos';

  if (BOWL_REGEX.test(rawCategory)) return 'bowl';
  if (SMOOTHIE_REGEX.test(rawCategory)) return 'smoothie';
  if (SALAD_REGEX.test(rawCategory)) return 'salad';
  if (WRAP_REGEX.test(rawCategory)) return 'wrap';
  if (SANDWICH_REGEX.test(rawCategory)) return 'sandwich';
  if (BURRITO_REGEX.test(rawCategory)) return 'burrito';
  if (TACO_REGEX.test(rawCategory)) return 'tacos';

  const isGenericEntree = !rawCategory || GENERIC_ENTREE_REGEX.test(rawCategory);
  const hasExplicitMealShape =
    BOWL_REGEX.test(text) ||
    WRAP_REGEX.test(text) ||
    SANDWICH_REGEX.test(text) ||
    BURRITO_REGEX.test(text) ||
    TACO_REGEX.test(text) ||
    /\bburger\b|\bpizza\b|\bpasta\b|\bsoup\b|\bsmoothie\b|\bjuice\b|\bshake\b/i.test(text);
  const isSaladForwardRestaurant = SALAD_FORWARD_RESTAURANTS.some((pattern) => pattern.test(restaurantText));

  if (isGenericEntree && isSaladForwardRestaurant && !hasExplicitMealShape) {
    return 'salad';
  }

  for (const [pattern, category] of CATEGORY_MAP) {
    if (pattern.test(text)) return category;
  }

  return undefined;
}
