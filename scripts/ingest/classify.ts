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
  'morning', 'brunch', 'avocado toast', 'granola bowl',
];

const LUNCH_KEYWORDS = ['lunch', 'midday'];

const DINNER_KEYWORDS = [
  'dinner', 'entree', 'entrée', 'steak', 'prime rib', 'filet', 'lobster',
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

const CATEGORY_MAP: Array<[RegExp, string]> = [
  [BREAKFAST_SANDWICH_REGEX, 'breakfast_sandwich'],
  [/\bbreakfast burrito\b/, 'burrito'],
  [/\burger\b|\bcheeseburger\b|\bpatty\b/, 'burger'],
  [/\bpizza\b|\bflatbread\b|\bcalzone\b|\bstromboli\b/, 'pizza'],
  [/\bsalad.*bowl\b|\bbowl.*salad\b|\bgrain bowl\b/, 'bowl'],
  [/\bsalad\b/, 'salad'],
  [/\bburrito\b/, 'burrito'],
  [/\btaco\b|\btacos\b/, 'tacos'],
  [/\bquesadilla\b|\bfajita\b|\bnachos\b/, 'entree'],
  [/\bbowl\b.*mexican|\bmexican.*bowl\b/, 'bowl'],
  [/\bwrap\b/, 'wrap'],
  [/\bsandw(?:ich|hich)\b|\bsub\b|\bhoagie\b|\bgrinder\b/, 'sandwich'],
  [/\bpasta\b|\bspaghetti\b|\bpenne\b|\bfettuccine\b|\blasagna\b|\bravioli\b/, 'pasta'],
  [/\bsushi\b|\broll\b.*japanese|\bsashimi\b|\bmaki\b/, 'entree'],
  [/\bsteak\b|\bsirloin\b|\bribye\b|\bfilet mignon\b|\brib-eye\b|\bstrip steak\b/, 'entree'],
  [/\bsalmon\b|\btilapia\b|\bhaddock\b|\bcod\b|\bshrimp\b|\blobster\b|\bscallop\b|\bseafood\b|\bfish\b/, 'entree'],
  [/\bchicken\b/, 'entree'],
  [/\bsoup\b|\bchowder\b|\bbisque\b|\bstew\b/, 'entree'],
  [/\bwing\b|\bwings\b/, 'entree'],
  [/\bbreakfast\b|\begg\b|\bomelet\b|\bpancake\b|\bwaffle\b/, 'entree'],
  [/\bbowl\b/, 'bowl'],
  [/\bsmoothie\b|\bjuice\b|\bshake\b/, 'smoothie'],
  [/\brice\b|\bfried rice\b|\bbibimbap\b/, 'entree'],
  [/\bbbq\b|\bbarbecue\b|\bribs\b|\bbrisket\b/, 'entree'],
  [/\bpoke\b/, 'bowl'],
];

export function detectNormalizedCategory(
  name: string,
  description: string = '',
  rawCategory: string = ''
): string | undefined {
  const text = `${name} ${description} ${rawCategory}`.toLowerCase();

  for (const [pattern, category] of CATEGORY_MAP) {
    if (pattern.test(text)) return category;
  }

  return undefined;
}
