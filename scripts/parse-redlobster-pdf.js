const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node parse-redlobster-pdf.js <path-to-pdf-text.txt>');
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(inputPath), 'utf8');
const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

const EXCLUDED = new Set([
  'DESSERTS', 'ALCOHOLIC DRINKS', 'WINE', 'BEER', 'NON-ALCOHOLIC DRINKS',
  'KIDS MENU', 'DRESSINGS & CONDIMENTS', 'ADD TO ANY ENTRÉE', 'FAMILY DESSERTS'
]);

const SKIP_NAMES = /^(Create Your Own|Crab Your Way|Cajun Butter|Lemon Pepper|OLD BAY|RL Signature|Roasted Garlic|Simply Steamed|Shrimp & Sauce|Shrimp$|Spicy$|Extra Spicy|Add Cajun)/i;

const CAT_MAP = {
  'LOBSTERFEST®': 'Entree', 'STARTERS & SOUPS': 'Appetizers', 'ENTRÉES': 'Entree',
  'Seafood Boils': 'Entree', 'Shrimp Your Way': 'Entree', 'SALADS & BOWLS': 'Salads & Bowls',
  'DAILY DEALS': 'Entree', 'WEEKDAY LUNCH SPECIALS': 'Entree', 'SIDES': 'Sides',
  'Shrimp & Sausage Jambalaya': 'Entree', 'FAMILY MEALS': 'Family Meals',
  'FAMILY SIDES': 'Family Sides', 'PARTY PLATTERS': 'Party Platters'
};

function parseNum(s) {
  if (!s || s === '<10') return 0;
  const n = parseInt(String(s).trim(), 10);
  return isNaN(n) ? 0 : n;
}

let category = '';
const items = [];

for (const line of lines) {
  const parts = line.split(/\s+/);
  if (parts.length < 12) {
    const first = parts[0];
    if (EXCLUDED.has(first)) category = '';
    else if (CAT_MAP[first]) category = CAT_MAP[first];
    continue;
  }
  const last11 = parts.slice(-11);
  if (last11.some((p) => isNaN(parseInt(p, 10)) && p !== '<10')) continue;
  const nums = last11.map(parseNum);
  const name = parts.slice(0, -11).join(' ').trim();
  if (!category || !name || SKIP_NAMES.test(name)) continue;
  const cal = nums[0], fat = nums[2], carbs = nums[7], protein = nums[10];
  items.push({
    name,
    category,
    price_estimate: null,
    image_url: null,
    macros: { calories: cal, protein, carbs, fat }
  });
}

const data = { restaurant_name: 'Red Lobster', items };

function formatItem(item) {
  return [
    '        {',
    '            "name": ' + JSON.stringify(item.name) + ',',
    '            "category": ' + JSON.stringify(item.category) + ',',
    '            "price_estimate": null,',
    '            "image_url": null,',
    '            "macros": {',
    '                "calories": ' + item.macros.calories + ',',
    '                "protein": ' + item.macros.protein + ',',
    '                "carbs": ' + item.macros.carbs + ',',
    '                "fat": ' + item.macros.fat,
    '            }',
    '        }'
  ].join('\n');
}

const itemsStr = data.items.map(formatItem).join(',\n');
const out = [
  '{',
  '    "restaurant_name": "Red Lobster",',
  '    "items": [',
  itemsStr,
  '    ]',
  '}',
  ''
].join('\n');

const outPath = path.join(__dirname, '..', 'data', 'jsons', 'redlobster_raw.json');
fs.writeFileSync(outPath, out, 'utf8');
console.log('Wrote', items.length, 'items to data/jsons/redlobster_raw.json');
