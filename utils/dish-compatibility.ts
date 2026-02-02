/**
 * Dish Compatibility Utility
 * Determines dish types and ingredient compatibility to prevent weird swaps
 * (e.g., "add shrimp" to a burger)
 */

export type DishType = 
  | 'burger' 
  | 'sub' 
  | 'salad' 
  | 'bowl' 
  | 'taco' 
  | 'pizza' 
  | 'wrap' 
  | 'pasta' 
  | 'breakfast' 
  | 'generic';

export type IngredientType =
  | 'patty'
  | 'bacon'
  | 'cheese'
  | 'egg'
  | 'chicken'
  | 'steak'
  | 'shrimp'
  | 'tofu'
  | 'ham'
  | 'turkey'
  | 'pork'
  | 'beef'
  | 'sauce'
  | 'bun'
  | 'lettuce_wrap'
  | 'tortilla'
  | 'bread'
  | 'rice'
  | 'beans'
  | 'vegetable'
  | 'unknown';

/**
 * Infers dish type from meal name using keyword rules
 */
export function inferDishType(mealName: string): DishType {
  if (!mealName || typeof mealName !== 'string') {
    return 'generic';
  }

  const lowerName = mealName.toLowerCase();

  // burger: burger, cheeseburger, hamburger, slider
  if (/\b(burger|cheeseburger|hamburger|slider|whopper|big mac)\b/i.test(lowerName)) {
    return 'burger';
  }

  // sub: sub, sandwich, hoagie, hero, grinder
  if (/\b(sub|sandwich|hoagie|hero|grinder|heroes)\b/i.test(lowerName)) {
    return 'sub';
  }

  // salad: salad
  if (/\b(salad|caesar|cobb|garden salad)\b/i.test(lowerName)) {
    return 'salad';
  }

  // bowl: bowl
  if (/\b(bowl|bowls)\b/i.test(lowerName)) {
    return 'bowl';
  }

  // taco: taco, burrito, quesadilla
  if (/\b(taco|tacos|burrito|burritos|quesadilla|quesadillas)\b/i.test(lowerName)) {
    return 'taco';
  }

  // pizza: pizza
  if (/\b(pizza|pizzas|pie|pies)\b/i.test(lowerName)) {
    return 'pizza';
  }

  // wrap: wrap
  if (/\b(wrap|wraps)\b/i.test(lowerName)) {
    return 'wrap';
  }

  // pasta: pasta, spaghetti, noodles
  if (/\b(pasta|pastas|spaghetti|noodles|noodle)\b/i.test(lowerName)) {
    return 'pasta';
  }

  // breakfast: breakfast, pancake, waffle, omelet
  if (/\b(breakfast|pancake|pancakes|waffle|waffles|omelet|omelette|scrambled eggs)\b/i.test(lowerName)) {
    return 'breakfast';
  }

  return 'generic';
}

/**
 * Infers ingredient type from ingredient name using keyword rules
 * Returns type and confidence (0-1)
 */
export function inferIngredientType(name: string): { type: IngredientType; confidence: number } {
  if (!name || typeof name !== 'string') {
    return { type: 'unknown', confidence: 0 };
  }

  const lowerName = name.toLowerCase();

  // patty: patty, beef patty, burger patty
  if (/\b(patty|patties|beef patty|burger patty)\b/i.test(lowerName)) {
    return { type: 'patty', confidence: 0.9 };
  }

  // bacon: bacon
  if (/\b(bacon)\b/i.test(lowerName)) {
    return { type: 'bacon', confidence: 0.95 };
  }

  // cheese: cheese, cheddar, swiss, etc.
  if (/\b(cheese|cheddar|swiss|mozzarella|provolone|american cheese)\b/i.test(lowerName)) {
    return { type: 'cheese', confidence: 0.9 };
  }

  // egg: egg, eggs
  if (/\b(egg|eggs|fried egg)\b/i.test(lowerName)) {
    return { type: 'egg', confidence: 0.9 };
  }

  // chicken: chicken, grilled chicken, chicken breast
  if (/\b(chicken|grilled chicken|chicken breast|chicken thigh)\b/i.test(lowerName)) {
    return { type: 'chicken', confidence: 0.9 };
  }

  // steak: steak, beef steak, sirloin
  if (/\b(steak|beef steak|sirloin|ribeye)\b/i.test(lowerName)) {
    return { type: 'steak', confidence: 0.9 };
  }

  // shrimp: shrimp, prawns
  if (/\b(shrimp|prawns|shrimps)\b/i.test(lowerName)) {
    return { type: 'shrimp', confidence: 0.95 };
  }

  // tofu: tofu
  if (/\b(tofu)\b/i.test(lowerName)) {
    return { type: 'tofu', confidence: 0.9 };
  }

  // ham: ham
  if (/\b(ham)\b/i.test(lowerName)) {
    return { type: 'ham', confidence: 0.9 };
  }

  // turkey: turkey, turkey breast
  if (/\b(turkey|turkey breast)\b/i.test(lowerName)) {
    return { type: 'turkey', confidence: 0.9 };
  }

  // pork: pork, pulled pork
  if (/\b(pork|pulled pork)\b/i.test(lowerName)) {
    return { type: 'pork', confidence: 0.9 };
  }

  // beef: beef (but not patty, which is already matched)
  if (/\b(beef)\b/i.test(lowerName) && !/\b(patty)\b/i.test(lowerName)) {
    return { type: 'beef', confidence: 0.7 };
  }

  // sauce: sauce, mayo, mustard, ketchup, ranch, etc.
  if (/\b(sauce|mayo|mustard|ketchup|ranch|bbq|barbecue|aioli|dressing)\b/i.test(lowerName)) {
    return { type: 'sauce', confidence: 0.8 };
  }

  // bun: bun, bread, roll
  if (/\b(bun|bread|roll|brioche bun|sesame bun)\b/i.test(lowerName)) {
    return { type: 'bun', confidence: 0.9 };
  }

  // lettuce_wrap: lettuce wrap, lettuce
  if (/\b(lettuce wrap|lettuce|wrap lettuce|greens wrap)\b/i.test(lowerName)) {
    return { type: 'lettuce_wrap', confidence: 0.9 };
  }

  // tortilla: tortilla, flour tortilla
  if (/\b(tortilla|flour tortilla|corn tortilla)\b/i.test(lowerName)) {
    return { type: 'tortilla', confidence: 0.9 };
  }

  // bread: bread (but not bun, which is already matched)
  if (/\b(bread)\b/i.test(lowerName) && !/\b(bun|roll)\b/i.test(lowerName)) {
    return { type: 'bread', confidence: 0.7 };
  }

  // rice: rice, white rice, brown rice
  if (/\b(rice|white rice|brown rice)\b/i.test(lowerName)) {
    return { type: 'rice', confidence: 0.9 };
  }

  // beans: beans, black beans, pinto beans
  if (/\b(beans|black beans|pinto beans|refried beans)\b/i.test(lowerName)) {
    return { type: 'beans', confidence: 0.9 };
  }

  // vegetable: vegetable, lettuce, tomato, onion, etc. (generic)
  if (/\b(vegetable|lettuce|tomato|onion|pepper|peppers|spinach|arugula)\b/i.test(lowerName)) {
    return { type: 'vegetable', confidence: 0.6 };
  }

  return { type: 'unknown', confidence: 0 };
}

