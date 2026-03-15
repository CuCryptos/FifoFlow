# Policy Resolution Precedence

## Deterministic order
FIFOFlow policy resolution follows this order:
1. exact subject entity override
2. scoped override by `operation_unit`, `storage_area`, `inventory_category`, `recipe_group`, or `peer_group`
3. `location` override
4. `organization` default
5. `global` platform default

## Conflict handling
If multiple active records match at the same precedence:
1. most recent effective version wins
2. higher version number wins if effective start time ties
3. lower database id is the stable tiebreaker

Ambiguous matches at the same precedence should be treated as configuration debt and surfaced through explanation text.

## Active versus inactive
Inactive definitions, versions, or scopes are ignored. Expired versions are ignored. Missing policies should fall back to the next broader scope until no candidate remains.

## Effective date
Resolution always takes `effective_at`.
A policy version applies only when:
- `effective_start_at <= effective_at`
- `effective_end_at is null or effective_end_at > effective_at`

## Engine request contract
Engines should request policy resolution with:
- `policy_key`
- subject scope context
- `effective_at`

The response should include the matched scope and a human-readable explanation so operators and developers can inspect why a value applied.
