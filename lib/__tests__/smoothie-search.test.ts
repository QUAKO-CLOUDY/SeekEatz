import {
  hasMacroConstraints,
  isSmoothieLikeMenuItem,
  isSmoothieLikeText,
  shouldRandomizeSmoothieResults,
} from '../smoothie-search';

describe('smoothie-search helpers', () => {
  it('detects smoothie-like search text', () => {
    expect(isSmoothieLikeText('find me smoothies')).toBe(true);
    expect(isSmoothieLikeText('protein shake options')).toBe(true);
    expect(isSmoothieLikeText('burger')).toBe(false);
  });

  it('detects smoothie-like menu items even when category is beverage', () => {
    expect(
      isSmoothieLikeMenuItem({
        name: 'Strawberry Banana Smoothie',
        category: 'Beverage',
      })
    ).toBe(true);
  });

  it('recognizes explicit macro constraints', () => {
    expect(hasMacroConstraints({ maxCalories: 450 })).toBe(true);
    expect(hasMacroConstraints({})).toBe(false);
  });

  it('randomizes unconstrained smoothie searches only', () => {
    expect(
      shouldRandomizeSmoothieResults({
        dishType: 'smoothie',
        constraints: {},
      })
    ).toBe(true);

    expect(
      shouldRandomizeSmoothieResults({
        dishType: 'smoothie',
        constraints: { maxCalories: 400 },
      })
    ).toBe(false);

    expect(
      shouldRandomizeSmoothieResults({
        dishType: 'burger',
        constraints: {},
      })
    ).toBe(false);
  });
});
