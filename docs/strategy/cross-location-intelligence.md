# Cross-Location Intelligence

Cross-location intelligence is the architecture layer that lets FIFOFlow compare operating behavior across the business and discover what good looks like.

Most inventory systems fail here because they treat each venue as a separate ledger and never normalize context enough to compare real operating behavior.

FIFOFlow should treat cross-location intelligence as a governed benchmarking system, not a generic leaderboard.

## Why typical inventory systems fail

Common failure modes:
- location catalogs diverge and cannot be compared cleanly
- vendor identity is local and pack-specific, not canonical
- theoretical usage is missing or inconsistent
- waste reasons are not controlled
- counts are not disciplined enough to benchmark variance
- systems compare raw quantities without normalizing for demand, unit, or operation type

FIFOFlow should avoid these failures by requiring:
- canonical inventory item identity
- vendor item normalization
- demand authority recording
- controlled taxonomies
- scope-aware peer grouping
- evidence-backed benchmarking rules

## Comparison dimensions

FIFOFlow should compare:
- locations
- operation units
- inventory categories
- inventory items
- vendors and vendor strategies
- count variance behavior
- waste behavior
- purchasing behavior
- yield behavior
- margin pressure by comparable menu or operating mix

## Peer-group comparison design

Cross-location comparison must be based on peer groups, not blunt global averages.

Peer group dimensions may include:
- operation type, such as bar, buffet kitchen, commissary, banquet kitchen
- service style, such as event-driven versus daily service
- category profile, such as seafood-heavy or beverage-heavy
- demand pattern, such as forecast-driven versus sales-driven
- storage and count discipline maturity

A location should only be benchmarked against peers that share materially similar operational conditions.

## Benchmark model

Benchmark observations should store:
- metric name
- scope type and scope id
- peer group id
- comparison window
- observed value
- peer median
- peer quartiles or percentile band
- outlier status
- evidence quality label

Candidate benchmark metrics:
- count variance rate
- waste rate by category
- vendor price pressure by category
- unmapped purchase rate
- recommendation closeout speed
- standard effectiveness rate

## Best-practice discovery model

A best practice should not be inferred from one good week. FIFOFlow should require:
- repeated strong performance within a peer group
- sufficient evidence quality
- sustained outcome over multiple windows
- no obvious offsetting degradation elsewhere

Examples:
- one kitchen consistently shows lower seafood waste than peer kitchens
- one bar operation maintains stable beverage count variance with tighter count cadence
- one location's vendor strategy reduces volatility without increasing stockouts

## Recommendation propagation model

When a best-practice pattern is discovered, FIFOFlow should not silently push it elsewhere. It should generate governed cross-location recommendations.

Examples:
- `STANDARDIZE_VENDOR_STRATEGY`
- `PROPAGATE_BEST_PRACTICE`
- `REVIEW_COUNT_DISCIPLINE_STANDARD`
- `REVIEW_WASTE_CAPTURE_STANDARD`

Propagation rules:
- only propagate within compatible peer groups
- show the source location or operation unit that demonstrated the result
- attach evidence from both the source best-practice case and the destination outlier case
- require governance review before inheritance becomes active

## Inherited standards across locations

Cross-location intelligence should feed standard inheritance carefully.

Recommended inheritance model:
- one location or operation unit proves a standard locally
- the standard is reviewed at a broader scope
- FIFOFlow proposes propagation to peer units
- adoption creates scoped standard versions for target locations or operation units
- effectiveness is measured again after propagation

## Proposed signal types

- `LOCATION_VARIANCE_OUTLIER`
- `LOCATION_PRICE_OUTLIER`
- `LOCATION_WASTE_OUTLIER`
- `LOCATION_DISCIPLINE_OUTLIER`

Signal meaning:
- a location or operation unit materially deviates from peer expectations on a normalized metric

## Proposed pattern concepts

- `HIGH_VARIANCE_LOCATION`
- `BEST_PRACTICE_LOCATION`
- `WASTE_OUTLIER_LOCATION`
- `HIGH_PRICE_PRESSURE_LOCATION`
- `DISCIPLINE_GAP_LOCATION`

## Proposed recommendation concepts

- `STANDARDIZE_VENDOR_STRATEGY`
- `PROPAGATE_BEST_PRACTICE`
- `REVIEW_LOCATION_COUNT_STANDARD`
- `REVIEW_LOCATION_WASTE_PROCESS`
- `REVIEW_OPERATION_UNIT_PAR_STRATEGY`

## Draft entities needed

### peer_group_definitions

Purpose:
- define comparable operating groups for benchmarking

### benchmark_observations

Purpose:
- store normalized benchmark metrics by peer group and scope

### cross_location_recommendations

Purpose:
- store recommendations that use source and destination location evidence

### best_practice_candidates

Purpose:
- capture repeated strong performance that may justify propagation or standards review

## Guardrails

Cross-location intelligence must not:
- compare incomparable operating units
- punish locations with incomplete data as if they were poor performers
- treat volume differences as discipline failures without normalization
- propagate local standards globally without review

Cross-location intelligence is the architecture layer that lets FIFOFlow move from local issue detection to networked operational learning.
