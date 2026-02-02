/**
 * Shared helper for classifying menu items as dishes vs modifiers
 * Used by /api/search and swap endpoints to ensure consistency
 */

export interface MenuItemClassification {
  isDish: boolean;
  isModifier: boolean;
}

/**
 * Classifies a menu item row as a dish or modifier
 * Strict default: if not confidently a dish, treat as modifier (do not show in search results)
 */
export function classifyMenuItem(row: any): MenuItemClassification {
  const category = (row.category || '').toLowerCase().trim();
  const name = (row.name || '').toLowerCase().trim();

  // 1. DISH ALLOWLIST by category keywords (case-insensitive)
  const dishCategoryKeywords = [
    'entree', 'entrée', 'bowl', 'plate', 'salad', 'wrap', 'sandwich', 
    'burger', 'taco', 'burrito', 'pizza', 'pasta', 'meal', 'combo', 
    'platter', 'breakfast', 'lunch', 'dinner', 'roll', 'sushi', 
    'ramen', 'pho', 'curry', 'skillet', 'omelet', 'omelette'
  ];

  const isDishByCategory = dishCategoryKeywords.some(keyword => 
    category.includes(keyword)
  );

  // 2. MODIFIER DENYLIST by category keywords
  const modifierCategoryKeywords = [
    'sauce', 'dressing', 'topping', 'condiment', 'side', 'addon', 
    'add-on', 'extra', 'modifier', 'ingredient', 'mix-in', 'beverage', 
    'drink', 'kids', 'base', 'grain', 'veggies', 'vegetables'
  ];

  // Special case: "protein" category is modifier when it's an add-on
  const isModifierByCategory = modifierCategoryKeywords.some(keyword => 
    category.includes(keyword)
  ) || (category.includes('protein') && (
    name.includes('add') || name.includes('extra') || name.includes('double') || 
    name.includes('scoop') || name.includes('+')
  ));

  // 3. MODIFIER DENYLIST by name patterns
  const modifierNamePatterns = [
    /^add\s+/i,           // starts with "add "
    /^extra\s+/i,         // starts with "extra "
    /^double\s+/i,        // starts with "double "
    /^side\s+of/i,        // starts with "side of"
    /^cup\s+of/i,         // starts with "cup of"
    /sauce/i,             // contains "sauce"
    /dressing/i,          // contains "dressing"
    /topping/i,           // contains "topping"
    /protein\s+scoop/i,    // contains "protein scoop"
    /\s*\+\s*/,           // contains "+"
  ];

  const isModifierByName = modifierNamePatterns.some(pattern => 
    pattern.test(name)
  );

  // 4. Classification logic
  // If explicitly a modifier by category or name, it's a modifier
  if (isModifierByCategory || isModifierByName) {
    return { isDish: false, isModifier: true };
  }

  // If explicitly a dish by category, it's a dish
  if (isDishByCategory) {
    return { isDish: true, isModifier: false };
  }

  // STRICT DEFAULT: if not confidently a dish, treat as modifier
  // This ensures we don't show ingredients/modifiers in search results
  return { isDish: false, isModifier: true };
}

