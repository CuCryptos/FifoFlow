# Recipe Cost Snapshot Model

Recipe cost snapshots are derived facts. They store the explainable current cost state of a recipe at a point in time.

## recipe_cost_snapshots

Purpose:
- store one recipe-level cost view per snapshot run or effective point in time

Why it exists:
- the system needs a stable recipe cost fact to compare later when detecting drift, margin pressure, or standard effectiveness

Core fields:
- recipe id
- recipe name
- recipe type
- yield quantity and unit
- serving count if known
- total trusted cost
- resolved subtotal
- cost per yield unit
- cost per serving
- completeness status
- confidence label
- resolved ingredient counts and exception counts
- driver items
- snapshot timestamp

Key relationships:
- has many `recipe_ingredient_cost_components`
- has many `ingredient_cost_resolution_log` rows through the components
- later becomes input to `RECIPE_COST_DRIFT`

Classification:
- derived data

Lineage requirements:
- should point back to the specific ingredient component rows used to build the total

## recipe_ingredient_cost_components

Purpose:
- store the per-ingredient cost contribution for a recipe snapshot

Why it exists:
- operators need to see which ingredient lines are driving cost, not only the rolled-up total

Core fields:
- recipe snapshot id
- recipe item id
- inventory item id and name
- quantity in recipe
- recipe unit
- normalized quantity
- base unit
- normalized unit cost
- line cost
- resolution status

Key relationships:
- belongs to one `recipe_cost_snapshot`
- references one `ingredient_cost_resolution_log` row

Classification:
- derived data

Lineage requirements:
- should preserve which resolution row supported the line cost

## ingredient_cost_resolution_log

Purpose:
- store the audit log of how FIFOFlow tried to resolve each ingredient's cost

Why it exists:
- recipe cost trust depends on showing how each ingredient cost was chosen or why it could not be chosen

Core fields:
- recipe id
- recipe item id
- inventory item id
- chosen source type
- chosen normalized cost
- source ref table and ref id
- observed timestamp
- stale threshold and stale flag
- ambiguity count
- explanation text
- evidence refs

Key relationships:
- can feed one or more `recipe_ingredient_cost_components`
- later supports cost drift explanation and recommendation evidence

Classification:
- derived audit data

Lineage requirements:
- must preserve evidence refs to invoice lines, vendor price history, prior snapshots, or overrides

## Snapshot design requirements

The model should support:
- total recipe cost when complete enough to trust
- resolved subtotal even when some ingredients are unresolved
- cost per yield unit when yield is known and total cost is trusted
- cost per serving when serving count is known and total cost is trusted
- driver items ordered by line-cost contribution
- completeness and confidence indicators that stop the system from overstating certainty
