import fs from 'fs';

const queries = [
    // User provided tests
    "Find me a meal from McDonald's.",
    "Low calorie meal at a steakhouse.",
    "What’s the leanest thing at an Italian restaurant?",
    "What should I get at a burger place if I’m cutting?",
    "Healthy airport meal.",
    "I have 900 calories left, what should I do?",
    "Show me meals between 540–600 calories with at least 45g protein.",
    "Under 475 calories, minimum 40g protein, no seafood.",
    "Between 700–750 calories, at least 50g protein, under 60g carbs.",
    "Highest protein meal under 600 calories.",
    "Best protein-to-calorie ratio at Chipotle.",
    "Specific protein options with macro and calorie filtering",
    "Lowest calorie meals",
    "Cuisine meals over/under calories or macros",
    "Multi stack test: cuisine, macros, and calories",
    "Show me the highest protein meal in the entire database.",
    // Additional tests for completeness
    "high protein meals from Taco Bell with under 600 calories",
    "Best high-protein option at Burger King",
    "show me lunch at olive garden",
    "i wanna eat a vegetrian high protein meal",
    "vegan high protein bowls",
    "Find me a meal with at least 30g protein and max 500 calories",
    // Internal test cases from system prompt
    "High protein vegetarian meals under 500 calories",
    "Leanest thing at chipotle",
    "Highest protein vegan option at taco bell",
    "Food",
    "How many calories in a big mac",
    "80g protein under 300 calories",
    "Not chicken, high protein"
];

async function testQueries() {
    console.log('Starting Test Sequence...');
    const results = [];

    for (const query of queries) {
        console.log(`\nTesting: "${query}"`);
        try {
            const response = await fetch('http://localhost:3000/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-bypass-usage': 'seekeatz-test'
                },
                body: JSON.stringify({ message: query }) // Fixed: `message` instead of `messages`
            });

            if (!response.ok) {
                results.push({ query, error: `HTTP ${response.status}` });
                continue;
            }

            const rawText = await response.text();
            let data;
            try {
                // Try raw JSON format first
                data = JSON.parse(rawText);
            } catch (e) {
                // Next.js AI SDK streams NDJSON. We look for '0:' parts which contain JSON payloads
                const lines = rawText.split('\n').filter(Boolean);
                // Find the most complete JSON payload, usually the last '0:' line
                const dataLines = lines.filter(l => l.startsWith('0:'));
                if (dataLines.length > 0) {
                    try {
                        data = JSON.parse(dataLines[dataLines.length - 1].slice(2));
                    } catch (err) {
                        data = { raw: rawText.substring(0, 100) + '...' };
                    }
                } else {
                    data = { raw: rawText.substring(0, 100) + '...' };
                }
            }

            if (data && data.mode) {
                const isMealSearch = data.mode === 'meals';
                const mealCount = isMealSearch && data.meals ? data.meals.length : 0;
                console.log(`  -> Mode: ${data.mode}, Meals Returned: ${mealCount}`);

                const topItems = (data.meals || []).slice(0, 3).map(m => `${m.name} (${m.restaurant_name})`);
                if (topItems.length > 0) {
                    console.log(`  -> Top 3: ${topItems.join(', ')}`);
                }

                results.push({
                    query,
                    mode: data.mode,
                    mealCount,
                    topItems,
                    answer: data.answer || null
                });
            } else {
                console.log(`  -> Unrecognized format`);
                results.push({ query, rawText: rawText.substring(0, 200) });
            }

        } catch (err) {
            console.log(`  -> Error: ${err.message}`);
            results.push({ query, error: err.message });
        }
    }

    // Save full results for review
    fs.writeFileSync('test_results_after.json', JSON.stringify(results, null, 2));
    console.log('\nSaved full results to test_results_after.json');
}

testQueries();
