/**
 * Test Harness for Search Handler
 * 
 * This script tests the searchHandler function with a fixed list of test queries.
 * It validates dishType detection, result counts, and ensures dishType filtering works correctly.
 * 
 * HOW TO RUN LOCALLY:
 * 
 * 1. Ensure you have a .env.local file with:
 *    - NEXT_PUBLIC_SUPABASE_URL
 *    - SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)
 * 
 * 2. Install dependencies if needed:
 *    npm install
 * 
 * 3. Run the script:
 *    npx tsx scripts/test-search.ts
 * 
 * NOTE: This script uses queries that trigger DB query path (with dishType/restaurant)
 * to avoid requiring OpenAI API calls for vector search.
 * 
 * IMPORTANT: This script may encounter issues with Next.js server-side dependencies.
 * If you get errors about 'cookies' or Next.js modules, you may need to:
 * - Run this as a Next.js API route test instead, OR
 * - Create a test-specific version of searchHandler that uses direct Supabase client
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  process.exit(1);
}

// Create Supabase client for testing
const testSupabase = createSupabaseClient(supabaseUrl, supabaseKey);

// Dish taxonomy for validation (must match handler)
const DISH_TAXONOMY: Record<string, { keywords: string[] }> = {
  burgers: {
    keywords: ['burger', 'burgers', 'whopper', 'big mac', 'cheeseburger', 'hamburger']
  },
  sandwiches: {
    keywords: ['sandwich', 'sandwiches', 'sandwhich', 'sandwiche', 'sub', 'subs', 'hoagie', 'hoagies', 'hero', 'heroes']
  },
  bowls: {
    keywords: ['bowl', 'bowls']
  },
  salads: {
    keywords: ['salad', 'salads']
  },
  wraps: {
    keywords: ['wrap', 'wraps']
  },
  tacos: {
    keywords: ['taco', 'tacos']
  },
  burritos: {
    keywords: ['burrito', 'burritos']
  },
  pizza: {
    keywords: ['pizza', 'pizzas']
  },
  sushi: {
    keywords: ['sushi', 'roll', 'rolls']
  },
  breakfast: {
    keywords: ['breakfast', 'pancake', 'pancakes', 'waffle', 'waffles', 'omelet', 'omelette', 'eggs', 'bacon', 'sausage']
  }
};

/**
 * Extracts dish type from query (same logic as handler)
 */
function extractDishType(query: string): string | null {
  if (!query || typeof query !== 'string') return null;
  
  const lowerQuery = query.toLowerCase().trim();
  
  for (const [dishType, { keywords }] of Object.entries(DISH_TAXONOMY)) {
    for (const keyword of keywords) {
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
      if (pattern.test(lowerQuery)) {
        return dishType;
      }
    }
  }
  
  return null;
}

/**
 * Validates that all returned items match the dishType keywords
 */
