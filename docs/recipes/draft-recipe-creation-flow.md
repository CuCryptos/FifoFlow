# Draft Recipe Creation Flow

## Current phase

This phase stops at durable draft recipe assembly. It does not yet create final operational recipe records automatically.

## Later creation path

A reviewed draft should eventually create:
- `recipe`
- `recipe_version`
- `recipe_ingredients`

## Required preservation

When a draft becomes operational data, FIFOFlow should preserve links back to:
- original source text
- parsed row text
- parser outputs
- canonical ingredient resolution outcomes
- template source ids if the draft originated from a template

## Handling unresolved rows

### Draft save
Draft save is allowed with unresolved rows because setup work should not be lost.

### Cost computation
Trusted cost computation should wait until:
- canonical ingredient identity is complete
- quantity normalization is complete
- required yield fields are present
- inventory linkage is complete enough for cost resolution

### Recipe cost drift eligibility
Later recipe-cost drift logic should only run after the draft has become a stable operational recipe with trusted comparable snapshots.
