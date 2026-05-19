import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { type MacroGoals } from '@/utils/swap-rule-engine';
import {
  filterModifierCandidatesForMeal,
  getLinkedModifierCandidates,
  getModifierCandidates,
  type ModifierCandidate,
} from '@/utils/modifier-candidates';
import { normalizeMacros } from '@/lib/macro-utils';
import { generateHybridSwaps } from '@/utils/hybrid-swap-generator';
import { inferExtendedDishType } from '@/utils/dish-structure';
import { getApplicableSwaps, type SwapLibraryEntry } from '@/utils/global-swap-library';
import { filterCompatibleSwaps } from '@/utils/swap-compatibility-v2';

type SearchableMenuItem = {
  id: string;
  restaurant_name: string;
  name: string;
  category: string | null;
  macros: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    fats?: number;
  } | null;
};

type SwapDelta = {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
};

const ZERO_DELTA: SwapDelta = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fats: 0,
};

const FRIED_LIKE_MEAL_PATTERN = /\b(fried|deep.?fried|crispy|battered|breaded|crunchy|tenders?|tenderloin)\b/i;
const CHICKEN_FINGER_LIKE_PATTERN = /\b(chicken\s*(fingers?|tenders?)|fingers?|tenders?|nuggets?|wings?)\b/i;
const SEAFOOD_OR_POKE_PATTERN =
  /\b(poke|seafood|fish|salmon|tuna|ahi|shrimp|prawn|sashimi|yellowtail|snapper|cod|tilapia|mahi|halibut|trout|eel|crab|lobster|scallop|mussels?|oyster|octopus|calamari)\b/i;
const CHICKEN_PROTEIN_PATTERN = /\b(chicken|grilled chicken|crispy chicken|chicken breast|chicken thigh)\b/i;
const ADD_OR_UPGRADE_PATTERN = /\b(add|extra|double|more|increase)\b/i;
const DISALLOWED_SWAP_PHRASE_PATTERN =
  /\b(dip\s+instead\s+of\s+coating|dry\s+rub\s+instead\s+of\s+sauce)\b/i;
const SAUCE_LIKE_PATTERN = /\b(sauce|dressing|vinaigrette|aioli|dip|spread|condiment|mayo|crema)\b/i;
const REDUCTION_INTENT_PATTERN = /\b(on the side|light|no|skip|without|remove|less)\b/i;
type ProteinFamily =
  | 'chicken'
  | 'beef'
  | 'salmon'
  | 'shrimp'
  | 'tofu'
  | 'pork'
  | 'mixed'
  | 'unknown';

function isSauceLikeCandidate(name: string, relationType?: string): boolean {
  const normalizedRelationType = (relationType || '').toLowerCase();
  return (
    SAUCE_LIKE_PATTERN.test(name) ||
    normalizedRelationType === 'sauce_option' ||
    normalizedRelationType === 'dressing_option'
  );
}

function inferProteinFamilyFromText(value: string): ProteinFamily {
  const normalized = (value || '').toLowerCase();
  if (!normalized) return 'unknown';
  if (/\b(combo|mixed|variety|sampler|surf and turf)\b/.test(normalized)) return 'mixed';
  if (/\b(chicken)\b/.test(normalized)) return 'chicken';
  if (/\b(steak|beef|ribeye|brisket)\b/.test(normalized)) return 'beef';
  if (/\b(salmon)\b/.test(normalized)) return 'salmon';
  if (/\b(shrimp|prawn)\b/.test(normalized)) return 'shrimp';
  if (/\b(tofu)\b/.test(normalized)) return 'tofu';
  if (/\b(pork)\b/.test(normalized)) return 'pork';
  return 'unknown';
}

function areProteinFamiliesCompatible(mealFamily: ProteinFamily, candidateFamily: ProteinFamily): boolean {
  if (mealFamily === 'unknown' || candidateFamily === 'unknown') return true;
  if (mealFamily === 'mixed' || candidateFamily === 'mixed') return true;
  return mealFamily === candidateFamily;
}

function withIfAvailable(label: string): string {
  if (/if available/i.test(label)) return label;
  return `${label} (if available)`;
}

function fallbackEffectFromSwapType(swapType: string): string {
  switch (swapType) {
    case 'higherProtein':
    case 'proteinUp':
      return 'Higher protein';
    case 'lowerCarbs':
    case 'carbDown':
      return 'Lower carbs';
    case 'lowerCalories':
    case 'calorieDown':
      return 'Lower calories';
    case 'fatDown':
      return 'Lower fat';
    default:
      return 'Recommended adjustment';
  }
}

function toNonNumericEffect(effect: string | undefined, fallback: string): string {
  if (!effect || typeof effect !== 'string') return fallback;

  const cleaned = effect
    .replace(/[+\-]?\d+(\.\d+)?\s*(g|cal|kcal)?/gi, '')
    .replace(/[↑↓]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,+/g, ',')
    .replace(/^,\s*|\s*,\s*$/g, '')
    .trim();

  return cleaned.length > 0 ? cleaned : fallback;
}

function isFriedLikeMeal(mealName: string): boolean {
  return FRIED_LIKE_MEAL_PATTERN.test(mealName);
}

function isGrilledInsteadOfFriedSwap(entry: { id?: string; label?: string }): boolean {
  return entry.id === 'cook-grilled' || /grilled instead of fried/i.test(entry.label ?? '');
}

function normalizeGenericEffectText(effect: string): string {
  if (/lighter preparation/i.test(effect)) {
    return 'Less calories';
  }
  return effect;
}

function hasDisallowedSwapPhrase(label: string, details?: string): boolean {
  const haystack = `${label || ''} ${details || ''}`;
  return DISALLOWED_SWAP_PHRASE_PATTERN.test(haystack);
}

function hasExplicitMacroGoals(goals: MacroGoals): boolean {
  return Boolean(
    goals.lowerCalories ||
      goals.higherProtein ||
      goals.lowerCarbs ||
      goals.lowerFat ||
      goals.calorieCap ||
      goals.minProtein ||
      goals.maxCarbs ||
      goals.maxFat
  );
}

function stringHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function rotateByOffset<T>(items: T[], offset: number): T[] {
  if (items.length === 0) return items;
  const normalized = ((offset % items.length) + items.length) % items.length;
  if (normalized === 0) return [...items];
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

function pickPrimaryImpactLabel(impactLabels: string[]): string {
  return impactLabels.find((label) =>
    /protein|calorie|carb|fat|lighter/i.test(label)
  ) ?? impactLabels[0] ?? 'Recommended adjustment';
}

type NonDbMappedSwap = {
  id: string;
  label: string;
  expectedEffect: string;
  estimatedDelta: SwapDelta;
  confidenceLabel: 'Likely available' | 'Ask if available';
  type: 'modify';
  swapType: 'neutral';
  details: string;
  modifierItemIds: string[];
  impactLabels: string[];
  source: 'global' | 'llm';
  deltaMacros: SwapDelta;
};

type DbMappedSwap = {
  id: string;
  label: string;
  expectedEffect: string;
  estimatedDelta: SwapDelta;
  confidenceLabel: 'Likely available' | 'Ask if available';
  type: 'remove' | 'replace' | 'add' | 'modify';
  swapType:
    | 'higherProtein'
    | 'lowerCalories'
    | 'lowerCarbs'
    | 'macroDown'
    | 'macroUp'
    | 'carbDown'
    | 'fatDown'
    | 'proteinUp'
    | 'calorieDown'
    | 'calorieUp'
    | 'neutral';
  details: string;
  modifierItemIds: string[];
  quantityConfig?: {
    unitLabel: string;
    min: number;
    defaultQuantity: number;
    max: number;
  };
  impactLabels: string[];
  source: 'db';
  deltaMacros: SwapDelta;
};

const DEFAULT_DB_QUANTITY_CONFIG: NonNullable<DbMappedSwap['quantityConfig']> = {
  unitLabel: 'portion',
  min: 1,
  defaultQuantity: 1,
  max: 1,
};

function formatDeltaMacroSummary(delta: SwapDelta): string {
  const parts: string[] = [];
  const calories = Math.round(delta.calories);
  const protein = Math.round(delta.protein);
  const carbs = Math.round(delta.carbs);
  const fats = Math.round(delta.fats);

  if (calories !== 0) parts.push(`${calories > 0 ? '+' : ''}${calories} cal`);
  if (protein !== 0) parts.push(`${protein > 0 ? '+' : ''}${protein}g protein`);
  if (carbs !== 0) parts.push(`${carbs > 0 ? '+' : ''}${carbs}g carbs`);
  if (fats !== 0) parts.push(`${fats > 0 ? '+' : ''}${fats}g fat`);

  return parts.length > 0 ? parts.join(', ') : 'No macro change';
}

function buildDbExpectedEffect(
  effect: string | undefined,
  fallback: string,
  delta: SwapDelta
): string {
  const base = toNonNumericEffect(effect, fallback);
  const macroSummary = formatDeltaMacroSummary(delta);
  return `${base} - ${macroSummary}`;
}

function buildAddLabel(name: string): string {
  return /^add\b/i.test(name) ? name : `Add ${name}`;
}

function normalizeSwapMatchText(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/\(if available\)/gi, ' ')
    .replace(/\b(please|can|you|try|would|like)\b/g, ' ')
    .replace(/\b(add|extra|swap|replace|with|for|instead|of|remove|skip|light|go light on|no)\b/g, ' ')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTokenSet(value: string): Set<string> {
  return new Set(
    normalizeSwapMatchText(value)
      .split(' ')
      .filter((token) => token.length >= 2)
  );
}

function tokenOverlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap / Math.max(a.size, b.size);
}

function findBestModifierCandidateForSwapLabel(
  label: string,
  modifierCandidates: ModifierCandidate[]
): ModifierCandidate | null {
  const normalizedLabel = normalizeSwapMatchText(label);
  if (!normalizedLabel) return null;

  const labelTokens = toTokenSet(normalizedLabel);
  let best: { candidate: ModifierCandidate; score: number } | null = null;

  for (const candidate of modifierCandidates) {
    const normalizedCandidate = normalizeSwapMatchText(candidate.name || '');
    if (!normalizedCandidate) continue;
    const candidateName = (candidate.name || '').toLowerCase();
    const relationType = (candidate.relationType || '').toLowerCase();
    const candidateIsSauceLike = isSauceLikeCandidate(candidateName, relationType);
    const labelHintsSauceLike = SAUCE_LIKE_PATTERN.test(normalizedLabel);
    if (candidateIsSauceLike && !labelHintsSauceLike) {
      continue;
    }

    let score = 0;
    if (normalizedLabel === normalizedCandidate) {
      score += 1.5;
    }
    if (
      normalizedLabel.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedLabel)
    ) {
      score += 1.0;
    }
    score += tokenOverlapScore(labelTokens, toTokenSet(normalizedCandidate));

    if (relationType === 'protein_option') score += 0.35;
    if (relationType === 'add_on') score += 0.25;

    if (!best || score > best.score) {
      best = { candidate, score };
    }
  }

  return best && best.score >= 0.85 ? best.candidate : null;
}

function inferDbSwapTypeFromDelta(delta: SwapDelta): DbMappedSwap['swapType'] {
  if (delta.protein >= 8) return 'higherProtein';
  if (delta.calories <= -40) return 'lowerCalories';
  if (delta.carbs <= -8) return 'lowerCarbs';
  if (delta.fats <= -5) return 'fatDown';
  return 'neutral';
}

