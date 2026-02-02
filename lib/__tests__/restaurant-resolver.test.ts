/**
 * Unit tests for restaurant resolver
 */

import { detectRestaurantIntent, normalizeRestaurantName, resolveRestaurantFromText, findSimilarRestaurants, extractExplicitRestaurantQuery, resolveRestaurantUniversal } from '../restaurant-resolver';

// Mock getRestaurantCandidates for testing
jest.mock('../restaurant-resolver', () => {
  const actual = jest.requireActual('../restaurant-resolver');
  const normalizedIndex = new Map([
    ['jimmy johns', { canonicalName: 'Jimmy John\'s', variants: ['Jimmy John\'s'] }],
    ['subway', { canonicalName: 'Subway', variants: ['Subway'] }],
    ['chipotle', { canonicalName: 'Chipotle Mexican Grill', variants: ['Chipotle', 'Chipotle Mexican Grill'] }],
    ['chipotle mexican grill', { canonicalName: 'Chipotle Mexican Grill', variants: ['Chipotle', 'Chipotle Mexican Grill'] }],
    ['firehouse subs', { canonicalName: 'Firehouse Subs', variants: ['Firehouse Subs'] }],
    ['cava', { canonicalName: 'CAVA', variants: ['CAVA', 'Cava'] }],
  ]);
  return {
    ...actual,
    getRestaurantCandidates: jest.fn(async () => ({
      normalizedToCanonical: new Map([
        ['jimmy johns', 'Jimmy John\'s'],
        ['subway', 'Subway'],
        ['chipotle', 'Chipotle Mexican Grill'],
        ['chipotle mexican grill', 'Chipotle Mexican Grill'],
        ['firehouse subs', 'Firehouse Subs'],
        ['cava', 'CAVA'],
      ]),
      canonicalNames: ['Jimmy John\'s', 'Subway', 'Chipotle Mexican Grill', 'Firehouse Subs', 'CAVA'],
      normalizedIndex,
    })),
  };
});

describe('detectRestaurantIntent', () => {
  it('should return false for generic dish "burger"', async () => {
    const result = await detectRestaurantIntent('burger');
    expect(result.intent).toBe(false);
    expect(result.reason).toBe('dishGuard');
  });

  it('should return false for "I want a burger"', async () => {
    const result = await detectRestaurantIntent('I want a burger');
    expect(result.intent).toBe(false);
    expect(result.reason).toBe('dishGuard');
  });

  it('should return true for "from jimmy johns"', async () => {
    const result = await detectRestaurantIntent('from jimmy johns');
    expect(result.intent).toBe(true);
    expect(result.reason).toBe('marker');
  });

  it('should return true for "jimmy johns" (short message, matches known restaurant)', async () => {
    const result = await detectRestaurantIntent('jimmy johns');
    expect(result.intent).toBe(true);
    expect(result.reason).toBe('matchedRestaurant');
  });

  it('should return false for "acai bowl"', async () => {
    const result = await detectRestaurantIntent('acai bowl');
    expect(result.intent).toBe(false);
    expect(result.reason).toBe('dishGuard');
  });

  it('should return true for "sub from jimmy johns"', async () => {
    const result = await detectRestaurantIntent('sub from jimmy johns');
    expect(result.intent).toBe(true);
    expect(result.reason).toBe('marker');
  });

  it('should return false for "burger under 500 calories"', async () => {
    const result = await detectRestaurantIntent('burger under 500 calories');
    expect(result.intent).toBe(false);
    expect(result.reason).toBe('dishGuard');
  });

  it('should return true for "jimmy johns menu"', async () => {
    const result = await detectRestaurantIntent('jimmy johns menu');
    expect(result.intent).toBe(true);
    expect(result.reason).toBe('marker');
  });

  it('should return false for unknown restaurant name (no match)', async () => {
    const result = await detectRestaurantIntent('madeupplace');
    expect(result.intent).toBe(false);
    expect(result.reason).toBe('none');
  });
});

describe('normalizeRestaurantName', () => {
  it('should normalize "Jimmy John\'s" correctly', () => {
    const normalized = normalizeRestaurantName("Jimmy John's");
    expect(normalized).toBe('jimmy johns');
  });

  it('should normalize "Firehouse Subs" correctly', () => {
    const normalized = normalizeRestaurantName('Firehouse Subs');
    expect(normalized).toBe('firehouse subs');
  });

  it('should handle punctuation removal', () => {
    const normalized = normalizeRestaurantName("O'Brien's");
    expect(normalized).toBe('obriens');
  });
});

