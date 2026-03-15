import { normalizeIngredientLookup } from '../../mapping/ingredients/canonicalIngredientResolver.js';
import type { RecipeIngredientParseResult } from './types.js';

const UNIT_ALIASES: Record<string, string> = {
  each: 'each',
  ea: 'each',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'L',
  liter: 'L',
  liters: 'L',
  cup: 'cup',
  cups: 'cup',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  clove: 'clove',
  cloves: 'clove',
  stalk: 'stalk',
  stalks: 'stalk',
  fl: 'fl oz',
};

const PREP_PREFIX_WORDS = new Set([
  'chopped',
  'minced',
  'diced',
  'sliced',
  'julienned',
  'peeled',
  'crushed',
  'grated',
  'ground',
  'fresh',
  'roughly',
  'finely',
  'coarsely',
]);

const VAGUE_PATTERNS: Array<{ regex: RegExp; ingredientIndex: number; explanation: string }> = [
  { regex: /^(.+?)\s+to\s+taste$/i, ingredientIndex: 1, explanation: 'This line uses a vague quantity expression and needs review.' },
  { regex: /^(.+?)\s+as\s+needed$/i, ingredientIndex: 1, explanation: 'This line uses an open-ended quantity expression and needs review.' },
  { regex: /^a\s+[^\s]+\s+of\s+(.+)$/i, ingredientIndex: 1, explanation: 'This line uses a vague kitchen expression instead of a normalized quantity.' },
];

export function parseRecipeIngredientLine(rawLine: string): RecipeIngredientParseResult {
  const cleanedLine = sanitizeSourceLine(rawLine);
  if (!cleanedLine) {
    return {
      raw_line_text: rawLine,
      quantity_raw: null,
      quantity_normalized: null,
      unit_raw: null,
      unit_normalized: null,
      ingredient_text: null,
      preparation_note: null,
      parse_status: 'FAILED',
      parser_confidence: 'LOW',
      explanation_text: 'The line was empty after whitespace and bullet cleanup.',
    };
  }

  for (const vague of VAGUE_PATTERNS) {
    const match = cleanedLine.match(vague.regex);
    if (match) {
      const ingredient = normalizeIngredientName(match[vague.ingredientIndex] ?? cleanedLine);
      return {
        raw_line_text: rawLine,
        quantity_raw: null,
        quantity_normalized: null,
        unit_raw: null,
        unit_normalized: null,
        ingredient_text: ingredient || cleanedLine,
        preparation_note: null,
        parse_status: 'NEEDS_REVIEW',
        parser_confidence: 'LOW',
        explanation_text: vague.explanation,
      };
    }
  }

  const quantityMatch = cleanedLine.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s+|$)(.*)$/);
  if (!quantityMatch) {
    return {
      raw_line_text: rawLine,
      quantity_raw: null,
      quantity_normalized: null,
      unit_raw: null,
      unit_normalized: null,
      ingredient_text: cleanedLine,
      preparation_note: null,
      parse_status: 'PARTIAL',
      parser_confidence: 'LOW',
      explanation_text: 'No supported normalized quantity pattern was found at the start of the line.',
    };
  }

  const quantityRaw = quantityMatch[1] ?? null;
  const remainder = (quantityMatch[2] ?? '').trim();
  const quantityNormalized = quantityRaw ? parseQuantity(quantityRaw) : null;
  if (quantityNormalized == null) {
    return {
      raw_line_text: rawLine,
      quantity_raw: quantityRaw,
      quantity_normalized: null,
      unit_raw: null,
      unit_normalized: null,
      ingredient_text: remainder || null,
      preparation_note: null,
      parse_status: 'NEEDS_REVIEW',
      parser_confidence: 'LOW',
      explanation_text: 'The quantity token was detected but could not be normalized safely.',
    };
  }

  const unitMatch = parseUnitAndRemainder(remainder);
  if (!unitMatch) {
    return {
      raw_line_text: rawLine,
      quantity_raw: quantityRaw,
      quantity_normalized: quantityNormalized,
      unit_raw: null,
      unit_normalized: null,
      ingredient_text: normalizeIngredientName(remainder) || null,
      preparation_note: null,
      parse_status: 'PARTIAL',
      parser_confidence: 'MEDIUM',
      explanation_text: 'A normalized quantity was found, but the unit was not recognized safely.',
    };
  }

  const separated = splitIngredientAndPrep(unitMatch.remainder);
  if (!separated.ingredient_text) {
    return {
      raw_line_text: rawLine,
      quantity_raw: quantityRaw,
      quantity_normalized: quantityNormalized,
      unit_raw: unitMatch.unit_raw,
      unit_normalized: unitMatch.unit_normalized,
      ingredient_text: null,
      preparation_note: separated.preparation_note,
      parse_status: 'NEEDS_REVIEW',
      parser_confidence: 'LOW',
      explanation_text: 'Quantity and unit were parsed, but the ingredient text could not be isolated safely.',
    };
  }

  return {
    raw_line_text: rawLine,
    quantity_raw: quantityRaw,
    quantity_normalized: quantityNormalized,
    unit_raw: unitMatch.unit_raw,
    unit_normalized: unitMatch.unit_normalized,
    ingredient_text: separated.ingredient_text,
    preparation_note: separated.preparation_note,
    parse_status: 'PARSED',
    parser_confidence: separated.preparation_note ? 'MEDIUM' : 'HIGH',
    explanation_text: separated.preparation_note
      ? 'The line was parsed into quantity, unit, ingredient, and a separable preparation note.'
      : 'The line was parsed into quantity, unit, and ingredient text using supported kitchen patterns.',
  };
}

