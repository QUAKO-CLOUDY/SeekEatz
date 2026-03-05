const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || path.join(__dirname, 'redlobster_temp.json');
const outputPath = process.argv[3] || path.join(__dirname, '..', 'data', 'jsons', 'redlobster_raw.json');
const data = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));

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

fs.writeFileSync(path.resolve(outputPath), out, 'utf8');

console.log('Reformatted', data.items.length, 'items');