function promoteNonDbSwapToDb(
  swap: NonDbMappedSwap,
  modifierCandidates: ModifierCandidate[]
): DbMappedSwap | null {
  const matchedCandidate = findBestModifierCandidateForSwapLabel(swap.label, modifierCandidates);
  if (!matchedCandidate) {
    return null;
  }

  const candidateName = matchedCandidate.name || '';
  const lowerLabel = (swap.label || '').toLowerCase();
  const relationType = (matchedCandidate.relationType || '').toLowerCase();
  const candidateIsSauceLike =
    SAUCE_LIKE_PATTERN.test(candidateName.toLowerCase()) ||
    relationType === 'sauce_option' ||
    relationType === 'dressing_option';
  const hasReductionIntent = REDUCTION_INTENT_PATTERN.test(lowerLabel);
  const shouldTreatAsReduction = candidateIsSauceLike && hasReductionIntent;

  const signed = (value: number) => {
    if (!shouldTreatAsReduction) return value;
    return value === 0 ? 0 : -Math.max(1, Math.round(Math.abs(value) * 0.75));
  };

  const delta: SwapDelta = {
    calories: signed(matchedCandidate.macros.calories),
    protein: signed(matchedCandidate.macros.protein),
    carbs: signed(matchedCandidate.macros.carbs),
    fats: signed(matchedCandidate.macros.fats),
  };

  const inferredSwapType = inferDbSwapTypeFromDelta(delta);
  const promotedLabel = shouldTreatAsReduction
    ? /on the side/.test(lowerLabel)
      ? `Get ${candidateName} on the side`
      : /light/.test(lowerLabel)
        ? `Go light on ${candidateName}`
        : `Skip ${candidateName}`
    : /^add\b/i.test(swap.label)
      ? swap.label
      : buildAddLabel(candidateName);

  return {
    id: `db-promoted-${matchedCandidate.id}-${swap.id}`,
    label: promotedLabel,
    expectedEffect: buildDbExpectedEffect(
      swap.expectedEffect,
      fallbackEffectFromSwapType(inferredSwapType),
      delta
    ),
    estimatedDelta: delta,
    confidenceLabel: 'Likely available',
    type: shouldTreatAsReduction ? 'remove' : 'add',
    swapType: inferredSwapType,
    details: `${swap.details} Matched to restaurant modifier data.`,
    modifierItemIds: [matchedCandidate.id],
    quantityConfig: getCandidateQuantityConfig(matchedCandidate),
    impactLabels: [...(swap.impactLabels || []), 'db_promoted'],
    source: 'db',
    deltaMacros: delta,
  };
}

function getCandidateQuantityConfig(candidate: ModifierCandidate): DbMappedSwap['quantityConfig'] | undefined {
  if (!candidate.unitLabel) {
    return undefined;
  }

  const max = Math.max(1, Number(candidate.maxQuantity ?? 1));
  const min = Math.max(1, Number(candidate.minQuantity ?? 1));
  const defaultQuantity = Math.max(min, Number(candidate.defaultQuantity ?? min));

  if (max <= 1 && defaultQuantity <= 1) {
    return undefined;
  }

  return {
    unitLabel: candidate.unitLabel,
    min,
    defaultQuantity,
    max,
  };
}

function normalizeModifierId(value: string | number): string {
  return String(value).trim();
}

function ensureDbQuantityConfig(
  explicitConfig: DbMappedSwap['quantityConfig'],
  modifierItemIds: string[],
  modifierById: Map<string, ModifierCandidate>
): NonNullable<DbMappedSwap['quantityConfig']> {
  if (explicitConfig) {
    const min = Math.max(1, Number(explicitConfig.min ?? DEFAULT_DB_QUANTITY_CONFIG.min));
    const defaultQuantity = Math.max(
      min,
      Number(explicitConfig.defaultQuantity ?? explicitConfig.min ?? DEFAULT_DB_QUANTITY_CONFIG.defaultQuantity)
    );
    const max = Math.max(defaultQuantity, Number(explicitConfig.max ?? defaultQuantity));

    return {
      unitLabel: explicitConfig.unitLabel || DEFAULT_DB_QUANTITY_CONFIG.unitLabel,
      min,
      defaultQuantity,
      max,
    };
  }

  const firstModifierId = modifierItemIds[0];
  const candidate = firstModifierId ? modifierById.get(normalizeModifierId(firstModifierId)) : undefined;
  const candidateConfig = candidate ? getCandidateQuantityConfig(candidate) : undefined;
  if (candidateConfig) {
    return candidateConfig;
  }

  return DEFAULT_DB_QUANTITY_CONFIG;
}

function scoreSupplementalDbCandidate(
  candidate: ModifierCandidate,
  goals: MacroGoals
): number {
  let score = 0;
  const relationType = (candidate.relationType || '').toLowerCase();
  const groupName = (candidate.groupName || '').toLowerCase();

  if (relationType === 'protein_option') score += 40;
  if (relationType === 'add_on') score += 28;
  if (relationType === 'side_option') score += 14;
  if (/\bprotein\b/.test(groupName)) score += 14;
  if (/\badd\b/.test(groupName)) score += 10;

  score += candidate.macros.protein * 2.2;
  score -= candidate.macros.calories / 22;

  if (goals.higherProtein || goals.minProtein) {
    score += candidate.macros.protein * 3.2;
  }
  if (goals.lowerCalories) {
    score -= candidate.macros.calories / 12;
  }
  if (goals.lowerCarbs) {
    score -= candidate.macros.carbs * 1.4;
  }
  if (goals.lowerFat) {
    score -= candidate.macros.fats * 1.4;
  }

  return score;
}

