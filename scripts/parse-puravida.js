const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node parse-puravida.js <path-to-nutrition.txt>');
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(inputPath), 'utf8');
const lines = raw.split(/\r?\n/);

const EXCLUDED_SECTIONS = new Set([
  'SMOOTHIES',
  'SMOOTHIE ENHANCERS',
  'KIDS MENU',
  'SAUCES',
  'PROTEINS',
  'EXTRAS',
  'BAKERY'
]);

let category = '';
const items = [];

function parseNum(s) {
  const n = parseInt(String(s).trim(), 10);
  return isNaN(n) ? 0 : n;
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
  if (!trimmed) continue;

  // Section header (no leading |)
  if (!trimmed.startsWith('|')) {
    const sec = trimmed.trim();
    const key = sec.toUpperCase();
    if (EXCLUDED_SECTIONS.has(key)) {
      category = '';
    } else {
      category = sec;
    }
    continue;
  }

  if (trimmed.startsWith('| Item |')) continue;

  const parts = trimmed
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length < 11) continue;

  const name = parts[0];
  const calories = parseNum(parts[1]);
  const protein = parseNum(parts[2]);
  const carbs = parseNum(parts[3]);
  const fat = parseNum(parts[7]);

  if (!category) continue;
  if (!name || !calories) continue;

  items.push({
    name,
    category,
    price_estimate: null,
    image_url: null,
    macros: { calories, protein, carbs, fat }
  });
}

const data = { restaurant_name: 'Pura Vida Miami (South Florida)', items };
const itemsStr = data.items.map(formatItem).join(',\n');
const out = [
  '{',
  '    "restaurant_name": "Pura Vida Miami (South Florida)",',
  '    "items": [',
  itemsStr,
  '    ]',
  '}',
  ''
].join('\n');

const outPath = path.join(__dirname, '..', 'data', 'jsons', 'puravida_south_florida_raw.json');
fs.writeFileSync(outPath, out, 'utf8');
console.log('Wrote', items.length, 'items to data/jsons/puravida_south_florida_raw.json');

