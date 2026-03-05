const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node parse-flowerchild.js <path-to-nutrition.txt>');
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(inputPath), 'utf8');
const lines = raw.split(/\r?\n/);

const EXCLUDED_SECTIONS = new Set(['DESSERT', 'HEALTHY KIDS', 'DESSERT ', 'HEALTHY KIDS ']);

const SKIP_NAMES = [
  'gluten-free pita',
  'raw veggies',
  '(sub) gluten-free pita',
  '⟨(sub)⟩ gluten-free pita',
  'looking for a low-cal, sugar-free & dairy-free option? sub our lemon-avocado dressing'
];

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
  if (!trimmed) continue;

  // Section header (no leading |)
  if (!trimmed.startsWith('|')) {
    const section = trimmed.replace(/\s*\(.*\)\s*$/, '').trim();
    const key = section.toUpperCase().replace(/\s+/g, ' ');
    if (EXCLUDED_SECTIONS.has(key) || key.includes('DESSERT') || key.includes('HEALTHY KIDS')) category = '';
    else category = section;
    continue;
  }

  if (trimmed.startsWith('| ---')) continue;

  const parts = trimmed.split('|').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 12) continue;

  const name = parts[0].replace(/\*+$/, '').trim();
  if (SKIP_NAMES.some((s) => name.toLowerCase().includes(s.toLowerCase()))) continue;

  const cal = parseNum(parts[1]);
  if (!Number.isFinite(cal) || cal <= 0) continue;
  if (!category) continue;

  const fat = parseNum(parts[3]);
  const carbs = parseNum(parts[8]);
  const protein = parseNum(parts[11]);

  items.push({
    name,
    category,
    price_estimate: null,
    image_url: null,
    macros: { calories: cal, protein, carbs, fat }
  });
}

const data = { restaurant_name: 'Flower Child', items };
const itemsStr = data.items.map(formatItem).join(',\n');
const out = [
  '{',
  '    "restaurant_name": "Flower Child",',
  '    "items": [',
  itemsStr,
  '    ]',
  '}',
  ''
].join('\n');

const outPath = path.join(__dirname, '..', 'data', 'jsons', 'flowerchild_raw.json');
fs.writeFileSync(outPath, out, 'utf8');
console.log('Wrote', items.length, 'items to data/jsons/flowerchild_raw.json');