describe('resolveRestaurantFromText', () => {
  it('should match "meals from chipotle" to Chipotle Mexican Grill', async () => {
    const result = await resolveRestaurantFromText('meals from chipotle');
    expect(result.status).toBe('MATCH');
    if (result.status === 'MATCH') {
      expect(result.canonicalName).toBe('Chipotle Mexican Grill');
      expect(result.variants).toContain('Chipotle');
      expect(result.variants).toContain('Chipotle Mexican Grill');
    }
  });

  it('should match "meals from cava" to CAVA with variants', async () => {
    const result = await resolveRestaurantFromText('meals from cava');
    expect(result.status).toBe('MATCH');
    if (result.status === 'MATCH') {
      expect(result.canonicalName).toBe('CAVA');
      expect(result.variants.length).toBeGreaterThan(0);
    }
  });

  it('should handle typo "chipolte" with fuzzy matching', async () => {
    const result = await resolveRestaurantFromText('meals from chipolte');
    // Should either MATCH (if fuzzy score is high enough) or AMBIGUOUS
    expect(['MATCH', 'AMBIGUOUS']).toContain(result.status);
  });

  it('should return NOT_FOUND with missingRestaurantQuery for unknown restaurant', async () => {
    const result = await resolveRestaurantFromText('meals from nonexistentplace');
    expect(result.status).toBe('NOT_FOUND');
    if (result.status === 'NOT_FOUND') {
      expect(result.missingRestaurantQuery).toBeDefined();
    }
  });
});

describe('findSimilarRestaurants', () => {
  it('should find similar restaurants to "chipotle"', async () => {
    const similar = await findSimilarRestaurants('chipotle', 5);
    expect(similar.length).toBeGreaterThan(0);
    expect(similar).toContain('Chipotle Mexican Grill');
  });

  it('should return empty array for empty query', async () => {
    const similar = await findSimilarRestaurants('', 5);
    expect(similar).toEqual([]);
  });
});

describe('extractExplicitRestaurantQuery', () => {
  it('should extract "chipotle" from "meals from chipotle"', () => {
    const query = extractExplicitRestaurantQuery('meals from chipotle');
    expect(query).toBe('chipotle');
  });

  it('should extract "firehouse" from "from firehouse"', () => {
    const query = extractExplicitRestaurantQuery('from firehouse');
    expect(query).toBe('firehouse');
  });

  it('should extract "mcdonalds" from "mcdonalds menu"', () => {
    const query = extractExplicitRestaurantQuery('mcdonalds menu');
    expect(query).toBe('mcdonalds');
  });

  it('should return null for generic dish query', () => {
    const query = extractExplicitRestaurantQuery('burger under 500 calories');
    expect(query).toBeNull();
  });
});

describe('resolveRestaurantUniversal', () => {
  it('should return NOT_FOUND for non-existent restaurant', async () => {
    const result = await resolveRestaurantUniversal('meals from nonexistentplace123');
    expect(result.status).toBe('NOT_FOUND');
    if (result.status === 'NOT_FOUND') {
      expect(result.missingRestaurantQuery).toBeDefined();
    }
  });

  it('should return NO_MEALS when restaurant exists but no menu_items variants found', async () => {
    // This test would require proper Supabase mocking
    // The behavior: if restaurant matches in restaurants table but buildRestaurantVariants returns [],
    // then status should be NO_MEALS
  });
});

describe('buildRestaurantVariants (via resolveRestaurantUniversal)', () => {
  it('should include both "CAVA" and "Cava" when menu_items has both', async () => {
    // This test would require mocking Supabase to return menu_items with both variants
    // Expected: variants array includes both "CAVA" and "Cava"
  });

  it('should include "Chipotle" when canonical is "Chipotle Mexican Grill" via token subset', async () => {
    // This test would require mocking Supabase
    // Expected: if menu_items has restaurant_name="Chipotle" and canonical="Chipotle Mexican Grill",
    // variants should include "Chipotle" via token subset matching
  });

  it('should return empty array when no menu_items match', async () => {
    // This test would require mocking Supabase to return empty menu_items
    // Expected: variants = [] (not [canonicalName])
  });
});