function buildSupplementalDbSwaps(
  modifierCandidates: ModifierCandidate[],
  existingDbMods: DbMappedSwap[],
  goals: MacroGoals,
  maxCount: number,
  mealProteinFamily: ProteinFamily
): DbMappedSwap[] {
  const usedModifierIds = new Set(existingDbMods.flatMap((mod) => mod.modifierItemIds));

  const candidates = modifierCandidates
    .filter((candidate) => !usedModifierIds.has(candidate.id))
    .filter((candidate) => candidate.macros.calories >= 0)
    .filter((candidate) => {
      const relationType = (candidate.relationType || '').toLowerCase();
      const groupName = (candidate.groupName || '').toLowerCase();
      const category = (candidate.category || '').toLowerCase();

      const modifierLike =
        /\b(protein|add|side|sauce|dressing)\b/.test(relationType) ||
        /\b(protein|add|side|sauce|dressing)\b/.test(groupName) ||
        /\b(add|addon|add-on|protein|side|modifier|ingredient|extra|sauce|dressing|condiment)\b/.test(category);

      if (!modifierLike) return false;
      if (candidate.macros.calories > 450 && !/\b(protein|add|side|sauce|dressing)\b/.test(relationType)) return false;
      const candidateProteinFamily = inferProteinFamilyFromText(candidate.name || '');
      const proteinLikeCandidate = relationType === 'protein_option' || /\b(add|protein)\b/.test(relationType);
      if (
        proteinLikeCandidate &&
        mealProteinFamily !== 'unknown' &&
        candidateProteinFamily !== 'unknown' &&
        !areProteinFamiliesCompatible(mealProteinFamily, candidateProteinFamily)
      ) {
        return false;
      }
      return true;
    })
    .map((candidate) => ({
      candidate,
      score: scoreSupplementalDbCandidate(candidate, goals),
    }))
    .sort((a, b) => b.score - a.score);

  const selected: DbMappedSwap[] = [];
  const seenLabels = new Set<string>();

  for (const { candidate } of candidates) {
    if (selected.length >= maxCount) {
      break;
    }

    const candidateIsSauceLike = isSauceLikeCandidate(candidate.name.toLowerCase(), candidate.relationType);
    const signed = (value: number) =>
      candidateIsSauceLike ? (value === 0 ? 0 : -Math.max(1, Math.round(Math.abs(value) * 0.75))) : value;

    const delta: SwapDelta = {
      calories: signed(candidate.macros.calories),
      protein: signed(candidate.macros.protein),
      carbs: signed(candidate.macros.carbs),
      fats: signed(candidate.macros.fats),
    };
    const inferredSwapType = inferDbSwapTypeFromDelta(delta);
    const label = candidateIsSauceLike ? `Go light on ${candidate.name}` : buildAddLabel(candidate.name);
    const labelKey = label.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!labelKey || seenLabels.has(labelKey)) {
      continue;
    }
    seenLabels.add(labelKey);

    selected.push({
      id: `db-addon-${candidate.id}`,
      label,
      expectedEffect: buildDbExpectedEffect(
        undefined,
        candidateIsSauceLike
          ? 'Lower calories by reducing sauce'
          : candidate.macros.protein > 0
            ? 'Higher protein add-on'
            : 'Modifier add-on',
        delta
      ),
      estimatedDelta: delta,
      confidenceLabel: 'Likely available',
      type: candidateIsSauceLike ? 'remove' : 'add',
      swapType: inferredSwapType,
      details: candidateIsSauceLike
        ? `Reduce ${candidate.name} using restaurant modifier data`
        : `Add ${candidate.name} using restaurant modifier data`,
      modifierItemIds: [candidate.id],
      quantityConfig: getCandidateQuantityConfig(candidate),
      impactLabels: ['db_modifier'],
      source: 'db',
      deltaMacros: delta,
    });
  }

  return selected;
}

function mapHybridGlobalSwap(
  entry: {
    id: string;
    label: string;
    impactLabels: string[];
    details: string;
    estimatedDelta: SwapDelta;
    impactType?: 'deterministic' | 'heuristic';
  },
  index: number
): NonDbMappedSwap {
  const fallbackEffect = pickPrimaryImpactLabel(entry.impactLabels);
  return {
    id: `hybrid-global-${entry.id || index}`,
    label: withIfAvailable(entry.label),
    expectedEffect: normalizeGenericEffectText(toNonNumericEffect(fallbackEffect, 'Recommended adjustment')),
    estimatedDelta: entry.estimatedDelta ?? ZERO_DELTA,
    confidenceLabel: entry.impactType === 'deterministic' ? 'Likely available' : 'Ask if available',
    type: 'modify',
    swapType: 'neutral',
    details: entry.details || 'Global swap recommendation for this dish type.',
    modifierItemIds: [],
    impactLabels: entry.impactLabels ?? [],
    source: 'global',
    deltaMacros: entry.estimatedDelta ?? ZERO_DELTA,
  };
}

function mapHybridLlmSwap(
  entry: {
    id: string;
    label: string;
    impactLabels: string[];
    details: string;
    estimatedDelta: SwapDelta;
  },
  index: number
): NonDbMappedSwap {
  const fallbackEffect = pickPrimaryImpactLabel(entry.impactLabels);
  return {
    id: `hybrid-llm-${entry.id || index}`,
    label: withIfAvailable(entry.label),
    expectedEffect: normalizeGenericEffectText(toNonNumericEffect(fallbackEffect, 'Recommended adjustment')),
    estimatedDelta: entry.estimatedDelta ?? ZERO_DELTA,
    confidenceLabel: 'Ask if available',
    type: 'modify',
    swapType: 'neutral',
    details: entry.details || 'LLM-generated swap suggestion.',
    modifierItemIds: [],
    impactLabels: entry.impactLabels ?? [],
    source: 'llm',
    deltaMacros: entry.estimatedDelta ?? ZERO_DELTA,
  };
}

function scoreNonDbSwapCandidate(
  swap: NonDbMappedSwap,
  mealName: string,
  goals: MacroGoals,
  mealMacros: SwapDelta
): number {
  let score = 0;
  const lowerLabel = (swap.label || '').toLowerCase();
  const lowerMealName = (mealName || '').toLowerCase();
  const friedLikeMeal = isFriedLikeMeal(mealName);
  const chickenFingerLikeMeal = CHICKEN_FINGER_LIKE_PATTERN.test(lowerMealName);
  const hasExplicitGoals = hasExplicitMacroGoals(goals);

  if (swap.source === 'global') score += 30;
  if (swap.source === 'llm') score += 10;

  const grilledStyleSwap =
    /\b(grilled instead of fried|baked instead of fried|no breading)\b/.test(lowerLabel);
  if (grilledStyleSwap && friedLikeMeal) {
    score += 220;
  }
  if (grilledStyleSwap && chickenFingerLikeMeal) {
    score += 180;
  }

  if (/\b(sauce on the side|no sauce|light sauce|half bun|lettuce wrap|side salad instead of fries)\b/.test(lowerLabel)) {
    score += 45;
  }

  if (goals.higherProtein && swap.deltaMacros.protein > 0) score += 60;
  if (goals.lowerCalories && swap.deltaMacros.calories < 0) score += 60;
  if (goals.lowerCarbs && swap.deltaMacros.carbs < 0) score += 45;
  if (goals.lowerFat && swap.deltaMacros.fats < 0) score += 45;

  if (!goals.higherProtein && swap.deltaMacros.calories > 0) {
    score -= Math.min(45, Math.round(swap.deltaMacros.calories / 10));
  }

  if (swap.deltaMacros.calories < 0) {
    score += Math.min(40, Math.round(Math.abs(swap.deltaMacros.calories) / 12));
  }

  if (!hasExplicitGoals) {
    if (mealMacros.protein >= 55 && swap.deltaMacros.protein > 0) {
      score -= 90;
    }
    if (mealMacros.calories >= 850 && swap.deltaMacros.calories > 0) {
      score -= 75;
    }
    if (mealMacros.carbs >= 90 && swap.deltaMacros.carbs > 0) {
      score -= 35;
    }
    if (mealMacros.fats >= 45 && swap.deltaMacros.fats > 0) {
      score -= 35;
    }
  }

  return score;
}

