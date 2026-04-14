
import { buildSearchParams } from '@/lib/search-utils';

async function runTests() {
    console.log('Testing buildSearchParams logic...');
    let passed = 0;
    let failed = 0;

    function assert(condition: boolean, message: string) {
        if (condition) {
            console.log(`✅ ${message}`);
            passed++;
        } else {
            console.error(`❌ ${message}`);
            failed++;
        }
    }

    try {
        // Test 1: Chat Input with Restaurant (Explicit Intent)
        console.log('\nTest 1: Chat Input (Explicit Restaurant)');
        const chatInput = {
            message: "Find me lunch from Chipotle under 600 calories",
            isHomepage: false
        };
        const params1 = await buildSearchParams(chatInput);

        // Check regex extraction
        assert(params1.explicitRestaurantQuery === 'Chipotle', 'Extracted "Chipotle" from message');
        assert(params1.maxCalories === 600, 'Extracted 600 maxCalories');
        assert(params1.query === chatInput.message, 'Query preserved');
        assert(params1.restaurant === undefined, 'Restaurant param remains undefined (pending resolution)');

        // Test 2: Home Input (Structured Filters)
        console.log('\nTest 2: Home Input (Structured Filters)');
        const homeInput = {
            query: "burgers",
            isHomepage: true,
            filters: {
                calories: { enabled: true, mode: "BELOW" as const, value: 700 },
                protein: { enabled: true, min: 30 }
            }
        };
        const params2 = await buildSearchParams(homeInput);

        assert(params2.maxCalories === 700, 'Mapped filters.calories (BELOW) to maxCalories');
        assert(params2.minProtein === 30, 'Mapped filters.protein to minProtein');
        assert(params2.query === "burgers", 'Query passed through');

        // Test 3: Pagination (Preserve SearchKey)
        console.log('\nTest 3: Pagination (Preserve SearchKey)');
        const paginationInput = {
            message: "from chipotle", // Should NOT trigger detection again
            searchKey: "legacy-key-content",
            offset: 10,
            isPagination: true
        };
        const params3 = await buildSearchParams(paginationInput);

        assert(params3.explicitRestaurantQuery === undefined, 'explicitRestaurantQuery undefined when searchKey present');
        assert(params3.offset === 10, 'Offset passed through');
        assert(params3.searchKey === "legacy-key-content", 'searchKey passed through');

        // Test 4: Macro Extraction from Text (Non-Homepage)
        console.log('\nTest 4: Macro Extraction (Text)');
        const macroInput = {
            message: "high protein bowls",
            isHomepage: false
        };
        const params4 = await buildSearchParams(macroInput);

        assert(params4.minProtein === 30, 'High protein -> minProtein 30');
        assert(params4.query === "high protein bowls", 'Query preserved');

        // Test 5: Minimum calories from text should not become a max cap
        console.log('\nTest 5: Min Calories (Text)');
        const minCaloriesTextInput = {
            message: "lunch with at least 700 calories and 40g of protein",
            isHomepage: false
        };
        const params5 = await buildSearchParams(minCaloriesTextInput);

        assert(params5.minCalories === 700, 'Extracted 700 minCalories from text');
        assert(params5.maxCalories === undefined, 'Did not infer maxCalories for "at least 700 calories"');
        assert(params5.minProtein === 40, 'Extracted 40g protein as minProtein');

        // Test 6: Explicit min-calorie input must win over text parsing
        console.log('\nTest 6: Min Calories (Explicit Input)');
        const minCaloriesExplicitInput = {
            query: "lunch with at least 700 calories and 40g of protein",
            minCalories: 700,
            maxCalories: undefined,
            calorieCap: undefined,
            minProtein: 40,
            isHomepage: false
        };
        const params6 = await buildSearchParams(minCaloriesExplicitInput);

        assert(params6.minCalories === 700, 'Preserved explicit 700 minCalories input');
        assert(params6.maxCalories === undefined, 'Explicit min-calorie input did not reintroduce maxCalories');
        assert(params6.minProtein === 40, 'Preserved explicit 40g minProtein input');

        // Test 7: Home Input (Nearby search from userContext)
        console.log('\nTest 7: Home Input (Nearby via userContext)');
        const nearbyInput = {
            query: "find meals",
            isHomepage: true,
            userContext: {
                search_distance_miles: 10,
                user_location_lat: 33.4484,
                user_location_lng: -112.0740,
                diet_type: 'balanced',
                dietary_options: ['high-protein']
            }
        };
        const params7 = await buildSearchParams(nearbyInput);

        assert(params7.location === 'near me', 'userContext distance activates nearby location search');
        assert(params7.userContext?.search_distance_miles === 10, 'Preserved userContext search distance');
        assert(params7.userContext?.user_location_lat === 33.4484, 'Preserved userContext latitude');
        assert(params7.userContext?.diet_type === 'balanced', 'Preserved userContext diet_type');

    } catch (err) {
        console.error('Test Exception:', err);
        failed++;
    }

    console.log(`\nSummary: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests();
