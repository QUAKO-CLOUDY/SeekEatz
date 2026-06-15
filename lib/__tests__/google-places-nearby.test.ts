import { describe, expect, it } from 'vitest';
import { placeNameMatchesBrand } from '../google-places-nearby';

describe('placeNameMatchesBrand', () => {
  it('accepts exact and abbreviated brand matches', () => {
    expect(
      placeNameMatchesBrand('Lazy Dog Restaurant & Bar', 'Lazy Dog Restaurant & Bar'),
    ).toBe(true);
    expect(placeNameMatchesBrand('Lazy Dog Restaurant & Bar', 'Lazy Dog')).toBe(true);
    expect(
      placeNameMatchesBrand('Chipotle Mexican Grill', 'Chipotle'),
    ).toBe(true);
  });

  it('rejects unrelated nearby businesses', () => {
    expect(
      placeNameMatchesBrand('Lazy Dog Restaurant & Bar', 'The Dog House Bar & Grill'),
    ).toBe(false);
    expect(
      placeNameMatchesBrand('Lazy Dog Restaurant & Bar', 'Hot Dog Heaven'),
    ).toBe(false);
    expect(placeNameMatchesBrand('Sweetgreen', 'Green Leaf Cafe')).toBe(false);
  });

  it('requires all significant brand tokens', () => {
    expect(placeNameMatchesBrand('Firehouse Subs', 'Firehouse Grill')).toBe(false);
    expect(placeNameMatchesBrand('Firehouse Subs', 'Firehouse Subs')).toBe(true);
  });
});
