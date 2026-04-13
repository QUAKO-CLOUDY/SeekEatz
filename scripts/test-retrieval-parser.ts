import { parseQuery, type ParsedQuery } from '../lib/retrieval/query-parser';

type Expectation = {
  mealType?: ParsedQuery['mealTypes'][number];
  category?: ParsedQuery['categories'][number];
  excludedCategory?: ParsedQuery['categories'][number];
  cuisine?: ParsedQuery['cuisineOrStyle'][number];
  excludedCuisine?: ParsedQuery['cuisineOrStyle'][number];
  minProtein?: number;
  maxCalories?: number;
  maxCarbs?: number;
};

const CASES: Array<{ query: string; expect?: Expectation }> = [
  { query: 'barbecue for dinner', expect: { mealType: 'dinner', cuisine: 'barbecue' } },
  { query: 'healthy breakfast sandwich', expect: { mealType: 'breakfast', category: 'breakfast_sandwich', excludedCuisine: 'american' } },
  { query: 'healthy breakfast sandwhich', expect: { mealType: 'breakfast', category: 'breakfast_sandwich', excludedCuisine: 'american' } },
  { query: 'high protien lunch under 700 calroies', expect: { mealType: 'lunch', minProtein: 30, maxCalories: 700 } },
  { query: 'mediteranean bowl with griled chicken', expect: { category: 'bowl', cuisine: 'mediterranean' } },
  { query: 'steak bowl at QDOBA Mexican Eats', expect: { category: 'bowl' } },
  { query: 'greek salad at CAVA', expect: { category: 'salad', cuisine: 'greek' } },
  { query: 'breakfast sandwich', expect: { mealType: 'breakfast', category: 'breakfast_sandwich', excludedCuisine: 'american' } },
  { query: 'high protein lunch under 700 calories', expect: { mealType: 'lunch', minProtein: 30, maxCalories: 700 } },
  { query: 'low carb from a Mexican place', expect: { cuisine: 'mexican', maxCarbs: 30 } },
  { query: 'show me a grilled chicken bowl' },
  { query: 'find me a light dinner under 600 calories' },
  { query: 'need a filling lunch with at least 40g protein' },
  { query: 'post workout meal with chicken' },
  { query: 'something spicy for dinner' },
  { query: 'fresh mediterranean bowl' },
  { query: 'smoky bbq plate' },
  { query: 'vegan breakfast' },
  { query: 'vegetarian burrito' },
  { query: 'gluten free lunch' },
  { query: 'keto dinner under 800 calories' },
  { query: 'fish tacos for lunch', expect: { mealType: 'lunch', category: 'tacos' } },
  { query: 'shrimp pasta under 900 calories' },
  { query: 'steak salad with high protein' },
  { query: 'turkey sandwich' },
  { query: 'egg breakfast wrap', expect: { mealType: 'breakfast', category: 'wrap' } },
  { query: 'tofu bowl' },
  { query: 'pork tacos for dinner' },
  { query: 'roasted chicken lunch' },
  { query: 'baked fish dinner' },
  { query: 'blackened shrimp bowl' },
  { query: 'healthy mexican dinner' },
  { query: 'comfort food lunch' },
  { query: 'sweet snack' },
  { query: 'savory breakfast' },
  { query: 'find dinner near me' },
  { query: 'breakfast near me under 500 calories' },
  { query: 'bbq smokehouse meal' },
  { query: 'smoked meats for dinner' },
  { query: 'show me a pizza under 1000 calories' },
  { query: 'burger with over 35g protein' },
  { query: 'low fat salad' },
  { query: 'pre workout snack' },
  { query: 'american dinner' },
  { query: 'greek lunch' },
  { query: 'italian pasta dinner' },
  { query: 'asian bowl with chicken' },
  { query: 'sushi for lunch', expect: { mealType: 'lunch', cuisine: 'asian', excludedCategory: 'entree' } },
  { query: 'thai dinner under 750 calories' },
  { query: 'southern barbecue lunch' },
  { query: 'breakfast burrito without cheese' },
  { query: 'sandwich without mayo' },
  { query: 'light mexican bowl with steak' },
  { query: 'find me dinner at CAVA' },
  { query: 'give me a healthy breakfast from First Watch' },
  { query: 'something hearty from chipotle' },
];

let failures = 0;

for (const testCase of CASES) {
  const parsed = parseQuery(testCase.query);
  const { expect } = testCase;

  if (expect?.mealType && !parsed.mealTypes.includes(expect.mealType)) {
    console.error(`FAIL mealType: "${testCase.query}" ->`, parsed.mealTypes);
    failures += 1;
  }

  if (expect?.category && !parsed.categories.includes(expect.category)) {
    console.error(`FAIL category: "${testCase.query}" ->`, parsed.categories);
    failures += 1;
  }

  if (expect?.excludedCategory && parsed.categories.includes(expect.excludedCategory)) {
    console.error(`FAIL excludedCategory: "${testCase.query}" ->`, parsed.categories);
    failures += 1;
  }

  if (expect?.cuisine && !parsed.cuisineOrStyle.includes(expect.cuisine)) {
    console.error(`FAIL cuisine: "${testCase.query}" ->`, parsed.cuisineOrStyle);
    failures += 1;
  }

  if (expect?.excludedCuisine && parsed.cuisineOrStyle.includes(expect.excludedCuisine)) {
    console.error(`FAIL excludedCuisine: "${testCase.query}" ->`, parsed.cuisineOrStyle);
    failures += 1;
  }

  if (expect?.minProtein !== undefined && (parsed.minProtein ?? 0) < expect.minProtein) {
    console.error(`FAIL minProtein: "${testCase.query}" ->`, parsed.minProtein);
    failures += 1;
  }

  if (expect?.maxCalories !== undefined && parsed.maxCalories !== expect.maxCalories) {
    console.error(`FAIL maxCalories: "${testCase.query}" ->`, parsed.maxCalories);
    failures += 1;
  }

  if (expect?.maxCarbs !== undefined && parsed.maxCarbs !== expect.maxCarbs) {
    console.error(`FAIL maxCarbs: "${testCase.query}" ->`, parsed.maxCarbs);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`Parser verification failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log(`Parser verification passed for ${CASES.length} queries.`);
