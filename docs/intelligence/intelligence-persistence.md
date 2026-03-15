# FIFOFlow Intelligence Persistence

This document describes the durable persistence layer for FIFOFlow intelligence outputs.

## Purpose

FIFOFlow now persists deterministic intelligence outputs instead of keeping them only in memory. The persistence layer gives the platform operational memory across job runs and makes future intelligence packs reusable.

Persisted intelligence artifacts:
- derived signals
- pattern observations
- recommendations
- recommendation evidence
- intelligence run logs

## Persistence architecture

The persistence layer is implemented in:
- `packages/server/src/intelligence/persistence/`

Main components:
- SQLite schema bootstrap for intelligence tables
- repository contract for intelligence writes and reads
- SQLite repository implementation using prepared statements
- run logging support
- read models for price intelligence outputs

The current implementation is SQLite-compatible so it can run on local and staging databases without depending on Supabase or PostgreSQL-only features.

## Idempotency rules

Intelligence jobs must be rerunnable without duplicating operational memory.

### Signals

Signals are unique by:
- `signal_type`
- `subject_key`
- `window_start`
- `window_end`
- `magnitude_value`

If the same signal is observed again:
- do not insert a second row
- update `last_confirmed_at`
- update `evidence_count` if newer evidence is stronger
- preserve the original `created_at`

### Patterns

Patterns are unique by:
- `pattern_type`
- `subject_key`
- active status (`Active` or `Monitoring`)

If the same pattern is observed again:
- do not insert a second active row
- update `observation_count`
- update `last_observed_at`
- update `evidence_count`
- preserve earliest `first_observed_at`

### Recommendations

Recommendations are unique by:
- `recommendation_type`
- `subject_key`
- active status set (`OPEN`, `REVIEWED`, `ACTIVE`, `ACKNOWLEDGED`, `IN_REVIEW`, `APPROVED`)

If the same active recommendation is reconfirmed without a material change:
- do not insert a duplicate
- update `last_confirmed_at`
- update `evidence_count`
- update confidence and urgency fields if the recommendation remains materially the same

## Supersession behavior

When a recommendation materially changes, FIFOFlow does not overwrite history.

Instead it:
- inserts a new recommendation row
- marks the older row `SUPERSEDED`
- writes `superseded_by_recommendation_id` on the older row

Material change currently includes changes to:
- summary
- severity
- confidence label
- urgency label
- expected benefit payload
- operator action payload

This gives FIFOFlow a real recommendation history instead of a mutable alert feed.

## Evidence model

Recommendation evidence is immutable once stored.

Each evidence row includes:
- `recommendation_id`
- `evidence_type`
- `evidence_ref_table`
- `evidence_ref_id`
- `explanation_text`
- `evidence_weight`
- `created_at`

Idempotency for evidence is handled with a unique key across the recommendation, evidence reference, explanation text, and weight. Repeated job runs can safely try to attach the same evidence again.

Signals and patterns keep their evidence lineage inside persisted JSON payloads so the recommendation layer can still trace back to the exact operational references that supported them.

## Run logging

Each intelligence job writes an `intelligence_runs` record.

Tracked fields:
- job type
- run start and completion timestamps
- created and updated counts for signals, patterns, and recommendations
- recommendation supersession count
- final status

This supports job auditing and future memo generation workflows.

## How intelligence jobs write outputs

The current price intelligence flow now runs as:

`load price history -> evaluate signals -> upsert signals -> detect patterns -> upsert patterns -> generate recommendations -> upsert recommendations -> attach evidence -> log run summary`

Writes occur through the repository layer, not directly in the job logic.

## Read models

The repository exposes read models for:
- latest price signals
- active unstable vendor pricing patterns
- active vendor review recommendations

These are intended to feed:
- weekly operating memo generation
- recommendation review queues
- future manager-facing intelligence surfaces

## Reuse for future intelligence packs

This persistence layer is designed to be reused by:
- recipe cost intelligence
- purchasing mismatch intelligence
- inventory discipline / variance intelligence
- waste intelligence

Future packs should follow the same structure:
- compute deterministic outputs
- upsert signals by stable uniqueness keys
- upsert patterns by active subject scope
- upsert recommendations with supersession instead of destructive overwrite
- attach immutable evidence rows
- log every run

## Current limitations

- signals and patterns do not yet use separate dedicated evidence tables
- the current implementation stores signal and pattern lineage inside JSON payloads
- only the price intelligence pack is wired to the repository today
- canonical migrated `vendor_item` and `vendor_price_history` tables are still pending

## Why this matters

FIFOFlow becomes a learning operational platform only if it can remember what it observed, when it observed it, what action it proposed, and whether operators acted. The persistence layer is the system memory required for that loop.
