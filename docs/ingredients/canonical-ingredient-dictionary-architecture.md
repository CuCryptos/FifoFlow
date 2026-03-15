# Canonical Ingredient Dictionary Architecture

## Purpose

FIFOFlow needs one stable ingredient identity layer that sits above local inventory naming and supplier naming. That layer is the canonical ingredient dictionary.

Without it, the system cannot reliably compare:

- recipe templates across kitchens
- recipe ingredients across locations
- vendor items across suppliers
- price history for the same kitchen ingredient
- cost and variance patterns across operating units

## Why canonical ingredient identity is required

Inventory items are operational stock records. Vendor items are supplier-specific purchasable records. Neither is a safe cross-workflow identity on its own.

Canonical ingredients exist to answer a narrower and more stable question:

- what is the kitchen ingredient or ingredient family this record represents?

That stable identity is the substrate for deterministic mapping.

## Canonical ingredient vs inventory item vs vendor item

### Canonical ingredient

A canonical ingredient is a normalized kitchen identity such as:

- `parmesan cheese`
- `extra virgin olive oil`
- `ahi tuna`

It carries:

- stable canonical name
- ingredient category
- canonical base unit
- perishability flag
- active status

### Inventory item

An inventory item is an operational stock object inside a specific business context. It may include:

- local naming
- pack structure
- order unit
- storage assignment
- vendor default
- current quantity
- venue or operation-unit context

Examples:

- `Parmesan Shaved 5 lb`
- `Ahi Tuna #1 loins`
- `EVOO house bottle`

Many inventory items may map to one canonical ingredient.

### Vendor item

A vendor item is a supplier-specific purchasable SKU or pack. It may include:

- supplier name
- supplier description
- supplier SKU
- purchasable pack definition
- current and historical supplier pricing

Examples:

- `SYSCO PARM REGG WEDGE 2/5LB`
- `Y HATA EVOO EXTRA VIRGIN 6/1L`

Many vendor items may map to one canonical ingredient.

## Long-term relationship model

- `canonical ingredient` is the stable kitchen identity
- `inventory item` is the operational stock record
- `vendor item` is the supplier-specific purchasable record
- `recipe ingredient` is a usage reference that should resolve to a canonical ingredient and, where possible, an inventory item
- `template ingredient` is a seed-library ingredient label that should resolve to a canonical ingredient before instantiation into live recipes

## How the dictionary supports FIFOFlow

### Template ingredient mapping

Template ingredients can be resolved into canonical ingredients before any location-specific inventory mapping exists. This prevents template drift such as one template using `parm` and another using `parmesan cheese`.

### Recipe ingredient normalization

Operational recipes can resolve ingredient names into canonical identity before costing or usage comparison. That keeps later recipe cost and variance logic grounded in stable ingredient identity.

### Vendor item normalization

Vendor descriptions and aliases can later resolve to canonical ingredients through deterministic mapping and review queues.

### Price intelligence

Stable ingredient identity allows vendor-item price signals to roll up into ingredient-level understanding later without collapsing distinct ingredients unsafely.

### Recipe cost intelligence

Canonical ingredient identity is the bridge between recipe ingredient references and normalized ingredient cost sources.

### Cross-location comparability

Two kitchens may stock different local inventory items for the same ingredient. Cross-location benchmarking only works if those records can resolve to the same canonical ingredient layer.

## Category and base unit use

### Category

Category is a semantic grouping used for:

- mapping review queues
- cross-location rollups
- future threshold policy
- ingredient dictionary governance

Category is not a substitute for canonical identity.

### Base unit

Base unit defines the expected normalized measurement for that canonical ingredient. It supports:

- consistent cost normalization
- ingredient quantity normalization
- safer mapping validation

Examples:

- `parmesan cheese` -> `g`
- `champagne` -> `ml`
- `egg` -> `each`

## How ingredient identity prevents drift

The canonical dictionary prevents common operational drift:

- templates inventing new ingredient labels for the same thing
- recipes using informal aliases inconsistently
- supplier descriptions becoming accidental canonical names
- locations benchmarking unlike records as if they were the same ingredient

The rule is strict:

- canonical ingredient identity must be stable
- local naming can vary
- supplier naming can vary
- mapping must explain how the runtime arrived at the canonical identity
