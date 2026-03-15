# Weekly Operating Memo Strategy

The Weekly Operating Memo is a first-class FIFOFlow product surface. It is not a reporting export and it is not a dashboard summary. It is the operational brief that translates FIFOFlow's evidence, signals, patterns, recommendations, and standards into weekly management action.

## Why memo beats dashboard for operators

Dashboards assume the operator will browse, interpret, and prioritize. Most kitchen and bar leaders do not operate that way. They work from urgent issues, short review windows, and accountable follow-up.

A weekly memo is superior because it:
- starts with what changed and what matters now
- ranks issues instead of showing all issues equally
- binds evidence to accountable actions
- fits weekly kitchen, purchasing, and leadership rhythms
- reinforces review discipline for recommendations and standards

The memo should reduce the operator burden of asking:
- what moved this week
- what needs my attention first
- which issues are repeated versus one-off
- what standard requires review

## Memo audience types

### Kitchen Manager

Needs:
- recipe cost drift
- yield drift
- count variance by operation unit and storage area
- waste concentration by item, recipe, and reason code
- portion or prep issues requiring correction

### Bar Manager

Needs:
- beverage price volatility
- pack or vendor instability
- count inconsistency by bar cage or bar storage
- spoilage and overpour signals
- par and transfer issues

### Purchasing Owner

Needs:
- vendor review candidates
- price watch by vendor item and category
- over-order and under-order patterns
- unmapped purchases blocking theoretical demand coverage
- standards to adopt around vendor and pack strategy

### Executive Approver

Needs:
- location-level pressure summary
- highest-cost drift drivers
- standards due for approval or retirement
- multi-unit issues that require broader policy
- evidence-backed decisions, not alert volume

## Memo sections

### Price watch

Focus:
- largest normalized price increases and drops
- unstable vendor pricing patterns
- vendor review recommendations
- exposure by high-cost category

### Recipe cost drift

Focus:
- recipes with material cost movement
- ingredient contributors to drift
- margin-sensitive menu impact
- review candidates for recipe cost or yield

### Variance watchlist

Focus:
- repeated count variance
- count inconsistency by storage area or operation unit
- unexplained actual-versus-theoretical gaps
- urgent cycle count recommendations

### Purchasing mismatch

Focus:
- purchases above or below theoretical demand
- items not cleanly tied to recipe demand
- over-order and under-order pattern candidates
- vendor pack or mapping issues that distort demand coverage

### Waste watchlist

Focus:
- waste spikes by item, recipe, and operation unit
- recurring waste reasons
- concentration by high-cost categories
- waste capture discipline issues

### Top recommendations

Focus:
- immediate and this-week actions
- owner role
- expected benefit
- evidence anchor
- whether prior similar recommendations existed and whether they worked

### Standards needing review

Focus:
- adopted standards reaching review cadence
- standards with proven gains worth promotion
- standards not showing expected improvement
- retirement or narrowing candidates

## Memo generation inputs

Required upstream inputs:
- derived signals
- pattern observations
- recommendations
- standards and effectiveness reviews
- normalized price history
- recipe cost snapshots
- theoretical usage snapshots
- actual usage snapshots
- variance events
- waste events
- threshold configuration
- urgency rules

Required metadata:
- memo scope
- week start and end
- operator role or audience type
- evidence completeness flags

## Ranking and prioritization rules

Memo ranking should not be generic scoring. It should be deterministic.

Suggested ordering logic:
- `IMMEDIATE` urgency before `THIS_WEEK`, then `MONITOR`
- higher severity before lower severity
- stable patterns before early signals when urgency is equal
- financially material issues before low-cost issues
- unresolved repeat issues before first-time issues
- standards review due before standards review upcoming

Section-level rules:
- cap each section to the most operationally important items first
- include a short overflow note if more issues exist than shown
- suppress noisy low-confidence items unless they are high severity or repeated

## Urgency handling

Memo output must honor the approved urgency labels:
- `IMMEDIATE`
- `THIS_WEEK`
- `MONITOR`

Urgency display guidance:
- `IMMEDIATE`: same-day or next-shift decision required
- `THIS_WEEK`: should be assigned and acted on in the current operating week
- `MONITOR`: visible for awareness, not immediate intervention

Urgency must remain explainable from rule output, not from generic sentiment.

## Explainability requirements

Every memo statement should be traceable to:
- source facts
- derived facts
- signal or pattern type
- time window
- scope
- threshold or rule version

Operators should be able to ask:
- why is this in the memo
- what evidence supports it
- was this seen before
- what changed since last week

The memo should never make unsupported claims like `costs are up` without naming the items, deltas, and windows involved.

## Good operator-facing memo language

Good language:
- `Ahi Tuna cost increased 11.3% over the last two supplier price observations. Paradise Kitchen is now carrying the highest seafood input pressure this week.`
- `Walk In counts for House Red Wine missed system quantity in 3 of the last 5 sessions. Count discipline should be tightened before the next weekend service.`
- `Romaine waste in the commissary exceeded recent baseline by 2.1x, mostly tagged as SPOILAGE and OVERPREP.`
- `Review Southern Glazers pricing for Champagne split packs. Volatility repeated across three recent observations and is now affecting beverage cost stability.`

Bad language:
- `Inventory appears suboptimal.`
- `Several items may need attention.`
- `Costs are trending unfavorably.`
- `There are anomalies in your operation.`

## Product role of the memo

The weekly memo is FIFOFlow's operational command surface. Dashboards may exist later, but the memo is the system's weekly delivery mechanism for deterministic intelligence, governance prompts, and margin protection decisions.
