import type {
  CanonicalIngredientResolutionResult,
  CanonicalIngredientRepository,
  CanonicalIngredientResolverMatch,
} from './types.js';

export function normalizeIngredientLookup(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function resolveCanonicalIngredient(
  input: string,
  repository: CanonicalIngredientRepository,
): Promise<CanonicalIngredientResolutionResult> {
  const rawInput = input.trim();
  const normalizedInput = normalizeIngredientLookup(rawInput);

  const exactCanonicalMatches = await repository.findCanonicalByExactName(rawInput);
  const exactCanonicalResult = buildUniqueMatch(rawInput, normalizedInput, exactCanonicalMatches.map((ingredient) => ({ ingredient })), 'exact_canonical');
  if (exactCanonicalResult) {
    return exactCanonicalResult;
  }

  const normalizedCanonicalMatches = dedupeMatches(
    (await repository.findCanonicalByNormalizedName(normalizedInput)).map((ingredient) => ({ ingredient })),
  );
  const normalizedCanonicalResult = buildUniqueMatch(rawInput, normalizedInput, normalizedCanonicalMatches, 'normalized_canonical');
  if (normalizedCanonicalResult) {
    return normalizedCanonicalResult;
  }

  const exactAliasMatches = dedupeMatches(await repository.findCanonicalByExactAlias(rawInput));
  const exactAliasResult = buildUniqueMatch(rawInput, normalizedInput, exactAliasMatches, 'exact_alias');
  if (exactAliasResult) {
    return exactAliasResult;
  }

  const normalizedAliasMatches = dedupeMatches(await repository.findCanonicalByNormalizedAlias(normalizedInput));
  const normalizedAliasResult = buildUniqueMatch(rawInput, normalizedInput, normalizedAliasMatches, 'normalized_alias');
  if (normalizedAliasResult) {
    return normalizedAliasResult;
  }

  if (normalizedAliasMatches.length > 1) {
    return {
      input: rawInput,
      normalized_input: normalizedInput,
      status: 'ambiguous',
      matched_canonical_ingredient_id: null,
      matched_canonical_name: null,
      match_reason: 'ambiguous',
      confidence_label: 'low',
      explanation_text: `The input "${rawInput}" matched multiple canonical ingredient aliases after normalization. FIFOFlow will not guess between ${normalizedAliasMatches.map((match) => match.ingredient.canonical_name).join(', ')}.`,
      matches: normalizedAliasMatches,
    };
  }

  if (exactAliasMatches.length > 1 || normalizedCanonicalMatches.length > 1 || exactCanonicalMatches.length > 1) {
    const ambiguousMatches = exactAliasMatches.length > 1
      ? exactAliasMatches
      : normalizedCanonicalMatches.length > 1
        ? normalizedCanonicalMatches
        : exactCanonicalMatches.map((ingredient) => ({ ingredient }));
    return {
      input: rawInput,
      normalized_input: normalizedInput,
      status: 'ambiguous',
      matched_canonical_ingredient_id: null,
      matched_canonical_name: null,
      match_reason: 'ambiguous',
      confidence_label: 'low',
      explanation_text: `The input "${rawInput}" matched multiple canonical ingredients in a deterministic lookup stage. FIFOFlow will not auto-resolve this conflict.`,
      matches: dedupeMatches(ambiguousMatches),
    };
  }

  return {
    input: rawInput,
    normalized_input: normalizedInput,
    status: 'no_match',
    matched_canonical_ingredient_id: null,
    matched_canonical_name: null,
    match_reason: 'no_match',
    confidence_label: 'low',
    explanation_text: `No canonical ingredient or active alias matched "${rawInput}" using exact or normalized lookup.`,
    matches: [],
  };
}

function buildUniqueMatch(
  rawInput: string,
  normalizedInput: string,
  matches: CanonicalIngredientResolverMatch[],
  reason: CanonicalIngredientResolutionResult['match_reason'],
): CanonicalIngredientResolutionResult | null {
  if (matches.length !== 1) {
    return null;
  }

  const match = matches[0]!;
  const reasonText = reason === 'exact_canonical'
    ? 'exact canonical name lookup'
    : reason === 'normalized_canonical'
      ? 'normalized canonical name lookup'
      : reason === 'exact_alias'
        ? 'exact alias lookup'
        : 'normalized alias lookup';

  return {
    input: rawInput,
    normalized_input: normalizedInput,
    status: 'matched',
    matched_canonical_ingredient_id: match.ingredient.id,
    matched_canonical_name: match.ingredient.canonical_name,
    match_reason: reason,
    confidence_label: 'high',
    explanation_text: `Resolved "${rawInput}" to canonical ingredient "${match.ingredient.canonical_name}" using ${reasonText}.`,
    matches: [match],
  };
}

function dedupeMatches(matches: CanonicalIngredientResolverMatch[]): CanonicalIngredientResolverMatch[] {
  const deduped = new Map<string, CanonicalIngredientResolverMatch>();
  for (const match of matches) {
    const key = String(match.ingredient.id);
    if (!deduped.has(key)) {
      deduped.set(key, match);
    }
  }
  return [...deduped.values()];
}
