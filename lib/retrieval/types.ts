import { z } from 'zod';
import {
  CATEGORY_ENUM,
  CRAVING_TAG_ENUM,
  CUISINE_STYLE_ENUM,
  DIET_FLAG_ENUM,
  MEAL_TYPE_ENUM,
  PROTEIN_SOURCE_ENUM,
  SEARCH_INTENTS,
  SORT_PRIORITY_ENUM,
} from './ontology';

export const parsedSearchQuerySchema = z.object({
  intent: z.enum(SEARCH_INTENTS).default('meal_search'),
  raw: z.string(),
  restaurantQuery: z.string().optional(),
  mealTypes: z.array(z.enum(MEAL_TYPE_ENUM)).default([]),
  cuisineOrStyle: z.array(z.enum(CUISINE_STYLE_ENUM)).default([]),
  categories: z.array(z.enum(CATEGORY_ENUM)).default([]),
  proteinPreference: z.array(z.enum(PROTEIN_SOURCE_ENUM)).default([]),
  minCalories: z.number().optional(),
  maxCalories: z.number().optional(),
  minProtein: z.number().optional(),
  maxProtein: z.number().optional(),
  maxCarbs: z.number().optional(),
  minCarbs: z.number().optional(),
  maxFat: z.number().optional(),
  minFat: z.number().optional(),
  includeTags: z.array(z.enum(CRAVING_TAG_ENUM)).default([]),
  excludeTags: z.array(z.string()).default([]),
  dietaryFlags: z.array(z.enum(DIET_FLAG_ENUM)).default([]),
  cravingTerms: z.array(z.string()).default([]),
  sortPriority: z.array(z.enum(SORT_PRIORITY_ENUM)).default([]),
  locationHints: z.array(z.string()).default([]),
  confidenceNotes: z.array(z.string()).default([]),
  parserConfidence: z.number().min(0).max(1).default(0.5),
  semanticQuery: z.string(),
  normalizedCategory: z.string().optional(),
  dishKeywords: z.array(z.string()).optional(),
  mealType: z.string().optional(),
  cuisineType: z.string().optional(),
  dietType: z.string().optional(),
  intentLabel: z.string().optional(),
  excludeLargePortions: z.boolean().default(true),
  hasStructuredFilters: z.boolean().default(false),
});

export type ParsedSearchQuery = z.infer<typeof parsedSearchQuerySchema>;

export interface SearchDebugInfo {
  parser: {
    confidence: number;
    notes: string[];
    semanticQuery: string;
  };
  deterministicCount: number;
  vectorCount: number;
  usedVector: boolean;
  rpcName: string;
}

export interface RankMetadata {
  score: number;
  matchedConstraints: string[];
  matchedTags: string[];
  fallbackSource: 'deterministic' | 'semantic';
  confidenceScore?: number;
}

