const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node parse-maggianos.js <path-to-nutrition.txt>');
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(inputPath), 'utf8');
const lines = raw.split(/\r?\n/);

const EXCLUDED_SECTIONS = new Set([
  'Desserts', 'Kids', 'Beverages - Non-Alcoholic', 'Beverages - Cocktails & More',
  'Beverages - Beer', 'Beverages - Wine', 'Beverages - After Dinner Drinks'
]);

const ADDON_NAMES = /^Add (Chicken|Salmon|Shrimp to any Salad|Parmesan-Crusted Chicken|a Crab Cake|Crispy Calabrian Shrimp)$/i;

let category = '';
const items = [];

function parseNum(s) {
  const n = parseFloat(String(s).trim().replace(/,/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
}

function formatItem(item) {
  return [
    '      {',
    '        "name": ' + JSON.stringify(item.name) + ',',
    '        "category": ' + JSON.stringify(item.category) + ',',
    '        "price_estimate": null,',
    '        "image_url": null,',
    '        "macros": {',
    '          "calories": ' + item.macros.calories + ',',
    '          "protein": ' + item.macros.protein + ',',
    '          "carbs": ' + item.macros.carbs + ',',
    '          "fat": ' + item.macros.fat,
    '        }',
    '      }'
  ].join('\n');
}

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) continue;

  const parts = trimmed.split('|').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 11) continue;

  const first = parts[0];
  const second = parts[1];

  // Section header: second column is "Cals"
  if (second === 'Cals') {
    if (EXCLUDED_SECTIONS.has(first)) category = '';
    else category = first;
    continue;
  }

  // Data row: second column is numeric
  const cal = parseNum(second);
  if (!Number.isFinite(cal) || cal <= 0) continue;
  if (!category) continue;

  const name = first;
  const fat = parseNum(parts[2] || 0);
  const carbs = parseNum(parts[7] || 0);
  const protein = parseNum(parts[10] || 0);

  if (ADDON_NAMES.test(name)) continue;

  items.push({
    name,
    category,
    price_estimate: null,
    image_url: null,
    macros: { calories: cal, protein, carbs, fat }
  });
}

const data = { restaurant_name: "Maggiano's Little Italy", items };
const itemsStr = data.items.map(formatItem).join(',\n');
const out = [
  '{',
  '    "restaurant_name": "Maggiano\'s Little Italy",',
  '    "items": [',
  itemsStr,
  '    ]',
  '}',
  ''
].join('\n');

const outPath = path.join(__dirname, '..', 'data', 'jsons', 'maggianos_raw.json');
fs.writeFileSync(outPath, out, 'utf8');
console.log('Wrote', items.length, 'items to data/jsons/maggianos_raw.json');
