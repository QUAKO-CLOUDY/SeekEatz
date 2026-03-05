const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node parse-seasons52.js <path-to-nutrition.txt>');
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(inputPath), 'utf8');
const lines = raw.split(/\r?\n/);

const EXCLUDED_SECTIONS = new Set([
  'KIDS', 'MINI INDULGENCES', 'SEASONAL COCKTAILS', 'BUZZ-FREE', 'HAPPY HOUR',
  'AFTER DINNER', 'WINES', 'WINE FLIGHTS', 'BEERS & CIDERS', 'NON-ALC BEVERAGES',
  'ENTRÃ‰E & SALAD ACCOMPANIMENTS'
]);

const ADDON_NAMES = /^Add (Chicken Breast|Shrimp|Filet)$/i;

let category = '';
const items = [];

function parseNum(s) {
  const v = String(s).trim().replace(/,/g, '').replace(/^less than 1 g$/i, '0');
  const n = parseFloat(v);
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

function isNumericToken(t) {
  const v = t.replace(/^less than 1 g$/i, '0');
  return /^-?\d*\.?\d+$/.test(v.trim());
}

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;

  const tokens = trimmed.split(/\s+/);

  // Section header: short line
  if (tokens.length < 12) {
    const section = trimmed;
    if (EXCLUDED_SECTIONS.has(section)) category = '';
    else if (section) category = section;
    continue;
  }

  const numStart = tokens.length - 11;
  const numPart = tokens.slice(numStart);
  if (!numPart.every((t) => isNumericToken(t) || t === '0.5')) continue;

  const cal = parseNum(numPart[0]);
  if (!Number.isFinite(cal) || cal <= 0) continue;
  if (!category) continue;

  const name = tokens.slice(0, numStart).join(' ');
  if (ADDON_NAMES.test(name)) continue;

  const fat = parseNum(numPart[1]);
  const carbs = parseNum(numPart[5]);
  const protein = parseNum(numPart[6]);

  items.push({
    name,
    category,
    price_estimate: null,
    image_url: null,
    macros: { calories: cal, protein, carbs, fat }
  });
}

const data = { restaurant_name: "Seasons 52", items };
const itemsStr = data.items.map(formatItem).join(',\n');
const out = [
  '{',
  '    "restaurant_name": "Seasons 52",',
  '    "items": [',
  itemsStr,
  '    ]',
  '}',
  ''
].join('\n');

const outPath = path.join(__dirname, '..', 'data', 'jsons', 'seasons52_raw.json');
fs.writeFileSync(outPath, out, 'utf8');
console.log('Wrote', items.length, 'items to data/jsons/seasons52_raw.json');
