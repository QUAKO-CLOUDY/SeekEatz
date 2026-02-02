/**
 * Unit tests for macro normalization utility
 * Run with: npm test or jest
 */

import { normalizeMacros, satisfiesMacroConstraints } from '../macro-utils';

describe('normalizeMacros', () => {
  it('should normalize valid macro object', () => {
    const input = {
      calories: 500,
      protein: 30,
      carbs: 50,
      fats: 20,
    };
    const result = normalizeMacros(input);
    expect(result).toEqual({
      calories: 500,
      protein: 30,
      carbs: 50,
      fats: 20,
    });
  });

  it('should handle fat vs fats (prefer fats)', () => {
    const input = {
      calories: 500,
      protein: 30,
      carbs: 50,
      fat: 15, // singular
    };
    const result = normalizeMacros(input);
    expect(result?.fats).toBe(15);
  });

  it('should handle protein_g and carbs_g aliases', () => {
    const input = {
      calories: 500,
      protein_g: 30,
      carbs_g: 50,
      fats: 20,
    };
    const result = normalizeMacros(input);
    expect(result).toEqual({
      calories: 500,
      protein: 30,
      carbs: 50,
      fats: 20,
    });
  });

  it('should reject invalid calories (0 or negative)', () => {
    const input = {
      calories: 0,
      protein: 30,
      carbs: 50,
      fats: 20,
    };
    const result = normalizeMacros(input);
    expect(result).toBeNull();
  });

  it('should reject missing macros', () => {
    const input = {
      calories: 500,
      // missing protein, carbs, fats
    };
    const result = normalizeMacros(input);
    expect(result).toBeNull();
  });

  it('should handle stringified JSON', () => {
    const input = JSON.stringify({
      calories: 500,
      protein: 30,
      carbs: 50,
      fats: 20,
    });
    const result = normalizeMacros(input);
    expect(result).toEqual({
      calories: 500,
      protein: 30,
      carbs: 50,
      fats: 20,
    });
  });
});

describe('satisfiesMacroConstraints', () => {
  const macros = {
    calories: 600,
    protein: 30,
    carbs: 50,
    fats: 20,
  };

  it('should pass when all constraints are satisfied', () => {
    const result = satisfiesMacroConstraints(macros, {
      maxCalories: 700,
      minProtein: 25,
      maxCarbs: 60,
      maxFats: 25,
    });
    expect(result).toBe(true);
  });

  it('should fail when calories exceed max', () => {
    const result = satisfiesMacroConstraints(macros, {
      maxCalories: 500,
    });
    expect(result).toBe(false);
  });

  it('should fail when protein below min', () => {
    const result = satisfiesMacroConstraints(macros, {
      minProtein: 40,
    });
    expect(result).toBe(false);
  });

  it('should support both min and max for same macro', () => {
    const result = satisfiesMacroConstraints(macros, {
      minCalories: 500,
      maxCalories: 700,
      minProtein: 25,
      maxProtein: 35,
    });
    expect(result).toBe(true);
  });
});