export function segmentRecipeSourceText(sourceText: string): string[] {
  return sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => sanitizeSourceLine(line).length > 0);
}

function sanitizeSourceLine(input: string): string {
  return input.trim().replace(/^[-*•]+\s*/, '').trim();
}

function parseQuantity(token: string): number | null {
  const normalized = token.trim();
  if (/^\d+\s+\d+\/\d+$/.test(normalized)) {
    const [whole, fraction] = normalized.split(/\s+/);
    const fractionValue = parseFraction(fraction ?? '');
    return fractionValue == null ? null : Number(whole) + fractionValue;
  }
  if (/^\d+\/\d+$/.test(normalized)) {
    return parseFraction(normalized);
  }
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    return Number(normalized);
  }
  return null;
}

function parseFraction(token: string): number | null {
  const [numerator, denominator] = token.split('/').map((part) => Number(part));
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

function parseUnitAndRemainder(remainder: string): { unit_raw: string; unit_normalized: string; remainder: string } | null {
  const tokens = remainder.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  const firstTwo = tokens.slice(0, 2).join(' ').toLowerCase();
  if (firstTwo === 'fl oz') {
    return {
      unit_raw: tokens.slice(0, 2).join(' '),
      unit_normalized: 'fl oz',
      remainder: tokens.slice(2).join(' '),
    };
  }

  const first = tokens[0]!.toLowerCase();
  const normalized = UNIT_ALIASES[first];
  if (!normalized) {
    return null;
  }

  return {
    unit_raw: tokens[0]!,
    unit_normalized: normalized,
    remainder: tokens.slice(1).join(' '),
  };
}

function splitIngredientAndPrep(remainder: string): { ingredient_text: string | null; preparation_note: string | null } {
  const trimmed = remainder.trim();
  if (!trimmed) {
    return { ingredient_text: null, preparation_note: null };
  }

  if (trimmed.includes(',')) {
    const [ingredientPart, ...noteParts] = trimmed.split(',');
    return {
      ingredient_text: normalizeIngredientName(ingredientPart ?? ''),
      preparation_note: noteParts.join(',').trim() || null,
    };
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  let prepCount = 0;
  for (const token of tokens) {
    if (PREP_PREFIX_WORDS.has(token.toLowerCase())) {
      prepCount += 1;
      continue;
    }
    break;
  }

  if (prepCount > 0 && prepCount < tokens.length) {
    return {
      ingredient_text: normalizeIngredientName(tokens.slice(prepCount).join(' ')),
      preparation_note: tokens.slice(0, prepCount).join(' '),
    };
  }

  return {
    ingredient_text: normalizeIngredientName(trimmed),
    preparation_note: null,
  };
}

function normalizeIngredientName(input: string): string {
  return normalizeIngredientLookup(input)
    .replace(/^of\s+/, '')
    .trim();
}
