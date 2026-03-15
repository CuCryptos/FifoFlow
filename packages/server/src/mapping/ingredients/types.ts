export type CanonicalIngredientCategory =
  | 'protein'
  | 'dairy'
  | 'produce'
  | 'herbs'
  | 'spices'
  | 'dry_goods'
  | 'grain'
  | 'oil_fat'
  | 'sugar_sweetener'
  | 'vinegar'
  | 'condiment'
  | 'sauce_base'
  | 'stock'
  | 'seafood'
  | 'alcohol_spirit'
  | 'beer'
  | 'wine'
  | 'non_alcoholic_beverage'
  | 'baking';

// CanonicalIngredient is the stable semantic ingredient layer used across recipes,
// templates, and cross-location comparison. It is not a counted inventory item or vendor SKU.
export interface CanonicalIngredient {
  id: number | string;
  canonical_name: string;
  normalized_canonical_name: string;
  category: CanonicalIngredientCategory | string;
  base_unit: string;
  perishable_flag: boolean;
  active: boolean;
  source_hash: string;
  created_at?: string;
  updated_at?: string;
}

export interface IngredientAlias {
  id: number | string;
  canonical_ingredient_id: number | string;
  alias: string;
  normalized_alias: string;
  alias_type: string | null;
  active: boolean;
  source_hash: string;
  created_at?: string;
  updated_at?: string;
}

export interface CanonicalIngredientDictionarySeed {
  ingredients: Array<{
    canonical_name: string;
    category: CanonicalIngredientCategory | string;
    base_unit: string;
    perishable_flag: boolean;
  }>;
  aliases: Array<{
    canonical_name: string;
    aliases: string[];
  }>;
}

export interface CanonicalIngredientDictionarySyncSummary {
  ingredients_inserted: number;
  ingredients_updated: number;
  ingredients_reused: number;
  ingredients_retired: number;
  aliases_inserted: number;
  aliases_updated: number;
  aliases_reused: number;
  aliases_retired: number;
  status: 'completed' | 'failed';
}

export interface CanonicalIngredientSyncRun {
  id: number | string;
  source_hash: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed';
  ingredients_inserted: number;
  ingredients_updated: number;
  ingredients_reused: number;
  ingredients_retired: number;
  aliases_inserted: number;
  aliases_updated: number;
  aliases_reused: number;
  aliases_retired: number;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CanonicalIngredientRepository {
  findCanonicalByExactName(name: string): Promise<CanonicalIngredient[]>;
  findCanonicalByNormalizedName(normalizedName: string): Promise<CanonicalIngredient[]>;
  findCanonicalByExactAlias(alias: string): Promise<Array<{ ingredient: CanonicalIngredient; alias: IngredientAlias }>>;
  findCanonicalByNormalizedAlias(normalizedAlias: string): Promise<Array<{ ingredient: CanonicalIngredient; alias: IngredientAlias }>>;
}

export interface CanonicalIngredientSyncRepository {
  initialize(): void;
  startSyncRun(startedAt: string, sourceHash: string): CanonicalIngredientSyncRun;
  completeSyncRun(
    runId: number | string,
    summary: CanonicalIngredientDictionarySyncSummary,
    completedAt: string,
    notes?: string | null,
  ): CanonicalIngredientSyncRun;
  failSyncRun(runId: number | string, completedAt: string, notes?: string | null): CanonicalIngredientSyncRun;
  upsertCanonicalIngredient(record: Omit<CanonicalIngredient, 'id' | 'created_at' | 'updated_at'>): 'inserted' | 'updated' | 'reused';
  retireMissingCanonicalIngredients(activeCanonicalNames: Set<string>): number;
  getCanonicalIngredientByName(name: string): CanonicalIngredient | null;
  upsertIngredientAlias(record: Omit<IngredientAlias, 'id' | 'created_at' | 'updated_at'>): 'inserted' | 'updated' | 'reused';
  retireMissingAliases(canonicalIngredientId: number | string, activeAliases: Set<string>): number;
}

export type CanonicalIngredientMatchStatus = 'matched' | 'no_match' | 'ambiguous';
export type CanonicalIngredientMatchReason =
  | 'exact_canonical'
  | 'normalized_canonical'
  | 'exact_alias'
  | 'normalized_alias'
  | 'no_match'
  | 'ambiguous';
export type CanonicalIngredientConfidenceLabel = 'high' | 'low';

export interface CanonicalIngredientResolverMatch {
  ingredient: CanonicalIngredient;
  alias?: IngredientAlias | null;
}

export interface CanonicalIngredientResolutionResult {
  input: string;
  normalized_input: string;
  status: CanonicalIngredientMatchStatus;
  matched_canonical_ingredient_id: number | string | null;
  matched_canonical_name: string | null;
  match_reason: CanonicalIngredientMatchReason;
  confidence_label: CanonicalIngredientConfidenceLabel;
  explanation_text: string;
  matches: CanonicalIngredientResolverMatch[];
}
