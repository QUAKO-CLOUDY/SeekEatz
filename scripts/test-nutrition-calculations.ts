import assert from "node:assert/strict";
import {
  calculateBmr,
  calculateMacroTargets,
  calculateMaintenanceCalories,
  calculateNutritionTargets,
  poundsToKg,
  roundToNearest25,
} from "../lib/nutrition-calculations";

const weightLbs = 200;
const weightKg = poundsToKg(weightLbs);
const heightCm = 70 * 2.54;

const maleBmr = calculateBmr({
  gender: "male",
  age: 30,
  heightCm,
  weightKg,
});

assert.ok(maleBmr > 1500 && maleBmr < 2500);

const maintenance = roundToNearest25(maleBmr * 1.55);
const macros = calculateMacroTargets(maintenance, weightLbs);

assert.equal(macros.proteinG, 160);
assert.ok(macros.fatG > 0);
assert.ok(macros.carbsG > 0);

const targets = calculateNutritionTargets({
  gender: "male",
  age: 30,
  heightFt: 5,
  heightIn: 10,
  weightLbs: 200,
  activityLevel: "moderately-active",
});

assert.equal(targets.maintenanceCalories % 25, 0);
assert.equal(targets.proteinG, 160);

const withoutSteps = calculateNutritionTargets({
  gender: "male",
  age: 30,
  heightFt: 5,
  heightIn: 10,
  weightLbs: 200,
  activityLevel: "moderately-active",
});

const withHighSteps = calculateNutritionTargets({
  gender: "male",
  age: 30,
  heightFt: 5,
  heightIn: 10,
  weightLbs: 200,
  activityLevel: "moderately-active",
  dailyStepsRange: "20000-plus",
});

assert.ok(withHighSteps.maintenanceCalories > withoutSteps.maintenanceCalories);
assert.ok(withHighSteps.maintenanceCalories - withoutSteps.maintenanceCalories <= 150);

const maintenanceWithSteps = calculateMaintenanceCalories(maleBmr, "moderately-active", "20000-plus");
assert.ok(maintenanceWithSteps > roundToNearest25(maleBmr * 1.55));

console.log("nutrition-calculations ok");
