# Recipe Cost Vendor Bridge

## Flow
promoted recipe ingredient
-> canonical ingredient
-> scoped inventory item
-> scoped vendor item
-> normalized cost candidate
-> recipe cost source row

## Costability outcomes
- `COSTABLE_NOW`: trusted inventory mapping, trusted vendor mapping, and normalized cost evidence exist.
- `OPERATIONAL_ONLY`: recipe is operationally valid, but vendor-backed costing is incomplete.
- low-confidence or partial: some cost evidence exists but is stale or incomplete.
- blocked: required identity or cost lineage is missing.

## What this phase adds
This phase creates the scoped inventory -> vendor bridge and exposes normalized cost lineage helpers. It does not yet replace the live recipe-cost source path end to end.

## Later drift and supplier-switch support
Once recipe-cost sourcing consumes this bridge directly, FIFOFlow will be able to explain not only that recipe cost changed, but whether the change came from supplier pricing, vendor-item substitution, or both.
