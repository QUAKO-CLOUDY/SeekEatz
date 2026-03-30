export const SEARCH_INTENTS = ['meal_search'] as const;

export const CATEGORY_ENUM = [
  'burger',
  'wrap',
  'sandwich',
  'bowl',
  'salad',
  'pizza',
  'smoothie',
  'breakfast_sandwich',
  'burrito',
  'tacos',
  'pasta',
  'entree',
] as const;

export const MEAL_TYPE_ENUM = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'dessert',
  'drink',
  'brunch',
  'all_day',
] as const;

export const CUISINE_STYLE_ENUM = [
  'mexican',
  'italian',
  'american',
  'mediterranean',
  'barbecue',
  'asian',
  'sushi',
  'greek',
  'healthy',
  'southern',
  'seafood',
] as const;

export const PROTEIN_SOURCE_ENUM = [
  'chicken',
  'steak',
  'beef',
  'turkey',
  'tofu',
  'fish',
  'shrimp',
  'pork',
  'egg',
] as const;

export const DIET_FLAG_ENUM = [
  'high_protein',
  'low_carb',
  'low_fat',
  'keto',
  'vegetarian',
  'vegan',
  'pescatarian',
  'gluten_aware',
] as const;

export const CRAVING_TAG_ENUM = [
  'hearty',
  'light',
  'comfort_food',
  'fresh',
  'grilled',
  'smoky',
  'spicy',
  'sweet',
  'savory',
  'healthy',
  'filling',
  'post_workout',
  'pre_workout',
] as const;

export const COOKING_METHOD_ENUM = [
  'grilled',
  'fried',
  'baked',
  'smoked',
  'roasted',
  'blackened',
] as const;

export const SORT_PRIORITY_ENUM = [
  'protein_density',
  'calorie_match',
  'lowest_calories',
  'highest_protein',
  'closest_macros',
  'meal_type_match',
  'category_match',
  'cuisine_match',
] as const;

export const ALIAS_GROUPS: Record<string, string[]> = {
  barbecue: ['barbecue', 'bbq', 'smokehouse', 'smoked meats', 'smoked', 'pit bbq'],
  tacos: ['taco', 'tacos'],
  sushi: ['sushi', 'asian'],
  breakfast_sandwich: ['breakfast sandwich', 'breakfast sandwhich', 'egg sandwich', 'egg sandwhich', 'biscuit sandwich', 'biscuit sandwhich', 'bagel sandwich', 'bagel sandwhich'],
  bowl: ['bowl', 'power bowl', 'grain bowl', 'protein bowl'],
  healthy: ['healthy', 'clean', 'nutritious', 'lighter'],
  filling: ['filling', 'hearty', 'satisfying'],
  light: ['light', 'lighter', 'lean'],
  post_workout: ['post workout', 'post-workout', 'after workout', 'gym meal'],
  pre_workout: ['pre workout', 'pre-workout', 'before workout'],
};

export const ONTOLOGY_TAGS = {
  categories: CATEGORY_ENUM,
  mealTypes: MEAL_TYPE_ENUM,
  cuisines: CUISINE_STYLE_ENUM,
  proteins: PROTEIN_SOURCE_ENUM,
  dietFlags: DIET_FLAG_ENUM,
  cravingTags: CRAVING_TAG_ENUM,
  cookingMethods: COOKING_METHOD_ENUM,
  sortPriorities: SORT_PRIORITY_ENUM,
};

export function expandAliasTerm(term: string): string[] {
  const normalized = term.toLowerCase().trim().replace(/\s+/g, '_');
  for (const [canonical, values] of Object.entries(ALIAS_GROUPS)) {
    if (canonical === normalized || values.includes(term.toLowerCase().trim())) {
      return [canonical, ...values];
    }
  }
  return [term.toLowerCase().trim()];
}
