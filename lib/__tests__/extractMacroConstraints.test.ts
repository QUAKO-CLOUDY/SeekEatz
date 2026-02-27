/**
 * Unit tests for extractMacroConstraintsFromText
 * Covers: semantic shorthand presets, numeric patterns, edge cases
 * Run with: npx jest lib/__tests__/extractMacroConstraints.test.ts --no-coverage
 */

import { extractMacroConstraintsFromText } from '../extractMacroConstraintsFromText';

describe('extractMacroConstraintsFromText — semantic shorthand presets', () => {
    describe('protein-dish patterns', () => {
        it('should parse "protein-dish" → minProtein:30', () => {
            const result = extractMacroConstraintsFromText('protein-dish');
            expect(result.minProtein).toBe(30);
        });

        it('should parse "protein-meal" → minProtein:30', () => {
            const result = extractMacroConstraintsFromText('protein-meal');
            expect(result.minProtein).toBe(30);
        });

        it('should parse "protein-bowl" → minProtein:30', () => {
            const result = extractMacroConstraintsFromText('protein-bowl');
            expect(result.minProtein).toBe(30);
        });

        it('should parse "protein bowl" (space) → minProtein:30', () => {
            const result = extractMacroConstraintsFromText('protein bowl');
            expect(result.minProtein).toBe(30);
        });

        it('should parse "high-protein-meal" → minProtein:30', () => {
            const result = extractMacroConstraintsFromText('high-protein-meal');
            expect(result.minProtein).toBe(30);
        });

        it('should parse "high protein dish" (spaces) → minProtein:30', () => {
            const result = extractMacroConstraintsFromText('high protein dish');
            expect(result.minProtein).toBe(30);
        });
    });

    describe('lean-dish patterns', () => {
        it('should parse "lean-dish" → maxCalories:500, minProtein:25', () => {
            const result = extractMacroConstraintsFromText('lean-dish');
            expect(result.maxCalories).toBe(500);
            expect(result.minProtein).toBe(25);
        });

        it('should parse "lean-meal" → maxCalories:500, minProtein:25', () => {
            const result = extractMacroConstraintsFromText('lean-meal');
            expect(result.maxCalories).toBe(500);
            expect(result.minProtein).toBe(25);
        });

        it('should parse "lean bowl" (space) → maxCalories:500, minProtein:25', () => {
            const result = extractMacroConstraintsFromText('lean bowl');
            expect(result.maxCalories).toBe(500);
            expect(result.minProtein).toBe(25);
        });
    });

    describe('low-cal-dish patterns', () => {
        it('should parse "low-cal-dish" → maxCalories:500', () => {
            const result = extractMacroConstraintsFromText('low-cal-dish');
            expect(result.maxCalories).toBe(500);
        });

        it('should parse "low-calorie-meal" → maxCalories:500', () => {
            const result = extractMacroConstraintsFromText('low-calorie-meal');
            expect(result.maxCalories).toBe(500);
        });

        it('should parse "low cal dish" (spaces) → maxCalories:500', () => {
            const result = extractMacroConstraintsFromText('low cal dish');
            expect(result.maxCalories).toBe(500);
        });
    });

    describe('low-carb-dish patterns', () => {
        it('should parse "low-carb-dish" → maxCarbs:30', () => {
            const result = extractMacroConstraintsFromText('low-carb-dish');
            expect(result.maxCarbs).toBe(30);
        });

        it('should parse "low-carb-meal" → maxCarbs:30', () => {
            const result = extractMacroConstraintsFromText('low-carb-meal');
            expect(result.maxCarbs).toBe(30);
        });
    });

    describe('low-fat-dish patterns', () => {
        it('should parse "low-fat-dish" → maxFats:20', () => {
            const result = extractMacroConstraintsFromText('low-fat-dish');
            expect(result.maxFats).toBe(20);
        });

        it('should parse "low-fat-meal" → maxFats:20', () => {
            const result = extractMacroConstraintsFromText('low-fat-meal');
            expect(result.maxFats).toBe(20);
        });
    });
});

describe('extractMacroConstraintsFromText — existing numeric patterns (no regression)', () => {
    it('should still parse "high protein" without dish suffix → minProtein:30', () => {
        const result = extractMacroConstraintsFromText('high protein');
        expect(result.minProtein).toBe(30);
    });

    it('should still parse "35g protein" → minProtein:35', () => {
        const result = extractMacroConstraintsFromText('35g protein');
        expect(result.minProtein).toBe(35);
    });

    it('should still parse "at least 40g protein" → minProtein:40', () => {
        const result = extractMacroConstraintsFromText('at least 40g protein');
        expect(result.minProtein).toBe(40);
    });

    it('should still parse "under 500 calories" → maxCalories:500', () => {
        const result = extractMacroConstraintsFromText('under 500 calories');
        expect(result.maxCalories).toBe(500);
    });

    it('should still parse "low calorie" (bare phrase) → maxCalories:500', () => {
        const result = extractMacroConstraintsFromText('low calorie');
        expect(result.maxCalories).toBe(500);
    });

    it('should still parse "low carb" (bare phrase) → maxCarbs:30', () => {
        const result = extractMacroConstraintsFromText('low carb');
        expect(result.maxCarbs).toBe(30);
    });

    it('should return empty for unrelated queries', () => {
        const result = extractMacroConstraintsFromText('chicken sandwich');
        expect(Object.keys(result)).toHaveLength(0);
    });

    it('should return empty for plain "burger"', () => {
        const result = extractMacroConstraintsFromText('burger');
        expect(Object.keys(result)).toHaveLength(0);
    });
});
