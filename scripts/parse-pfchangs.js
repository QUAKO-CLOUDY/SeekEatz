const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node parse-pfchangs.js <path-to-nutrition-page.txt>');
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(inputPath), 'utf8');
const lines = raw.split(/\r?\n/);

const EXCLUDED_SECTIONS = new Set([
  'Kids Menu', 'Kids Drinks', 'Desserts', 'GLUTEN-FREE DESSERTS',
  'Protein Options', 'SERVED WITH CHOICE OF…', 'SAUCE FLIGHT SAUCES',
  'Add-Ons', 'Choose Your Rice'
]);

const CAT_MAP = {
  'Appetizers': 'Appetizers', 'Market Sides': 'Sides', 'Dim Sum calories are per piece': 'Appetizers',
  'Sushi': 'Entree', 'Salads & Soup': 'Salads & Soup', 'DINNER SPECIALS- VALUES DO NOT INCLUDE RICE': 'Entree',
  'STARTER': 'Sides', 'MAIN ENTRÉES/ Medium': 'Entree', 'MAIN ENTRÉES / TRADITIONAL SIZED': 'Entree',
  'BEEF': 'Entree', 'CHICKEN': 'Entree', 'SEAFOOD': 'Entree', 'VEGETARIAN': 'Entree', 'DELUXE ENTREES': 'Entree',
  "NOODLES & RICE CHEF'S FEAST": 'Entree', 'NOODLES & RICE TRADITIONAL SIZED': 'Entree',
  'SIDES': 'Sides', 'LUNCH RICE BOWLS - VALUES DO NOT INCLUDE RICE': 'Entree',
  'ADD A HALF APPETIZER': 'Appetizers', 'SOUP & SALAD COMBO': 'Salads & Soup',
  'GLUTEN-FREE LUNCH - (VALUES DO NOT INCLUDE RICE)': 'Entree', 'Gluten-Free Appetizers': 'Appetizers',
  'Gluten-Free Soup': 'Sides', 'GLUTEN-FREE ENTRÉES': 'Entree', 'GLUTEN-FREE NOODLES & RICE': 'Entree',
  'GLUTEN-FREE SIDES': 'Sides'
};

const SKIP_NAMES = /^(Chicken|Salmon\*?)$/;

let category = '';
const items = [];
const seen = new Set();

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
  if (!trimmed.startsWith('|') || trimmed.startsWith('| ---')) continue;

  const parts = trimmed.split('|').map((p) => p.trim()).filter(Boolean);

  // Section header row: first cell = section name, second = "Servings"
  if (parts.length >= 2 && parts[1] === 'Servings') {
    const head = parts[0].replace(/\*+/g, '').trim();
    if (EXCLUDED_SECTIONS.has(head)) category = '';
    else if (CAT_MAP[head]) category = CAT_MAP[head];
    else if (head && /^(BEEF|CHICKEN|SEAFOOD|VEGETARIAN|DELUXE ENTREES)$/.test(head)) category = 'Entree';
    continue;
  }

  // Subheader / single-cell section (e.g. "| Protein Options |", "| STARTER |")
  if (parts.length === 1) {
    const head = parts[0].replace(/\*+/g, '').trim();
    if (EXCLUDED_SECTIONS.has(head)) category = '';
    else if (CAT_MAP[head]) category = CAT_MAP[head];
    continue;
  }

  // Data row: name, servings (numeric), cal, ...
  if (parts.length >= 13 && /^\d+$/.test(String(parts[1]).trim())) {
    const name = parts[0];
    const cal = parseNum(parts[2]);
    const fat = parseNum(parts[4]);
    const carbs = parseNum(parts[9]);
    const protein = parseNum(parts[12]);

    if (!name || !category || SKIP_NAMES.test(name)) continue;
    if (cal === 0 && fat === 0 && carbs === 0 && protein === 0) continue;

    const key = name + '|' + category;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      name,
      category: category.replace(/\s*\|\s*$/, ''),
      price_estimate: null,
      image_url: null,
      macros: { calories: cal, protein, carbs, fat }
    });
  }
}

const data = { restaurant_name: "P.F. Chang's", items };
const itemsStr = data.items.map(formatItem).join(',\n');
const out = [
  '{',
  '    "restaurant_name": "P.F. Chang\'s",',
  '    "items": [',
  itemsStr,
  '    ]',
  '}',
  ''
].join('\n');

const outPath = path.join(__dirname, '..', 'data', 'jsons', 'pfchangs_raw.json');
fs.writeFileSync(outPath, out, 'utf8');
console.log('Wrote', items.length, 'items to data/jsons/pfchangs_raw.json');
