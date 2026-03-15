# Operational Memory Model

FIFOFlow's intelligence engine only becomes valuable over time if it can remember what it observed, what it recommended, what operators did, and whether operations improved.

Operational memory is the durable layer that turns intelligence outputs into longitudinal operating knowledge.

## Why memory must persist

Without memory, FIFOFlow can only say what is happening now. With memory, FIFOFlow can say:
- this issue has repeated 3 times in 60 days
- this recommendation was already issued and acknowledged
- this standard reduced variance after adoption
- this location improved after changing vendor strategy

This is the difference between a signal engine and an operating system.

## What FIFOFlow must remember

### What was detected

Persist:
- signals
- patterns
- scope
- time windows
- rule versions
- evidence counts
- last confirmed timestamps

### When it was detected

Persist:
- first observed
- last observed
- run timestamps
- recurrence windows
- review due dates

### What recommendation was issued

Persist:
- recommendation type
- summary
- urgency
- owner role
- expected benefit
- evidence attachments
- status changes over time

### Whether it was adopted

Persist:
- governance decision
- approver role
- standard candidate creation
- standard scope
- effective dates

### Whether it improved operations

Persist:
- effectiveness review windows
- baseline metrics
- post-adoption metrics
- result labels such as improved, unchanged, regressed, inconclusive

## Lineage requirements

Operational memory must preserve a navigable lineage chain:
- operational fact
- derived fact
- signal
- pattern
- recommendation
- governance action
- standard version
- effectiveness review

Lineage requirements:
- source references remain stable
- superseded objects are never hard-deleted
- operator review decisions remain reconstructable
- each object carries rule version and scope metadata

## Supersession model

Supersession is part of memory, not a cleanup operation.

Recommendations:
- a new recommendation may supersede an older one when urgency, evidence, or action payload materially changes
- the older recommendation remains queryable with a supersession link

Standards:
- new versions should supersede old versions without deleting them
- retirement should remain visible historically

Signals and patterns:
- should update confirmation and recurrence state, but not erase earlier existence

## Historical review workflows

Operational memory should support review workflows such as:
- `show prior vendor volatility events for this supplier SKU`
- `show all recommendations issued for this inventory item in the last 90 days`
- `show whether a standard improved the target condition`
- `show unresolved repeat issues for this operation unit`

## Example memory use cases

### Repeated issue tracking

`This issue was detected 3 times in 60 days.`

Required memory objects:
- repeated signals
- aggregated pattern
- timestamps and recurrence count

### Recommendation effectiveness

`This recommendation resolved prior price volatility.`

Required memory objects:
- recommendation record
- linked standard or operator action
- effectiveness review result
- post-action decline in volatility pattern recurrence

### Standard impact

`This standard reduced variance after adoption.`

Required memory objects:
- adopted standard version
- baseline variance metrics
- post-adoption metrics
- standards effectiveness review

## Future read models for operational memory timelines

Recommended read models:
- `subject_intelligence_timeline`
  - all signals, patterns, recommendations, governance actions, and standards by subject over time
- `recommendation_history`
  - issuance, supersession, approval, and closure timeline
- `standard_effectiveness_timeline`
  - adoption and outcome reviews over time
- `location_issue_timeline`
  - recurring operational issues by location and operation unit
- `vendor_volatility_timeline`
  - price movement and recommendation history for one vendor item or vendor strategy

## Memory quality rules

FIFOFlow should not overstate what memory proves.

Rules:
- distinguish repeated observation from causal improvement
- mark inconclusive reviews clearly
- preserve uncertainty when upstream data quality is weak
- never treat missing follow-up as improvement

Operational memory is the platform's long-term trust layer. It is where FIFOFlow stops being a sequence of weekly alerts and becomes a retained operating brain for the business.
