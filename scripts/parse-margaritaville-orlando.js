const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node parse-margaritaville-orlando.js <path-to-nutrition.txt>');
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(inputPath), 'utf8');
const lines = raw.split(/\r?\n/);

const EXCLUDED_SECTIONS = new Set([
  'KIDS',
  'DESSERTS'
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

  // Section headings (no leading |)
  if (!trimmed.startsWith('|')) {
    const sec = trimmed.replace(/^\uFEFF/, '').trim();
    const key = sec.toUpperCase();
    if (EXCLUDED_SECTIONS.has(key)) {
      category = '';
    } else if (sec && sec !== 'MARGARITAVILLE ORLANDO NUTRITION DATA') {
      category = sec;
    }
    continue;
  }

  if (trimmed.startsWith('| MENU ITEM')) continue;

  const parts = trimmed
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length < 12) continue;

  const name = parts[0];
  const calories = parseNum(parts[1]);
  const fat = parseNum(parts[3]);
  const carbs = parseNum(parts[8]);
  const protein = parseNum(parts[11]);

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

const data = { restaurant_name: "Jimmy Buffett's Margaritaville Orlando", items };
const itemsStr = data.items.map(formatItem).join(',\n');
const out = [
  '{',
  '    "restaurant_name": "Jimmy Buffett\'s Margaritaville Orlando",',
  '    "items": [',
  itemsStr,
  '    ]',
  '}',
  ''
].join('\n');

const outPath = path.join(__dirname, '..', 'data', 'jsons', 'margaritaville_orlando_raw.json');
fs.writeFileSync(outPath, out, 'utf8');
console.log('Wrote', items.length, 'items to data/jsons/margaritaville_orlando_raw.json');

