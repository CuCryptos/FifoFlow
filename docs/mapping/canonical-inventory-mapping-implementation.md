# Canonical Inventory Mapping Implementation

## Implemented in this phase
- durable scoped canonical ingredient to inventory item mapping tables
- SQLite bootstrap and repository adapter
- deterministic resolver with scope precedence
- conservative candidate generation job
- review-event scaffolding
- recipe costability readiness helper for promoted recipes

## Scope precedence
Resolver order is:
1. `operation_unit`
2. `location`
3. `organization`

Within a matched scope, trusted preferred mappings beat broader defaults.

## Persistence strategy
Automated runs manage one preferred mapping row per canonical ingredient and scope. Candidate rows hold alternate possibilities or ambiguous options. Manual and rejected outcomes are preserved on rerun.

## Auto-map policy
Auto-map occurs only when one inventory item matches deterministically by:
- exact inventory name
- normalized inventory name
- alias overlap that still yields one unique item

## Review queue policy
- ambiguous matches become `NEEDS_REVIEW`
- no-match outcomes become `UNMAPPED`
- review events are recorded when automated runs create new unresolved work

## Costability helper behavior
The helper evaluates a promoted recipe version against a scope context and reports:
- mapped rows
- unresolved rows
- percent of ingredient rows that are costable now
- explanation per row

## Current limitations
- no UI review workflow
- no vendor-item bridge yet
- current runtime `items` table only exposes `venue_id` as a location proxy
- operation-unit item scoping is supported in the mapping layer but not in the base `items` catalog yet

## Blockers before full recipe-cost source integration
- stronger inventory-item governance and scoped catalog data
- integration from resolved canonical-to-inventory mappings into recipe-cost source reads
- vendor-item mapping and normalized purchasing lineage
