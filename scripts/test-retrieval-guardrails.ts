import { parseQuery } from '../lib/retrieval/query-parser';
import { applyRetrievalGuardrailsForTesting } from '../lib/retrieval/retrieval-engine';
import type { RawResult } from '../lib/retrieval/ranker';

type GuardrailCase = {
  name: string;
  query: string;
  items: RawResult[];
  expectedIds: Array<string | number>;
  unexpectedIds?: Array<string | number>;
};

const BASE_ITEM: Omit<RawResult, 'id' | 'name' | 'restaurant_name' | 'macros'> = {
  restaurant_id: 'restaurant-1',
  item_type: 'meal',
  confidence_score: 0.8,
};

const CASES: GuardrailCase[] = [
  {
    name: 'breakfast sandwich keeps breakfast and all_day, removes lunch and modifiers',
    query: 'breakfast sandwich',
    items: [
      {
        ...BASE_ITEM,
        id: 'breakfast-1',
        name: 'Egg White Grill',
        restaurant_name: 'Chick-fil-A',
        normalized_category: 'breakfast_sandwich',
        meal_type: 'breakfast',
        macros: { calories: 300, protein: 27, carbs: 30, fat: 7 },
      },
      {
        ...BASE_ITEM,
        id: 'all-day-1',
        name: 'All Day Egg Sandwich',
        restaurant_name: 'Cafe Example',
        normalized_category: 'breakfast_sandwich',
        meal_type: 'all_day',
        macros: { calories: 420, protein: 22, carbs: 33, fat: 14 },
      },
      {
        ...BASE_ITEM,
        id: 'lunch-1',
        name: 'Turkey Club Sandwich',
        restaurant_name: 'Lunch Spot',
        normalized_category: 'sandwich',
        meal_type: 'lunch',
        macros: { calories: 550, protein: 32, carbs: 40, fat: 18 },
      },
      {
        ...BASE_ITEM,
        id: 'modifier-1',
        name: 'Ultimate Bacon Jam Breakfast Sandwich',
        restaurant_name: 'Dunkin',
        normalized_category: 'breakfast_sandwich',
        meal_type: 'breakfast',
        item_type: 'modifier',
        macros: { calories: 640, protein: 25, carbs: 40, fat: 26 },
      },
    ],
    expectedIds: ['breakfast-1', 'all-day-1'],
    unexpectedIds: ['lunch-1', 'modifier-1'],
  },
  {
    name: 'healthy breakfast sandwich does not hard-require healthy tags',
    query: 'healthy breakfast sandwich',
    items: [
      {
        ...BASE_ITEM,
        id: 'healthy-breakfast-1',
        name: 'Egg White Grill',
        restaurant_name: 'Chick-fil-A',
        normalized_category: 'breakfast_sandwich',
        meal_type: 'breakfast',
        macros: { calories: 300, protein: 27, carbs: 30, fat: 7 },
      },
    ],
    expectedIds: ['healthy-breakfast-1'],
  },
  {
    name: 'dinner request excludes breakfast rows',
    query: 'barbecue for dinner',
    items: [
      {
        ...BASE_ITEM,
        id: 'bbq-dinner-1',
        name: 'Smoked Chicken Plate',
        restaurant_name: 'Smoke House',
        normalized_category: 'entree',
        meal_type: 'dinner',
        food_tags: ['barbecue', 'smoky'],
        description: 'smoky barbecue chicken dinner',
        macros: { calories: 680, protein: 45, carbs: 26, fat: 28 },
      },
      {
        ...BASE_ITEM,
        id: 'bbq-breakfast-1',
        name: 'Brisket Breakfast Sandwich',
        restaurant_name: 'Morning Smoke',
        normalized_category: 'breakfast_sandwich',
        meal_type: 'breakfast',
        description: 'barbecue brisket breakfast special',
        macros: { calories: 590, protein: 32, carbs: 38, fat: 24 },
      },
    ],
    expectedIds: ['bbq-dinner-1'],
    unexpectedIds: ['bbq-breakfast-1'],
  },
  {
    name: 'exclude terms remove matching items',
    query: 'sandwich without mayo',
    items: [
      {
        ...BASE_ITEM,
        id: 'sandwich-ok-1',
        name: 'Turkey Sandwich',
        restaurant_name: 'Deli One',
        normalized_category: 'sandwich',
        meal_type: 'lunch',
        description: 'turkey, lettuce, tomato',
        macros: { calories: 480, protein: 32, carbs: 42, fat: 16 },
      },
      {
        ...BASE_ITEM,
        id: 'sandwich-bad-1',
        name: 'Turkey Sandwich with Mayo',
        restaurant_name: 'Deli Two',
        normalized_category: 'sandwich',
        meal_type: 'lunch',
        description: 'turkey with mayo and tomato',
        macros: { calories: 520, protein: 31, carbs: 40, fat: 20 },
      },
    ],
    expectedIds: ['sandwich-ok-1'],
    unexpectedIds: ['sandwich-bad-1'],
  },
  {
    name: 'protein preference remains a hard retrieval guardrail',
    query: 'chicken bowl',
    items: [
      {
        ...BASE_ITEM,
        id: 'protein-ok-1',
        name: 'Grilled Chicken Bowl',
        restaurant_name: 'Protein House',
        normalized_category: 'bowl',
        meal_type: 'lunch',
        food_tags: ['chicken'],
        macros: { calories: 610, protein: 42, carbs: 44, fat: 18 },
      },
      {
        ...BASE_ITEM,
        id: 'protein-bad-1',
        name: 'Steak Bowl',
        restaurant_name: 'Protein House',
        normalized_category: 'bowl',
        meal_type: 'lunch',
        food_tags: ['beef'],
        macros: { calories: 640, protein: 39, carbs: 42, fat: 22 },
      },
    ],
    expectedIds: ['protein-ok-1'],
    unexpectedIds: ['protein-bad-1'],
  },
  {
    name: 'all_day items can satisfy dinner requests',
    query: 'dinner bowl',
    items: [
      {
        ...BASE_ITEM,
        id: 'all-day-dinner-1',
        name: 'Harvest Bowl',
        restaurant_name: 'Bowl Bar',
        normalized_category: 'bowl',
        meal_type: 'all_day',
        macros: { calories: 560, protein: 28, carbs: 52, fat: 18 },
      },
    ],
    expectedIds: ['all-day-dinner-1'],
  },
  {
    name: 'family style and catering items are excluded from discovery',
    query: 'high protein dinner',
    items: [
      {
        ...BASE_ITEM,
        id: 'single-meal-1',
        name: 'Grilled Chicken Plate',
        restaurant_name: 'Dinner House',
        normalized_category: 'entree',
        meal_type: 'dinner',
        macros: { calories: 720, protein: 48, carbs: 34, fat: 26 },
      },
      {
        ...BASE_ITEM,
        id: 'family-meal-1',
        name: 'Family Size Chicken Alfredo',
        restaurant_name: 'Pasta House',
        normalized_category: 'pasta',
        meal_type: 'dinner',
        food_tags: ['multi_serving'],
        macros: { calories: 2400, protein: 110, carbs: 180, fat: 120 },
      },
      {
        ...BASE_ITEM,
        id: 'catering-1',
        name: 'Catering Chicken Bundle',
        restaurant_name: 'Pasta House',
        normalized_category: 'entree',
        meal_type: 'dinner',
        food_tags: ['catering'],
        macros: { calories: 3200, protein: 150, carbs: 210, fat: 170 },
      },
    ],
    expectedIds: ['single-meal-1'],
    unexpectedIds: ['family-meal-1', 'catering-1'],
  },
];

let failures = 0;

for (const testCase of CASES) {
  const parsed = parseQuery(testCase.query);
  const result = applyRetrievalGuardrailsForTesting(testCase.items, parsed);
  const resultIds = new Set(result.map((item) => item.id));

  for (const expectedId of testCase.expectedIds) {
    if (!resultIds.has(expectedId)) {
      console.error(`FAIL ${testCase.name}: missing expected id "${expectedId}"`, result.map((item) => item.id));
      failures += 1;
    }
  }

  for (const unexpectedId of testCase.unexpectedIds ?? []) {
    if (resultIds.has(unexpectedId)) {
      console.error(`FAIL ${testCase.name}: found unexpected id "${unexpectedId}"`, result.map((item) => item.id));
      failures += 1;
    }
  }
}

if (failures > 0) {
  console.error(`Retrieval guardrail verification failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log(`Retrieval guardrail verification passed for ${CASES.length} scenarios.`);
