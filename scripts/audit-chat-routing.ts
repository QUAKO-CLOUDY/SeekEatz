type ChatAuditCase = {
  query: string;
  expectedRestaurant?: string;
  maxCalories?: number;
  minProtein?: number;
  expectDiverseRestaurants?: boolean;
  expectLLMRouter?: boolean;
};

type ChatMeal = {
  name?: string;
  restaurant?: string;
  restaurant_name?: string;
  calories?: number;
  protein?: number;
  macros?: {
    calories?: number;
    protein?: number;
    fat?: number;
  };
};

type ChatResponse = {
  mode?: string;
  meals?: ChatMeal[];
  answer?: string;
  message?: string;
  usageLimit?: boolean;
};

const CHAT_URL = process.env.CHAT_AUDIT_URL ?? 'http://localhost:3000/api/chat';
const DEFAULT_LIMIT = 5;
const AUDIT_IP_PREFIX =
  process.env.CHAT_AUDIT_IP_PREFIX ??
  `10.${Math.floor(Math.random() * 200) + 20}.${Math.floor(Math.random() * 200) + 20}`;

const CASES: ChatAuditCase[] = [
  { query: 'dominos', expectedRestaurant: "Domino's Pizza" },
  { query: 'dominos under 900 calories', expectedRestaurant: "Domino's Pizza", maxCalories: 900 },
  { query: 'pizza', expectDiverseRestaurants: true },
  { query: 'salad', expectDiverseRestaurants: true },
  { query: 'smoothies', expectDiverseRestaurants: true },
  { query: 'vegan meals', expectDiverseRestaurants: true },
  { query: 'vegetarian meals', expectDiverseRestaurants: true },
  { query: 'high protein under 600 calories', maxCalories: 600, minProtein: 30, expectDiverseRestaurants: true },
  { query: 'chopt creative salad', expectedRestaurant: 'Chopt Creative Salad Co.' },
  { query: 'qdoba under 700 calories', expectedRestaurant: 'QDOBA Mexican Eats', maxCalories: 700 },
  { query: 'cheba hut', expectedRestaurant: 'Cheba Hut' },
  { query: 'tropical smoothie cafe', expectedRestaurant: 'Tropical Smoothie Cafe' },
  { query: 'protein house high protein under 700 calories', expectedRestaurant: 'Proteinhouse', maxCalories: 700, minProtein: 30 },
  { query: 'In N Out under 700 calories', expectedRestaurant: 'In-N-Out Burger', maxCalories: 700 },
  { query: 'mexican', expectDiverseRestaurants: true },
  { query: 'asian under 700 calories', maxCalories: 700, expectDiverseRestaurants: true },
  { query: 'pasta', expectDiverseRestaurants: true },
  { query: 'burger king under 600 calories', expectedRestaurant: 'Burger King', maxCalories: 600 },
  { query: 'tazikis under 700 calories', expectedRestaurant: "Taziki's Mediterranean Cafe", maxCalories: 700 },
  { query: 'waba grill high protein under 700 calories', expectedRestaurant: 'WaBa Grill', maxCalories: 700, minProtein: 30 },
];