function validateDishTypeFiltering(meals: any[], dishType: string | null): { valid: boolean; errors: string[] } {
  if (!dishType || !DISH_TAXONOMY[dishType]) {
    return { valid: true, errors: [] };
  }

  const { keywords } = DISH_TAXONOMY[dishType];
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  const errors: string[] = [];

  for (const meal of meals) {
    const itemName = (meal.name || meal.item_name || '').toLowerCase();
    
    // Check if name matches any keyword (word boundary to avoid partial matches)
    const nameMatches = lowerKeywords.some(keyword => {
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
      return pattern.test(itemName);
    });
    
    if (!nameMatches) {
      errors.push(`Item "${meal.name}" from "${meal.restaurant || meal.restaurant_name}" does not match ${dishType} keywords (${keywords.join(', ')})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Test a single query
 */
async function testQuery(query: string, expectedDishType?: string | null) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📝 Query: "${query}"`);
  
  try {
    // Try to import searchHandler
    // Note: This may fail due to Next.js server-side dependencies
    // If it does, the error will be caught and reported
    const searchHandlerModule = await import('../app/api/search/handler');
    const { searchHandler } = searchHandlerModule;
    
    const result = await searchHandler({
      query,
      limit: 5,
      offset: 0,
      searchKey: undefined,
      isPagination: false,
    });

    const detectedDishType = extractDishType(query);
    const returnedCount = result.meals?.length || 0;
    
    console.log(`🔍 DishType detected: ${detectedDishType || '(none)'}`);
    console.log(`📊 Number returned: ${returnedCount}`);
    
    if (returnedCount > 0) {
      console.log(`\n📋 First ${Math.min(5, returnedCount)} items:`);
      result.meals.slice(0, 5).forEach((meal: any, index: number) => {
        const name = meal.name || meal.item_name || 'Unknown';
        const restaurant = meal.restaurant || meal.restaurant_name || 'Unknown';
        console.log(`   ${index + 1}. ${name} (${restaurant})`);
      });
    } else {
      console.log(`   (No results)`);
    }

    // Validate dishType filtering if dishType was detected
    if (detectedDishType && returnedCount > 0) {
      const validation = validateDishTypeFiltering(result.meals, detectedDishType);
      if (!validation.valid) {
        console.error(`\n❌ VALIDATION FAILED: DishType filtering error`);
        validation.errors.forEach(error => console.error(`   - ${error}`));
        return false;
      } else {
        console.log(`\n✅ VALIDATION PASSED: All items match ${detectedDishType} keywords`);
      }
    }

    // Check expected dishType if provided
    if (expectedDishType !== undefined) {
      if (detectedDishType !== expectedDishType) {
        console.error(`\n❌ VALIDATION FAILED: Expected dishType "${expectedDishType}", got "${detectedDishType}"`);
        return false;
      } else {
        console.log(`\n✅ VALIDATION PASSED: DishType matches expected "${expectedDishType}"`);
      }
    }

    return true;
  } catch (error) {
    console.error(`\n❌ ERROR:`, error);
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`);
      if (error.message.includes('cookies') || error.message.includes('Next.js') || error.message.includes('Cannot find module')) {
        console.error(`\n   ⚠️  This error is due to Next.js server-side dependencies.`);
        console.error(`   The searchHandler uses Next.js server utilities (cookies) that require request context.`);
        console.error(`   \n   WORKAROUND OPTIONS:`);
        console.error(`   1. Create a test API route: app/api/test-search/route.ts`);
        console.error(`   2. Modify searchHandler to accept an optional Supabase client parameter`);
        console.error(`   3. Use a test framework that can mock Next.js server context`);
      }
      if (error.stack) {
        console.error(`   Stack: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
      }
    }
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🧪 Starting Search Handler Tests\n');
  console.log('NOTE: These tests use queries that trigger DB query path (with dishType)');
  console.log('to avoid requiring OpenAI API calls for vector search.\n');

  const testQueries = [
    // Standard dishType queries
    { query: 'burgers', expectedDishType: 'burgers' },
    { query: 'sandwiches', expectedDishType: 'sandwiches' },
    { query: 'burritos', expectedDishType: 'burritos' },
    { query: 'bowls', expectedDishType: 'bowls' },
    
    // Misspellings (should still detect dishType where keywords match)
    { query: 'sandwhich', expectedDishType: 'sandwiches' }, // "sandwhich" is in keywords
    { query: 'buritto', expectedDishType: null }, // "buritto" is NOT in keywords, so should not detect
    { query: 'bowls', expectedDishType: 'bowls' },
    { query: 'burgars', expectedDishType: null }, // "burgars" is NOT in keywords, so should not detect
    
    // Macro query
    { query: 'lunch under 700 calories', expectedDishType: null },
    
    // Additional test cases
    { query: 'tacos', expectedDishType: 'tacos' },
    { query: 'pizza', expectedDishType: 'pizza' },
    { query: 'salads', expectedDishType: 'salads' },
  ];

  const results: boolean[] = [];

  for (const test of testQueries) {
    const passed = await testQuery(test.query, test.expectedDishType);
    results.push(passed);
    
    // Small delay between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 TEST SUMMARY');
  console.log(`${'='.repeat(80)}`);
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  
  if (passed === total) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. See details above.');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
