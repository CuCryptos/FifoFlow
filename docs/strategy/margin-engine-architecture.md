# Margin Engine Architecture

Restaurants and hospitality groups do not buy software because they enjoy tracking inventory. They buy software because margin erosion is hard to see early and expensive to discover late.

FIFOFlow's long-term enterprise value comes from becoming an operational margin engine, not a better count screen.

## Why margin protection matters more than inventory tracking

Inventory tracking is a means. Margin protection is the business outcome.

Operators care about:
- which cost drivers changed
- whether theoretical margin is holding
- where actual margin is leaking
- which operational changes protect margin fastest

A margin engine turns inventory, recipe, waste, and purchasing data into explanations for margin movement.

## Margin engine inputs

The margin engine should connect:
- vendor prices
- vendor price history
- recipes and recipe versions
- yields and prep output
- counts
- waste
- purchasing behavior
- theoretical usage snapshots
- actual usage snapshots
- menu item mappings
- sales or committed demand

## Core margin concepts

### Theoretical margin

Margin implied by current menu pricing, recipe cost, and expected yield under standard operating behavior.

### Actual margin

Margin implied by observed operational behavior, including waste, yield loss, purchasing cost pressure, and unexplained depletion.

### Margin drift

The difference between prior margin expectation and current margin expectation across a defined period.

### Margin pressure

Current factors actively reducing expected or realized margin.

### Margin opportunity

Operational or commercial actions that could improve margin without relying on vague optimization.

## Operational driver model

The margin engine should explain `What Changed?` in operational terms, not finance-only terms.

Driver categories:
- ingredient price increase
- yield loss
- waste concentration
- over-ordering and exposure
- count variance and unexplained usage
- vendor instability
- portion or prep deviation

Example explanation:
- `Margin pressure on Seared Ahi Plate increased this week because tuna cost rose 11.3%, observed yield on prep ran 6 points below standard, and waste clustered in Paradise Kitchen under SPOILAGE and TRIM_LOSS.`

## Margin signals

Proposed signal types:
- `MARGIN_DRIFT`
- `MARGIN_RISK`
- `MARGIN_OPPORTUNITY`
- `RECIPE_MARGIN_PRESSURE`
- `YIELD_MARGIN_LOSS`

Signal guidance:
- `MARGIN_DRIFT`: expected or realized margin moved materially from prior period
- `MARGIN_RISK`: margin is exposed to worsening based on current operational conditions
- `MARGIN_OPPORTUNITY`: concrete operational change could improve margin
- `RECIPE_MARGIN_PRESSURE`: one recipe is under specific cost/yield pressure
- `YIELD_MARGIN_LOSS`: yield degradation is materially reducing effective margin

## Margin recommendations

Proposed recommendation types:
- `REVIEW_MENU_PRICE`
- `REVIEW_PORTION_STANDARD`
- `REVIEW_VENDOR_COST`
- `REVIEW_PREP_YIELD`
- `REDUCE_PAR_EXPOSURE`

These should remain deterministic and traceable.

## Margin outputs FIFOFlow should eventually support

FIFOFlow should eventually be able to tell a manager:
- what changed in margin this week
- which recipes are under margin pressure
- which operational drivers are causing the change
- which recommendation would most likely protect margin first
- which standards improved or failed to improve margin after adoption

## Theoretical versus actual margin

A trusted margin engine requires both:
- theoretical margin from recipe cost, menu mapping, and demand
- actual margin from observed inventory and waste behavior

Without both layers, margin reporting is only partial.

## Margin opportunity model

Margin opportunity should not mean generic cost cutting. It should mean specific, evidence-backed interventions such as:
- use a more stable vendor strategy for one high-pressure ingredient
- tighten yield on a prep recipe losing margin through trim and cook loss
- reduce par exposure on a high-volatility, perishable item
- review portion standard where actual depletion exceeds theoretical demand

## Prerequisite layers before trustable margin outputs

The margin engine cannot be trusted until these layers exist:
- durable intelligence persistence
- canonical vendor item and vendor price history
- recipe cost intelligence
- yield intelligence
- waste intelligence
- theoretical usage snapshots with demand authority recorded
- actual usage snapshots from counts and stock movements
- controlled taxonomies for waste and transaction reasons
- standards review workflows

## Draft margin entities

### margin_snapshots

Purpose:
- store theoretical and actual margin values over time by scope

### margin_drivers

Purpose:
- store decomposed operational contributors to margin movement

### margin_recommendations

Purpose:
- store recommendation records specifically tied to margin protection outcomes

### margin_baselines

Purpose:
- preserve baseline assumptions for comparison windows

## Margin trust rules

The margin engine must never say `margin is down` without saying why.

Required support for every material margin conclusion:
- comparison window
- scope
- driver list
- evidence-backed contribution estimates
- confidence label
- unresolved data quality caveats when applicable

The operational margin engine is FIFOFlow's eventual enterprise layer. It is the stage where inventory intelligence becomes direct financial protection.