/**
 * Compatibility matrix: which ingredient types are allowed for each dish type
 */
export const COMPATIBILITY_MATRIX: Record<DishType, Set<IngredientType>> = {
  burger: new Set([
    'patty',
    'bacon',
    'cheese',
    'egg',
    'sauce',
    'bun',
    'lettuce_wrap',
    'vegetable',
  ]),
  sub: new Set([
    'turkey',
    'ham',
    'chicken',
    'steak',
    'bacon',
    'cheese',
    'sauce',
    'bread',
    'lettuce_wrap',
    'vegetable',
  ]),
  salad: new Set([
    'chicken',
    'steak',
    'shrimp',
    'tofu',
    'egg',
    'cheese',
    'turkey',
    'ham',
    'sauce',
    'vegetable',
  ]),
  bowl: new Set([
    'chicken',
    'steak',
    'shrimp',
    'tofu',
    'turkey',
    'pork',
    'beef',
    'rice',
    'beans',
    'cheese',
    'sauce',
    'vegetable',
  ]),
  taco: new Set([
    'chicken',
    'steak',
    'pork',
    'beef',
    'shrimp',
    'tofu',
    'beans',
    'cheese',
    'sauce',
    'tortilla',
    'lettuce_wrap',
    'vegetable',
  ]),
  pizza: new Set([
    'cheese',
    'bacon',
    'chicken',
    'ham',
    'sauce',
    'vegetable',
  ]),
  wrap: new Set([
    'chicken',
    'turkey',
    'ham',
    'steak',
    'cheese',
    'sauce',
    'tortilla',
    'lettuce_wrap',
    'vegetable',
  ]),
  pasta: new Set([
    'chicken',
    'steak',
    'shrimp',
    'sauce',
    'cheese',
    'vegetable',
  ]),
  breakfast: new Set([
    'egg',
    'bacon',
    'ham',
    'cheese',
    'sauce',
    'bread',
    'vegetable',
  ]),
  generic: new Set([
    // Conservative: only allow very common add-ons
    'cheese',
    'sauce',
    'vegetable',
  ]),
};

/**
 * Checks if an ingredient type is compatible with a dish type
 */
export function isCompatible(dishType: DishType, ingredientType: IngredientType): boolean {
  const allowedTypes = COMPATIBILITY_MATRIX[dishType];
  if (!allowedTypes) {
    return false;
  }
  return allowedTypes.has(ingredientType);
}

/**
 * Extracts protein keywords from text (for token overlap check)
 */
export function extractProteinKeywords(text: string): Set<string> {
  if (!text || typeof text !== 'string') {
    return new Set();
  }

  const lowerText = text.toLowerCase();
  const proteinKeywords = ['beef', 'chicken', 'turkey', 'steak', 'ham', 'pork', 'shrimp', 'tofu', 'patty'];
  const found = new Set<string>();

  for (const keyword of proteinKeywords) {
    if (lowerText.includes(keyword)) {
      found.add(keyword);
    }
  }

  return found;
}

/**
 * Checks token overlap between meal name and modifier name (protein keywords)
 * Returns true if at least one protein keyword overlaps
 */
export function hasProteinTokenOverlap(mealName: string, modifierName: string): boolean {
  const mealProteins = extractProteinKeywords(mealName);
  const modifierProteins = extractProteinKeywords(modifierName);

  // Check for overlap
  for (const protein of mealProteins) {
    if (modifierProteins.has(protein)) {
      return true;
    }
  }

  return false;
}



