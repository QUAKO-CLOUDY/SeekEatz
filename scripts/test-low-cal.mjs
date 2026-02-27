import fs from 'fs';

const restaurants = [
    "KFC",
    "Five Guys",
    "McDonald's",
    "Burger King"
];

async function run() {
    for (const r of restaurants) {
        const query = `find me a low calorie meal at ${r}`;
        console.log(`\nTesting: "${query}"`);
        try {
            const response = await fetch('http://localhost:3000/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-bypass-usage': 'seekeatz-test'
                },
                body: JSON.stringify({ message: query })
            });

            const rawText = await response.text();
            let data;
            try {
                data = JSON.parse(rawText);
            } catch (e) {
                const lines = rawText.split('\n').filter(Boolean);
                const dataLines = lines.filter(l => l.startsWith('0:'));
                if (dataLines.length > 0) {
                    try {
                        data = JSON.parse(dataLines[dataLines.length - 1].slice(2));
                    } catch (err) { }
                }
            }

            if (data && data.mode) {
                console.log(`  -> Mode: ${data.mode}, Meals: ${data.meals ? data.meals.length : 0}`);
                if (data.mode === 'text') {
                    console.log(`  -> Answer: ${data.answer}`);
                } else if (data.meals) {
                    const top = data.meals.slice(0, 3).map(m => m.name);
                    console.log(`  -> Top 3: ${top.join(', ')}`);
                }
            } else {
                console.log(`  -> Unrecognized format`);
            }
        } catch (e) {
            console.log(`  -> Error: ${e.message}`);
        }
    }
}

run();
