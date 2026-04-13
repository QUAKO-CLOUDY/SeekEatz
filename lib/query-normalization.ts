const PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bbreakfast sandwhich\b/gi, 'breakfast sandwich'],
  [/\begg sandwhich\b/gi, 'egg sandwich'],
];

const TOKEN_REPLACEMENTS = new Map<string, string>([
  ['acia', 'acai'],
  ['brekfast', 'breakfast'],
  ['breakfest', 'breakfast'],
  ['brakfast', 'breakfast'],
  ['caloriee', 'calorie'],
  ['caloriees', 'calories'],
  ['calroie', 'calorie'],
  ['calroies', 'calories'],
  ['calries', 'calories'],
  ['griled', 'grilled'],
  ['healty', 'healthy'],
  ['helthy', 'healthy'],
  ['mediteranean', 'mediterranean'],
  ['protien', 'protein'],
  ['protiens', 'proteins'],
  ['proten', 'protein'],
  ['quesidilla', 'quesadilla'],
  ['quesidillas', 'quesadillas'],
  ['restaraunt', 'restaurant'],
  ['restraunt', 'restaurant'],
  ['resturant', 'restaurant'],
  ['sandwhich', 'sandwich'],
  ['sandwhiches', 'sandwiches'],
  ['smootie', 'smoothie'],
  ['smooties', 'smoothies'],
  ['vegtarian', 'vegetarian'],
]);

export type NormalizedSearchText = {
  text: string;
  corrections: Array<{ from: string; to: string }>;
};

export function normalizeSearchText(raw: string): NormalizedSearchText {
  if (!raw) {
    return { text: '', corrections: [] };
  }

  let normalized = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const corrections: Array<{ from: string; to: string }> = [];

  for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
    normalized = normalized.replace(pattern, (match) => {
      if (match.toLowerCase() !== replacement.toLowerCase()) {
        corrections.push({ from: match, to: replacement });
      }
      return preserveCase(match, replacement);
    });
  }

  normalized = normalized.replace(/\b[a-z][a-z'-]*\b/gi, (token) => {
    const replacement = TOKEN_REPLACEMENTS.get(token.toLowerCase());
    if (!replacement || replacement.toLowerCase() === token.toLowerCase()) {
      return token;
    }

    corrections.push({ from: token, to: replacement });
    return preserveCase(token, replacement);
  });

  return {
    text: normalized.replace(/\s+/g, ' ').trim(),
    corrections,
  };
}

function preserveCase(original: string, replacement: string): string {
  if (original.toUpperCase() === original) {
    return replacement.toUpperCase();
  }

  if (original[0] && original[0] === original[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }

  return replacement;
}