function dedupeSwapsByLabel<T extends { label: string }>(swaps: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const swap of swaps) {
    const key = (swap.label || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(swap);
  }
  return deduped;
}

function isSeafoodOrPokeMeal(mealName: string): boolean {
  return SEAFOOD_OR_POKE_PATTERN.test((mealName || '').toLowerCase());
}

function shouldBlockChickenProteinSwapForMeal(
  mealName: string,
  swap: { type?: string; label?: string; swapType?: string; modifierItemIds?: string[] },
  modifierById: Map<string, ModifierCandidate>
): boolean {
  if (!isSeafoodOrPokeMeal(mealName)) return false;

  const label = (swap.label || '').toLowerCase();
  const isChickenLabel = CHICKEN_PROTEIN_PATTERN.test(label);

  let isChickenModifier = false;
  if (Array.isArray(swap.modifierItemIds)) {
    for (const id of swap.modifierItemIds) {
      const candidate = modifierById.get(normalizeModifierId(id));
      const candidateName = (candidate?.name || '').toLowerCase();
      if (CHICKEN_PROTEIN_PATTERN.test(candidateName)) {
        isChickenModifier = true;
        break;
      }
    }
  }

  if (!isChickenLabel && !isChickenModifier) return false;

  const type = (swap.type || '').toLowerCase();
  const swapType = (swap.swapType || '').toLowerCase();
  const looksLikeProteinIncrease =
    type === 'add' ||
    swapType === 'higherprotein' ||
    swapType === 'proteinup' ||
    ADD_OR_UPGRADE_PATTERN.test(label);

  return looksLikeProteinIncrease;
}

function scoreDbFinalSwap(
  swap: DbMappedSwap,
  modifierById: Map<string, ModifierCandidate>,
  goals: MacroGoals,
  mealMacros: SwapDelta,
  mealProteinFamily: ProteinFamily
): number {
  let score = 0;
  const hasExplicitGoals = hasExplicitMacroGoals(goals);

  if (swap.type === 'add') score += 24;
  if (swap.swapType === 'higherProtein' || swap.swapType === 'proteinUp') score += 18;
  if (swap.swapType === 'lowerCalories' || swap.swapType === 'calorieDown') score += 14;
  if (swap.swapType === 'lowerCarbs' || swap.swapType === 'carbDown') score += 12;
  if (swap.swapType === 'fatDown') score += 10;

  if (!hasExplicitGoals) {
    if (swap.type === 'remove') score += 18;
    if (swap.deltaMacros.calories < 0) score += 14;
    if (mealMacros.calories >= 850 && swap.deltaMacros.calories > 0) score -= 45;
    if (mealMacros.protein >= 55 && swap.deltaMacros.protein > 0) score -= 50;
    if (mealMacros.carbs >= 90 && swap.deltaMacros.carbs > 0) score -= 18;
    if (mealMacros.fats >= 45 && swap.deltaMacros.fats > 0) score -= 18;
  }

  if (goals.higherProtein || goals.minProtein) {
    score += Math.max(0, swap.deltaMacros.protein) * 2.8;
  }
  if (goals.lowerCalories || goals.calorieCap) {
    score += Math.max(0, -swap.deltaMacros.calories) / 8;
    if (swap.deltaMacros.calories > 240) score -= 22;
  }
  if (goals.lowerCarbs || goals.maxCarbs) {
    score += Math.max(0, -swap.deltaMacros.carbs) * 1.8;
  }
  if (goals.lowerFat || goals.maxFat) {
    score += Math.max(0, -swap.deltaMacros.fats) * 1.8;
  }

  const primaryModifierId = swap.modifierItemIds[0];
  if (primaryModifierId && modifierById.has(primaryModifierId)) {
    const primaryModifier = modifierById.get(primaryModifierId);
    const relationType = (primaryModifier?.relationType || '').toLowerCase();
    const modifierName = (primaryModifier?.name || '').toLowerCase();
    if (relationType === 'protein_option') score += 14;
    if (relationType === 'add_on') score += 10;
    if (relationType === 'side_option') score += 6;
    if (swap.type === 'add' && SAUCE_LIKE_PATTERN.test(modifierName)) score -= 60;
    const candidateProteinFamily = inferProteinFamilyFromText(modifierName);
    const proteinLikeCandidate = relationType === 'protein_option' || /\b(add|protein)\b/.test(relationType);
    if (proteinLikeCandidate && mealProteinFamily !== 'unknown' && candidateProteinFamily !== 'unknown') {
      if (areProteinFamiliesCompatible(mealProteinFamily, candidateProteinFamily)) {
        score += 34;
      } else {
        score -= 72;
      }
    }
  }

  return score;
}

function buildFallbackPoolForDish(dishType: string, mealName: string) {
  const includeGrilledSwap = dishType !== 'burger' && isFriedLikeMeal(mealName);

  if (dishType === 'breakfast' || dishType === 'breakfast_plate') {
    return [
      { id: 'fallback-breakfast-eggs', label: 'Egg whites instead of whole eggs', effect: 'Lighter protein choice' },
      { id: 'fallback-breakfast-fruit', label: 'Fruit instead of hash browns', effect: 'Lighter side option' },
      { id: 'fallback-breakfast-syrup', label: 'No syrup', effect: 'Lower added sugar' },
    ];
  }

  if (dishType === 'smoothie') {
    return [
      { id: 'fallback-smoothie-base', label: 'Unsweetened base instead of juice', effect: 'Lower added sugar' },
      { id: 'fallback-smoothie-size', label: 'Smaller size', effect: 'Lighter portion' },
      { id: 'fallback-smoothie-addin', label: 'Skip sugary add-ins', effect: 'Lighter ingredient mix' },
    ];
  }

  if (dishType === 'salad' || dishType === 'pasta' || dishType === 'pizza' || dishType === 'bowl') {
    const swaps = [
      { id: 'fallback-dressing-side', label: 'Dressing on the side', effect: 'Lighter sauce usage' },
      { id: 'fallback-half-portion', label: 'Half portion', effect: 'Lighter portion' },
      { id: 'fallback-veggie-swap', label: 'Extra veggies instead of dense add-ons', effect: 'Lighter ingredient swap' },
    ];
    if (includeGrilledSwap) {
      swaps.push({ id: 'fallback-grilled', label: 'Grilled instead of fried', effect: 'Less calories' });
    }
    return swaps;
  }

  if (dishType === 'burger') {
    return [
      { id: 'fallback-burger-half-bun', label: 'Half bun / open faced', effect: 'Lower carbs' },
      { id: 'fallback-burger-sauce-side', label: 'Sauce on the side', effect: 'Lighter sauce usage' },
      { id: 'fallback-burger-no-glaze', label: 'No sauce / no glaze', effect: 'Less calories' },
      { id: 'fallback-burger-side', label: 'Side salad instead of fries', effect: 'Lighter side option' },
    ];
  }

  const swaps = [
    { id: 'fallback-sauce-side', label: 'Sauce on the side', effect: 'Lighter sauce usage' },
    { id: 'fallback-side', label: 'Side salad instead of fries', effect: 'Lighter side option' },
  ];
  if (includeGrilledSwap) {
    swaps.push({ id: 'fallback-grilled', label: 'Grilled instead of fried', effect: 'Less calories' });
  }
  return swaps;
}