function normalizeName(value: string | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/['.,-]/g, '')
    .replace(/\b(co|company|restaurant|grill|cafe|bar|kitchen|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function restaurantName(meal: ChatMeal): string {
  return meal.restaurant ?? meal.restaurant_name ?? '';
}

function macroValue(meal: ChatMeal, key: 'calories' | 'protein'): number {
  return Number(meal[key] ?? meal.macros?.[key] ?? 0);
}

function validate(testCase: ChatAuditCase, payload: ChatResponse, usedLLMRouter: boolean): string[] {
  const failures: string[] = [];
  const meals = payload.meals ?? [];

  if (payload.mode !== 'meals') {
    failures.push(`expected mode=meals, got ${payload.mode ?? 'missing'}`);
    return failures;
  }

  if (meals.length === 0) {
    failures.push('expected at least 1 meal card');
    return failures;
  }

  if (usedLLMRouter !== (testCase.expectLLMRouter ?? false)) {
    failures.push(`expected LLM router=${testCase.expectLLMRouter ?? false}, got ${usedLLMRouter}`);
  }

  if (testCase.expectedRestaurant) {
    const expected = normalizeName(testCase.expectedRestaurant);
    const wrongRestaurants = meals
      .map(restaurantName)
      .filter((restaurant) => normalizeName(restaurant) !== expected);

    if (wrongRestaurants.length) {
      failures.push(`expected only ${testCase.expectedRestaurant}, got ${Array.from(new Set(wrongRestaurants)).join(', ')}`);
    }
  }

  if (testCase.maxCalories !== undefined) {
    const violations = meals.filter((meal) => macroValue(meal, 'calories') > testCase.maxCalories!);
    if (violations.length) {
      failures.push(
        `calorie cap ${testCase.maxCalories} violated by ${violations
          .slice(0, 3)
          .map((meal) => `${meal.name ?? 'Unknown'} (${macroValue(meal, 'calories')})`)
          .join(', ')}`
      );
    }
  }

  if (testCase.minProtein !== undefined) {
    const violations = meals.filter((meal) => macroValue(meal, 'protein') < testCase.minProtein!);
    if (violations.length) {
      failures.push(
        `protein floor ${testCase.minProtein} violated by ${violations
          .slice(0, 3)
          .map((meal) => `${meal.name ?? 'Unknown'} (${macroValue(meal, 'protein')})`)
          .join(', ')}`
      );
    }
  }

  if (testCase.expectDiverseRestaurants && meals.length > 1) {
    const uniqueRestaurants = new Set(meals.map((meal) => normalizeName(restaurantName(meal))).filter(Boolean));
    if (uniqueRestaurants.size < Math.min(meals.length, DEFAULT_LIMIT, 4)) {
      failures.push(`expected broad restaurant variety, got ${uniqueRestaurants.size}/${meals.length} unique restaurants`);
    }
  }

  return failures;
}

async function main() {
  const failures: string[] = [];
  let llmRouterCount = 0;
  let mealCardCount = 0;

  for (const [index, testCase] of CASES.entries()) {
    const response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': `${AUDIT_IP_PREFIX}.${index + 1}`,
      },
      body: JSON.stringify({ message: testCase.query, debug: true }),
    });

    const usedLLMRouter = response.headers.get('x-used-llm-router') === 'true';
    const routerMode = response.headers.get('x-router-mode') ?? 'missing';
    const heuristicMode = response.headers.get('x-heuristic-mode') ?? 'missing';
    if (usedLLMRouter) {
      llmRouterCount += 1;
    }

    const text = await response.text();
    let payload: ChatResponse;
    try {
      payload = JSON.parse(text) as ChatResponse;
    } catch {
      failures.push(`QUERY "${testCase.query}" | invalid JSON response: ${text.slice(0, 180)}`);
      continue;
    }

    mealCardCount += payload.meals?.length ?? 0;

    if (!response.ok) {
      failures.push(`QUERY "${testCase.query}" | HTTP ${response.status} | ${payload.message ?? payload.answer ?? text.slice(0, 180)}`);
      continue;
    }

    const caseFailures = validate(testCase, payload, usedLLMRouter);
    if (caseFailures.length > 0) {
      failures.push(
        [
          `QUERY "${testCase.query}"`,
          `router=${usedLLMRouter}`,
          `routerMode=${routerMode}`,
          `heuristic=${heuristicMode}`,
          `mode=${payload.mode ?? 'missing'}`,
          `returned=${payload.meals?.length ?? 0}`,
          `restaurants=${Array.from(new Set((payload.meals ?? []).map(restaurantName))).join(', ') || 'none'}`,
          `failures=${caseFailures.join('; ')}`,
        ].join(' | ')
      );
    }
  }

  console.log(`Chat queries audited: ${CASES.length}`);
  console.log(`Meal cards returned: ${mealCardCount}`);
  console.log(`LLM router calls: ${llmRouterCount}`);
  console.log(`Failures: ${failures.length}`);

  for (const failure of failures) {
    console.log(`FAIL ${failure}`);
  }

  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[audit-chat-routing] fatal error:', error);
  process.exit(1);
});
