# Recipe Ingredient Parser Model

The first FIFOFlow recipe parser is deterministic and intentionally narrow.

## Goal

Turn supported ingredient lines into structured parse results without inventing quantities, units, or ingredient identity.

## Output fields

Each parsed row should produce:
- `quantity_raw`
- `quantity_normalized`
- `unit_raw`
- `unit_normalized`
- `ingredient_text`
- `preparation_note`
- `parse_status`
- `parser_confidence`
- `explanation_text`

## Supported patterns in this phase

Supported quantity patterns:
- integers: `2`
- decimals: `1.5`
- simple fractions: `1/2`, `1/4`, `3/4`
- mixed fractions: `1 1/2`

Supported unit patterns in this phase include common kitchen units such as:
- `lb`, `oz`, `kg`, `g`
- `ml`, `L`
- `cup`, `tbsp`, `tsp`
- `each`, `ea`
- `clove`, `cloves`
- `stalk`, `stalks`

## Safe examples

`2 lb shrimp`
- quantity_raw: `2`
- quantity_normalized: `2`
- unit_normalized: `lb`
- ingredient_text: `shrimp`
- parse_status: `PARSED`

`4 cloves garlic`
- quantity_raw: `4`
- quantity_normalized: `4`
- unit_normalized: `clove`
- ingredient_text: `garlic`
- parse_status: `PARSED`

`1/2 cup white wine`
- quantity_raw: `1/2`
- quantity_normalized: `0.5`
- unit_normalized: `cup`
- ingredient_text: `white wine`
- parse_status: `PARSED`

`3 each lemon`
- quantity_raw: `3`
- quantity_normalized: `3`
- unit_normalized: `each`
- ingredient_text: `lemon`
- parse_status: `PARSED`

`2 tbsp chopped parsley`
- quantity_raw: `2`
- quantity_normalized: `2`
- unit_normalized: `tbsp`
- ingredient_text: `parsley`
- preparation_note: `chopped`
- parse_status: `PARSED`

## Parser statuses

### `PARSED`
Quantity, unit, and ingredient text were isolated safely.

### `PARTIAL`
Some structure was recovered, but not enough for high-trust assembly.

### `NEEDS_REVIEW`
The parser found a line but the quantity or unit expression is too vague or unsupported for safe normalization.

### `FAILED`
The line could not be parsed into a meaningful ingredient row.

## Review-required examples

These should not be treated as clean parses:
- `salt to taste`
- `olive oil as needed`
- `a splash of vinegar`

These remain `PARTIAL` or `NEEDS_REVIEW` because the quantity is operationally ambiguous.

## Out of scope for this phase

- semantic ingredient inference
- instruction parsing
- nested recipe sections
- optional ingredients
- vague culinary phrases normalized into fake quantities
- automatic yield extraction from paragraph text