function mapGenericSwap(entry: { id: string; label: string; effect: string; details?: string }) {
  return {
    id: `generic-${entry.id}`,
    label: withIfAvailable(entry.label),
    expectedEffect: normalizeGenericEffectText(entry.effect),
    estimatedDelta: ZERO_DELTA,
    confidenceLabel: 'Ask if available' as const,
    type: 'modify' as const,
    swapType: 'neutral' as const,
    details: entry.details ?? 'General swap recommendation when restaurant-specific modifiers are unavailable.',
    modifierItemIds: [] as string[],
    impactLabels: ['Recommended adjustment'],
    source: 'global' as const,
    deltaMacros: ZERO_DELTA,
  };
}

function buildDishAwareGenericSwaps(mealName: string, restaurantName: string, maxSwaps: number) {
  const dishType = inferExtendedDishType(mealName);
  const candidateEntries = filterCompatibleSwaps(
    getApplicableSwaps(dishType),
    dishType,
    mealName
  ).filter((entry) => {
    if (dishType === 'burger' && isGrilledInsteadOfFriedSwap(entry)) {
      return false;
    }
    if (isGrilledInsteadOfFriedSwap(entry) && !isFriedLikeMeal(mealName)) {
      return false;
    }
    return true;
  });

  const rotationWindow = Math.floor(Date.now() / (1000 * 60 * 60 * 3)); // rotate every 3 hours
  const rotationSeed = `${restaurantName}|${mealName}|${rotationWindow}`;
  const rotatedCandidates = rotateByOffset(candidateEntries, stringHash(rotationSeed));

  const selected: SwapLibraryEntry[] = [];
  const usedCategories = new Set<string>();
  for (const entry of rotatedCandidates) {
    if (usedCategories.has(entry.category)) continue;
    usedCategories.add(entry.category);
    selected.push(entry);
    if (selected.length >= maxSwaps) break;
  }

  if (selected.length > 0) {
    return selected.map((entry) =>
      mapGenericSwap({
        id: entry.id,
        label: entry.label,
        effect: toNonNumericEffect(pickPrimaryImpactLabel(entry.impactLabels), 'Recommended adjustment'),
        details: entry.details,
      })
    );
  }

  const rotatedFallback = rotateByOffset(
    buildFallbackPoolForDish(dishType, mealName),
    stringHash(rotationSeed)
  ).slice(0, maxSwaps);

  return rotatedFallback.map((entry) => mapGenericSwap(entry));
}

