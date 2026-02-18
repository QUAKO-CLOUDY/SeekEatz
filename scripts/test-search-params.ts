
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
        // @ts-ignore - casting for test
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

    } catch (err) {
        console.error('Test Exception:', err);
        failed++;
    }

    console.log(`\nSummary: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests();
