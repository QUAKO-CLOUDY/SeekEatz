const fs = require('fs');
const path = require('path');

const raw = fs.readFileSync(
  path.join(__dirname, '..', 'data', 'olive_garden_nutrition.txt'),
  'utf8'
);

function parseNum(s) {
  if (s === undefined || s === '') return 0;
  const t = String(s).trim();
  if (t.startsWith('less than')) return 0;
  const n = parseInt(t, 10);
  return isNaN(n) ? 0 : n;
}

const EXCLUDED_SECTIONS = new Set([
  'CREATE YOUR OWN PASTA',
  'DESSERTS',
  'DRINKS',
  'NON-ALCOHOLIC DRINKS',
  'TO GO & CATERING MENU',
  'Drinks', // Kids
  'Dessert', // Kids
]);

const CATEGORY_MAP = {
  'APPETIZERS': 'Appetizers',
  'Dipping Sauces for Breadsticks': 'Sides',
  'SOUPS, SALAD & BREADSTICKS': 'Soups & Salad',
  'Lunch-Sized Favorites': 'Entree',
  'Dinner Entrées': 'Entree',
  'Lighter Portions': 'Entree',
  'ENTRÉES': 'Entree',
  'SIDES': 'Sides',
  'Entrees': 'Kids', // Kids menu
  'Sides': 'Kids Sides',
  'GLUTEN SENSITIVE MENU': 'Gluten Sensitive',
};

let currentCategory = '';
const items = [];
const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

for (const line of lines) {
  const parts = line.split('\t').map((p) => p.trim());
  if (parts.length < 12) {
    // Section header or subheader
    const title = parts[0];
    if (EXCLUDED_SECTIONS.has(title)) continue;
    if (CATEGORY_MAP[title]) currentCategory = CATEGORY_MAP[title];
    continue;
  }

  const name = parts[0];
  const cal = parseNum(parts[1]);
  const fat = parseNum(parts[3]);
  const carbs = parseNum(parts[8]);
  const protein = parseNum(parts[11]);

  if (!currentCategory) continue;
  if (!name || name.toLowerCase().startsWith('add ')) continue;

  items.push({
    name,
    category: currentCategory,
    price_estimate: null,
    image_url: null,
    macros: { calories: cal, protein, carbs, fat },
  });
}

const out = {
  restaurant_name: 'Olive Garden',
  items,
};

fs.writeFileSync(
  path.join(__dirname, '..', 'data', 'jsons', 'olive_garden_raw.json'),
  JSON.stringify(out, null, 4),
  'utf8'
);

console.log(`Wrote ${items.length} items to data/jsons/olive_garden_raw.json`);