/**
 * Swap endpoint v2: Hybrid Swap Engine
 * Returns modification suggestions (DB-backed + global + LLM fallback) and alternative menu items.
 * 
 * Response format:
 * {
 *   modifications: [...],  // Mixed DB + global + LLM swap suggestions
 *   alternatives: [...],   // DB-only alternate menu items (fallback)
 *   source: 'db' | 'global' | 'llm' | 'mixed'
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { restaurant_name, meal_id, meal_name, meal_macros, calorieCap, minProtein, maxCarbs, maxFat } = body;

    if (!restaurant_name) {
      return NextResponse.json(
        { error: 'restaurant_name is required' },
        { status: 400 }
      );
    }

    if (!meal_name) {
      return NextResponse.json(
        { error: 'meal_name is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // ========== PRIMARY: Hybrid Swap Engine v2 ==========
    // Step 1: Fetch modifier candidates from DB
    // Prefer explicit meal relations. Fall back to restaurant-wide inference only if no links exist.
    const linkedModifierCandidates = await getLinkedModifierCandidates(supabase, meal_id);
    const restaurantModifierCandidates = await getModifierCandidates(supabase, restaurant_name);
    const filteredRestaurantModifierCandidates = filterModifierCandidatesForMeal(meal_name, restaurantModifierCandidates);
    const modifierCandidateMap = new Map<string, ModifierCandidate>();
    for (const candidate of linkedModifierCandidates) {
      modifierCandidateMap.set(candidate.id, candidate);
    }
    for (const candidate of filteredRestaurantModifierCandidates) {
      if (!modifierCandidateMap.has(candidate.id)) {
        modifierCandidateMap.set(candidate.id, candidate);
      }
    }
    const modifierCandidates = Array.from(modifierCandidateMap.values());

    // Log in dev
    if (process.env.NODE_ENV === 'development') {
      console.log('[swaps] Modifier candidates:', {
        restaurant_name,
        meal_id,
        meal_name,
        linkedCount: linkedModifierCandidates.length,
        restaurantWideCount: restaurantModifierCandidates.length,
        mealScopedCount: filteredRestaurantModifierCandidates.length,
        finalCount: modifierCandidates.length,
        source: linkedModifierCandidates.length > 0 ? 'relations' : 'restaurant_fallback',
        sampleNames: modifierCandidates.slice(0, 5).map(c => c.name),
      });
    }

    // Convert user_goals and constraints to MacroGoals format
    // Normalize fat: prefer fat (singular) from DB, fallback to fats (plural)
    const mealFat = meal_macros?.fat ?? meal_macros?.fats ?? 0;

    const macroGoals: MacroGoals = {
      lowerCalories: calorieCap ? (meal_macros?.calories || 0) > calorieCap : undefined,
      higherProtein: minProtein ? (meal_macros?.protein || 0) < minProtein : undefined,
      lowerCarbs: maxCarbs ? (meal_macros?.carbs || 0) > maxCarbs : undefined,
      lowerFat: maxFat ? mealFat > maxFat : undefined,
      calorieCap,
      minProtein,
      maxCarbs,
      maxFat,
    };

    // Normalize meal macros for hybrid engine
    const normalizedMealMacros = normalizeMacros(meal_macros) ?? {
      calories: meal_macros?.calories || 0,
      protein: meal_macros?.protein || 0,
      carbs: meal_macros?.carbs || 0,
      fats: mealFat,
    };
    const mealProteinFamily = inferProteinFamilyFromText(meal_name);

    // Generate modifications using Hybrid Swap Engine v2
    const hybridResult = await generateHybridSwaps(
      meal_name,
      normalizedMealMacros,
      macroGoals,
      restaurant_name,
      modifierCandidates
    );

    // Extract DB-backed modifications
    const modifications = hybridResult.modifications;

    // Validate DB-backed modifications (dev-only assertion)
    if (process.env.NODE_ENV === 'development') {
      const validModifications = modifications.filter(mod => {
        if (!mod.modifierItemIds || mod.modifierItemIds.length === 0) {
          console.warn('[swaps] Modification missing modifierItemIds:', mod.id);
          return false;
        }
        const allIdsValid = mod.modifierItemIds.every(id =>
          modifierCandidates.some(candidate => candidate.id === id)
        );
        if (!allIdsValid) {
          console.warn('[swaps] Modification has invalid modifierItemIds:', mod.id, mod.modifierItemIds);
          return false;
        }
        const delta = mod.estimatedDelta;
        if (isNaN(delta.calories) || isNaN(delta.protein) || isNaN(delta.carbs) || isNaN(delta.fats)) {
          console.warn('[swaps] Modification has NaN in deltaMacros:', mod.id, delta);
          return false;
        }
        return true;
      });

      if (validModifications.length !== modifications.length) {
        const invalidCount = modifications.length - validModifications.length;
        console.error(`[swaps] CRITICAL: ${invalidCount} DB modification(s) failed validation!`);
        throw new Error(`[swaps] ${invalidCount} modification(s) failed validation`);
      }
    }

    // ========== SECONDARY: Find DB-only alternate menu items ==========
    // Alternatives are ONLY returned as fallback when no good modifications exist
    // Alternatives must be: same restaurant, same dish type, and move toward user's constraints
    const alternatives: Array<{
      id: string;
      name: string;
      restaurant: string;
      calories: number;
      protein: number;
      carbs: number;
      fats: number;
    }> = [];

    // Only fetch alternatives if we have NO modifications AND no global/LLM swaps
    // Modifications + global swaps are always preferred over alternatives
    const totalHybridSwaps = modifications.length + hybridResult.globalSwaps.length + hybridResult.llmSwaps.length;
    const shouldFetchAlternatives = totalHybridSwaps === 0;

    // Only fetch alternatives if we have no modifications
    if (shouldFetchAlternatives) {
      // Fetch all menu items from the same restaurant
      const { data: allItems, error } = await supabase
        .from('menu_items')
        .select(`
          id,
          restaurant_name,
          name,
          category,
          macros
        `)
        .eq('restaurant_name', restaurant_name);

      if (!error && allItems) {
        // Filter to only full meals (not modifiers)
        // No dish type filtering - we just filter by constraints and exclude current meal
        const fullMeals = (allItems as SearchableMenuItem[]).filter((item) => {
          // Must have valid macros
          const macros = item.macros;
          if (!macros || typeof macros !== 'object') return false;

          const calories = typeof macros.calories === 'number' ? macros.calories : null;
          if (calories === null || calories < 150 || isNaN(calories)) return false; // Must be a real meal

          // Exclude the current meal
          if (meal_id && item.id === meal_id) return false;

          // Apply constraints if provided (alternatives must move toward user's constraints)
          // Normalize fat: prefer fat (singular) from DB, fallback to fats (plural)
          const itemFat = macros.fat ?? macros.fats ?? 0;

          if (calorieCap && calories > calorieCap) return false;
          if (minProtein && (macros.protein || 0) < minProtein) return false;
          if (maxCarbs && (macros.carbs || 0) > maxCarbs) return false;
          if (maxFat && itemFat > maxFat) return false;

          return true;
        });

        // Convert to alternative format (limit to 3-5)
        // Normalize fat: prefer fat (singular) from DB, fallback to fats (plural)
        // Meal object uses fats (plural) to match Meal type
        alternatives.push(...fullMeals.slice(0, 5).map((item) => {
          const itemFat = item.macros?.fat ?? item.macros?.fats ?? 0;
          return {
            id: item.id,
            name: item.name,
            restaurant: restaurant_name,
            calories: item.macros?.calories || 0,
            protein: item.macros?.protein || 0,
            carbs: item.macros?.carbs || 0,
            fats: itemFat, // Use "fats" (plural) to match Meal type
          };
        }));
      }
    }

    // ========== Map all swap types to unified response format ==========

    const modifierById = new Map(
      modifierCandidates.map((candidate) => [normalizeModifierId(candidate.id), candidate])
    );

    // 1. Map DB-backed modifications (existing shape)
    const mappedDBMods: DbMappedSwap[] = modifications.map((mod, index) => {
      const normalizedModifierItemIds = (mod.modifierItemIds || []).map((id) => normalizeModifierId(id));

      return {
        id: mod.id || `mod-${index}`,
        label: mod.swapTitle,
        expectedEffect: buildDbExpectedEffect(
          mod.expectedEffect,
          fallbackEffectFromSwapType(mod.swapType),
          mod.estimatedDelta
        ),
        estimatedDelta: mod.estimatedDelta,
        confidenceLabel: mod.confidenceLabel,
        type: mod.type,
        swapType: mod.swapType,
        details: mod.details,
        modifierItemIds: normalizedModifierItemIds,
        quantityConfig: ensureDbQuantityConfig(mod.quantityConfig, normalizedModifierItemIds, modifierById),
        impactLabels: [] as string[],
        source: 'db' as const,
        deltaMacros: {
          calories: mod.estimatedDelta.calories,
          protein: mod.estimatedDelta.protein,
          carbs: mod.estimatedDelta.carbs,
          fats: mod.estimatedDelta.fats,
        },
      };
    }).filter((mod) => !hasDisallowedSwapPhrase(mod.label, mod.details));

    // Final validation for DB mods (production-safe)
    const validDBMods = mappedDBMods.filter(mod => {
      if (!mod.modifierItemIds || mod.modifierItemIds.length === 0) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[swaps] Filtered out DB modification with no modifierItemIds:', mod.id);
        }
        return false;
      }
      const allIdsValid = mod.modifierItemIds.every((id) => modifierById.has(normalizeModifierId(id)));
      if (!allIdsValid) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[swaps] Filtered out DB modification with invalid modifierItemIds:', mod.id, mod.modifierItemIds);
        }
        return false;
      }
      return true;
    });

    const proteinGuardedDbMods = validDBMods.filter(
      (swap) => !shouldBlockChickenProteinSwapForMeal(meal_name, swap, modifierById)
    );

    // If DB-backed swaps exist, they are always the only swaps returned.
    // If none exist, use hybrid global/LLM swaps first, then fill with dish-aware generic fallbacks.
    const MAX_FINAL_SWAPS = 3;
    const mappedHybridGlobal = hybridResult.globalSwaps
      .map((swap, index) => mapHybridGlobalSwap(swap, index))
      .filter((swap) => !hasDisallowedSwapPhrase(swap.label, swap.details));
    const mappedHybridLlm = hybridResult.llmSwaps
      .map((swap, index) => mapHybridLlmSwap(swap, index))
      .filter((swap) => !hasDisallowedSwapPhrase(swap.label, swap.details));

    const promotedHybridDbSwaps: DbMappedSwap[] = [];
    const proteinGuardedRemainingHybridNonDb: NonDbMappedSwap[] = [];
    for (const swap of [...mappedHybridGlobal, ...mappedHybridLlm]) {
      const promoted = promoteNonDbSwapToDb(swap, modifierCandidates);
      if (promoted && !hasDisallowedSwapPhrase(promoted.label, promoted.details)) {
        promotedHybridDbSwaps.push(promoted);
      } else {
        proteinGuardedRemainingHybridNonDb.push(swap);
      }
    }

    const proteinGuardedPromotedHybridDbSwaps = promotedHybridDbSwaps.filter(
      (swap) => !shouldBlockChickenProteinSwapForMeal(meal_name, swap, modifierById)
    );

    const filteredRemainingHybridNonDb = proteinGuardedRemainingHybridNonDb.filter(
      (swap) => !shouldBlockChickenProteinSwapForMeal(meal_name, swap, modifierById)
    );

    const dbSeedMods = dedupeSwapsByLabel<DbMappedSwap>([
      ...proteinGuardedDbMods,
      ...proteinGuardedPromotedHybridDbSwaps,
    ]);
    const supplementalDbSwaps = hasExplicitMacroGoals(macroGoals)
      ? buildSupplementalDbSwaps(
          modifierCandidates,
          dbSeedMods,
          macroGoals,
          Math.max(0, MAX_FINAL_SWAPS - dbSeedMods.length),
          mealProteinFamily
        ).filter((swap) => !hasDisallowedSwapPhrase(swap.label, swap.details)).filter((swap) => !shouldBlockChickenProteinSwapForMeal(meal_name, swap, modifierById))
      : [];

    const dbFinalPool = dedupeSwapsByLabel<DbMappedSwap>([
      ...dbSeedMods,
      ...supplementalDbSwaps,
    ])
      .map((swap) => ({
        swap,
        score: scoreDbFinalSwap(swap, modifierById, macroGoals, normalizedMealMacros, mealProteinFamily),
      }))
      .sort((a, b) => b.score - a.score)
      .map(({ swap }) => swap)
      .slice(0, MAX_FINAL_SWAPS);

    const hasDbSwaps = dbFinalPool.length > 0;

    const rankedHybridNonDb = dedupeSwapsByLabel(
      filteredRemainingHybridNonDb
        .map((swap) => ({
          swap,
          score: scoreNonDbSwapCandidate(swap, meal_name, macroGoals, normalizedMealMacros),
        }))
        .filter(({ score }) => score > -20)
        .sort((a, b) => b.score - a.score)
        .map(({ swap }) => swap)
    );

    const genericFallbackSwaps = hasDbSwaps
      ? []
      : buildDishAwareGenericSwaps(meal_name, restaurant_name, MAX_FINAL_SWAPS)
        .filter((swap) => !hasDisallowedSwapPhrase(swap.label, swap.details));

    const nonDbFinalPool = hasDbSwaps
      ? []
      : dedupeSwapsByLabel([...rankedHybridNonDb, ...genericFallbackSwaps]);

    const finalModifications = hasDbSwaps
      ? dbFinalPool
      : nonDbFinalPool.slice(0, MAX_FINAL_SWAPS);

    let finalSource: 'db' | 'global' | 'llm' | 'mixed' = 'global';
    if (hasDbSwaps) {
      finalSource = 'db';
    } else {
      const nonDbSources = new Set(finalModifications.map((swap) => swap.source));
      if (nonDbSources.has('global') && nonDbSources.has('llm')) {
        finalSource = 'mixed';
      } else if (nonDbSources.has('llm')) {
        finalSource = 'llm';
      } else {
        finalSource = 'global';
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[swaps] Final response:', {
        dbMods: validDBMods.length,
        dbPromotedFromAi: promotedHybridDbSwaps.length,
        dbSupplementalMods: supplementalDbSwaps.length,
        dbFinalPool: dbFinalPool.length,
        hybridGlobalCandidates: hybridResult.globalSwaps.length,
        hybridLlmCandidates: hybridResult.llmSwaps.length,
        rankedHybridSwaps: rankedHybridNonDb.length,
        genericFallbackSwaps: genericFallbackSwaps.length,
        finalTotal: finalModifications.length,
        source: finalSource,
      });
    }

    return NextResponse.json({
      modifications: finalModifications,
      alternatives: alternatives,
      source: finalSource,
    });
  } catch (error) {
    console.error('[swaps] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


