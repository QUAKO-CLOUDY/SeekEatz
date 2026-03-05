const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node parse-nativegrillandwings.js <path-to-pdf-text.txt>');
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(inputPath), 'utf8');
const lines = raw.split(/\r?\n/);

// Sections we don't want to ingest (desserts, kids, etc.).
const EXCLUDED_SECTIONS = new Set([
  'DESSERT',
  'DESSERTS',
  'KID MEALS',
  "KID'S MEALS",
  "KID'S MEAL",
  'KID MEAL'
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
  if (!trimmed.startsWith('|')) continue;
  if (trimmed.startsWith('| ---')) continue;

  // Split markdown-style table row: | col1 | col2 | ... |
  const parts = trimmed
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (!parts.length) continue;

  const first = parts[0];

  // Skip header rows.
  if (/^menu category$/i.test(first)) continue;
  if (/^cals$/i.test(first)) continue;

  // Section/category header: first column has text, following columns are blank
  // or this row is clearly a section name.
  const hasOnlyName =
    parts.length === 1 ||
    (parts.length > 1 && parts.slice(1).every((p) => !p || !/\d/.test(p)));

  if (hasOnlyName) {
    const secKey = first.toUpperCase().trim();
    if (EXCLUDED_SECTIONS.has(secKey)) {
      category = '';
    } else {
      category = first;
    }
    continue;
  }

  // At this point, we expect a full nutrition row:
  // [name, Cals, Fat Cals, Fat (g), Sat (g), Trans (g), Chol (mg),
  //  Sod (mg), Carbs (g), Fiber (g), Sugar (g), Prot (g)]
  if (parts.length < 12) continue;
  if (!category) continue;

  const name = first;
  const calories = parseNum(parts[1]);
  if (!name || !calories) continue;

  const fat = parseNum(parts[3]);
  const carbs = parseNum(parts[8]);
  const protein = parseNum(parts[11]);

  items.push({
    name,
    category,
    price_estimate: null,
    image_url: null,
    macros: { calories, protein, carbs, fat }
  });
}

const data = { restaurant_name: 'Native Grill & Wings', items };
const itemsStr = data.items.map(formatItem).join(',\n');
const out = [
  '{',
  '    "restaurant_name": "Native Grill & Wings",',
  '    "items": [',
  itemsStr,
  '    ]',
  '}',
  ''
].join('\n');

const outPath = path.join(__dirname, '..', 'data', 'jsons', 'nativegrillandwings_raw.json');
fs.writeFileSync(outPath, out, 'utf8');
console.log('Wrote', items.length, 'items to data/jsons/nativegrillandwings_raw.json');

