# FIFOFlow Recommendation Model

Recommendations are explicit operator actions generated from deterministic evidence. They do not change standards directly. They create a reviewable proposal with evidence, expected benefit, and operational scope.

## Recommendation object shape

Recommended object fields:
- `id`
- `recommendation_type`
- `subject_type`
- `subject_id`
- `organization_id`
- `location_id`
- `operation_unit_id`
- `storage_area_id`
- `status`
- `severity_label`
- `confidence_label`
- `confidence_score`
- `summary`
- `operator_action_payload`
- `expected_benefit_payload`
- `opened_at`
- `due_at`
- `closed_at`
- `superseded_by_recommendation_id`
- `rule_version`
- `created_at`
- `updated_at`

## Recommendation statuses

Recommended statuses:
- `OPEN`
- `ACKNOWLEDGED`
- `IN_REVIEW`
- `APPROVED`
- `REJECTED`
- `IMPLEMENTED`
- `SUPERSEDED`
- `EXPIRED`

Status guidance:
- `OPEN`: newly created and awaiting attention
- `ACKNOWLEDGED`: seen by an operator but not yet decided
- `IN_REVIEW`: operational validation is in progress
- `APPROVED`: operator agrees with the recommendation, but standard or workflow update may still be pending
- `REJECTED`: operator disagrees and provides a reason
- `IMPLEMENTED`: operational change was made
- `SUPERSEDED`: a newer recommendation replaced this one
- `EXPIRED`: recommendation aged out because the condition no longer matters

## Evidence attachment model

Recommendations must attach evidence as structured references, not only text summaries.

Evidence attachment expectations:
- link to contributing signals and patterns
- link to source operational rows or derived facts
- store evidence payload snapshots at recommendation creation time
- preserve scope and window metadata
- allow multiple evidence rows per recommendation

Minimum evidence attachment fields:
- `recommendation_id`
- `evidence_type`
- `source_table`
- `source_primary_key`
- `signal_id` or `pattern_id` when relevant
- `payload`
- `created_at`

## Recommendation deduplication logic

FIFOFlow should not open duplicate recommendations for the same issue.

Deduplication key guidance:
- `recommendation_type`
- `subject_type`
- `subject_id`
- primary scope tuple such as `(location_id, operation_unit_id, storage_area_id)`
- rule family or rule version family
- active time window

Deduplication rules:
- if an active recommendation already exists with the same dedupe key, update evidence and timestamps instead of opening a duplicate
- if severity or confidence changes materially, update the existing recommendation or supersede it if the operator action changes
- if the subject changes, open a new recommendation

## Supersession model

Recommendations can supersede older recommendations when:
- the recommended action changed materially
- the scope widened or narrowed
- a stronger evidence set exists
- the prior recommendation was based on now-resolved mapping or unit assumptions

Supersession requirements:
- preserve both records
- set `superseded_by_recommendation_id` on the older record
- include a structured reason for supersession

## Expected benefit model

Recommendations should estimate the type of benefit they are trying to create, even if the estimate is coarse.

Expected benefit payload should support:
- spend reduction
- variance reduction
- waste reduction
- count discipline improvement
- mapping completeness improvement
- recipe costing accuracy improvement
- reduced stockout risk

Example expected benefit payload:
```json
{
  "benefit_type": "variance_reduction",
  "estimated_unit": "pct",
  "estimated_value": 0.12,
  "basis": "recent_average_variance",
  "lookback_days": 30
}
```

## Operator action model

Recommendations need actionable next steps that fit hospitality operations.

Operator action payload may include:
- assigned role, such as `kitchen_manager`, `bar_manager`, `purchasing_manager`, `inventory_lead`
- due date guidance
- required review inputs
- suggested standard candidate if accepted
- follow-up count, recipe review, or vendor review actions

Example operator action payload:
```json
{
  "assigned_role": "purchasing_manager",
  "action_steps": [
    "Review last 3 invoice prices",
    "Compare alternate vendor item options",
    "Confirm preferred vendor or negotiate price"
  ],
  "follow_up_type": "vendor_review",
  "due_in_days": 3
}
```

## First recommendation types

### REVIEW_VENDOR

Use when unstable pricing, repeated price increases, or repeated fulfillment mismatches indicate the current supplier relationship needs review.

### ADD_RECIPE_MAPPING

Use when purchases or recipe ingredients cannot be tied to canonical recipe demand because mappings are incomplete.

### ADJUST_PAR

Use when repeated over-order or under-order patterns suggest current par assumptions are wrong for a specific item and scope.

### REQUIRE_CYCLE_COUNT

Use when count variance or purchasing mismatch requires an immediate targeted count.

### REQUIRE_WASTE_REASON

Use when waste volume is material but waste reasons are missing or too generic to support diagnosis.

### REVIEW_RECIPE_COST

Use when recipe cost drift exceeds operational thresholds and the recipe should be reviewed for margin or ingredient substitution.

### CLASSIFY_NON_RECIPE_USAGE

Use when meaningful depletion cannot be explained by recipe demand and should be tagged as prep usage, transfer, comp, or non-recipe consumption.

### ENFORCE_COUNT_DISCIPLINE

Use when repeated count inconsistency suggests a storage area or operation unit needs stricter count process.

## Recommendation creation rule

A recommendation should usually require:
- at least one stable pattern or a high-severity single signal
- acceptable evidence quality
- no blocking unresolved review queue item for the same subject unless the recommendation is specifically to resolve that ambiguity

## Recommendation closeout

A recommendation should not disappear when acted on. Closeout must record:
- operator decision
- rationale
- whether a standard candidate was created
- whether a follow-up effectiveness review is required

Recommendations are FIFOFlow's operational decision queue. They should feel like actions an F&B operator can assign, verify, and close, not abstract analytics alerts.
