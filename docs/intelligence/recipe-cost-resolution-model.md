# Recipe Cost Resolution Model

Ingredient cost resolution is the deterministic process that selects a trusted cost source for each recipe ingredient.

## Cost-source precedence

Approved starting precedence:
1. invoice-line-linked recent normalized cost
2. vendor_price_history normalized cost
3. last trusted normalized ingredient cost snapshot
4. fallback manual cost override if explicitly allowed

Resolution should stop at the first precedence level that yields one trusted, explainable answer.

## Source types

### 1. Invoice-line-linked recent normalized cost

Valid when:
- the invoice line is confidently matched to the canonical inventory item or vendor item
- the invoice cost is normalized to the inventory item base unit
- the invoice is recent enough to be considered current

Evidence carried:
- invoice id
- invoice line id
- vendor item reference
- normalized unit cost
- invoice date

Confidence implication:
- highest confidence available in the current model

Failure modes:
- low-confidence matching
- stale invoice
- pack normalization failure
- multiple recent invoice lines with materially different normalized costs and no clear selection rule

### 2. vendor_price_history normalized cost

Valid when:
- the vendor price record is normalized to the canonical inventory base unit
- the price history record is recent enough
- the vendor item mapping is trustworthy

Evidence carried:
- vendor item id or derived vendor item key
- vendor price history row id
- normalized unit cost
- effective timestamp

Confidence implication:
- strong but below invoice-linked cost because it may not reflect the most recent received price

Failure modes:
- stale effective price
- pack normalization gaps
- multiple active vendor prices with no preferred vendor rule

### 3. Last trusted normalized ingredient cost snapshot

Valid when:
- a prior cost snapshot exists for the same inventory item
- the prior snapshot was marked trusted enough for fallback use
- no stronger current source exists

Evidence carried:
- prior snapshot id
- source timestamp
- normalized unit cost captured then

Confidence implication:
- fallback confidence only; should degrade when aged

Failure modes:
- stale beyond threshold
- prior snapshot itself was incomplete or ambiguous

### 4. Fallback manual cost override

Valid when:
- the business explicitly allowed an override for the inventory item or recipe ingredient
- the override scope and date are clear

Evidence carried:
- override row id
- author or approver
- effective date window
- justification note

Confidence implication:
- usable for continuity, but should remain visible as an override and not masquerade as observed cost

Failure modes:
- expired override
- override without reviewer or justification
- override contradicts fresher trusted observed cost

## Ingredient cost resolution log

Each ingredient resolution attempt should record:
- recipe id
- recipe item id
- inventory item id
- chosen source type, if any
- chosen normalized unit cost, if any
- source reference
- stale flag
- ambiguity count
- explanation text
- evidence references

This is the per-ingredient audit trail for every snapshot.

## Missing-cost handling

When no trusted cost source exists:
- resolution status = `missing_cost`
- do not invent a cost
- do not mark the recipe snapshot complete
- preserve the ingredient as unresolved with explanation text

## Stale-cost handling

When the best available cost source is older than the freshness threshold:
- resolution status = `stale_cost`
- allow cost calculation only as a partial or degraded-confidence snapshot
- record stale age and threshold in the resolution log

## Multi-vendor ambiguity handling

When multiple candidates exist at the same precedence level and no deterministic tie-breaker applies:
- resolution status = `ambiguous_cost`
- do not silently average costs
- do not silently choose a vendor unless a preferred vendor rule or deterministic freshness rule resolves it
- mark the recipe snapshot incomplete

## Pack-to-base-unit normalization requirements

A cost source is only valid if it can be normalized to the ingredient base unit.

Minimum normalization requirements:
- known canonical base unit on the inventory item
- known candidate cost basis unit
- compatible conversion path between source unit and base unit
- pack quantity information when the source is priced per case, bottle, box, or other packaging unit

If no trusted conversion exists:
- treat the ingredient as unresolved or unit mismatched
- do not synthesize a cost
