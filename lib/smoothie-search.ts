type MacroConstraintShape = {
  minCalories?: number;
  maxCalories?: number;
  minProtein?: number;
  maxProtein?: number;
  minCarbs?: number;
  maxCarbs?: number;
  minFats?: number;
  maxFats?: number;
  minFat?: number;
  maxFat?: number;
};

const SMOOTHIE_LIKE_PATTERN =
  /\b(smoothie|smoothies|shake|shakes|acai|pitaya|blend|blended)\b/i;

export function isSmoothieLikeText(value: string | null | undefined): boolean {
  if (!value) return false;
  return SMOOTHIE_LIKE_PATTERN.test(value.toLowerCase());
}

export function isSmoothieLikeMenuItem(item: {
  name?: string | null;
  item_name?: string | null;
  category?: string | null;
}): boolean {
  return (
    isSmoothieLikeText(item.name) ||
    isSmoothieLikeText(item.item_name) ||
    isSmoothieLikeText(item.category)
  );
}

export function hasMacroConstraints(constraints: MacroConstraintShape): boolean {
  return [
    constraints.minCalories,
    constraints.maxCalories,
    constraints.minProtein,
    constraints.maxProtein,
    constraints.minCarbs,
    constraints.maxCarbs,
    constraints.minFats,
    constraints.maxFats,
    constraints.minFat,
    constraints.maxFat,
  ].some((value) => typeof value === 'number');
}

export function shouldRandomizeSmoothieResults(input: {
  dishType?: string | null;
  constraints: MacroConstraintShape;
}): boolean {
  return input.dishType === 'smoothie' && !hasMacroConstraints(input.constraints);
}
