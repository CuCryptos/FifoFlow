# Scoped Inventory Mapping Model

## Core entities
- `canonical_inventory_mappings`
- `canonical_inventory_mapping_candidates`
- `canonical_inventory_mapping_review_events` optional review history

## Scope levels
Mappings can attach to:
- `organization`
- `location`
- `operation_unit`

## Resolution order
1. exact `operation_unit` mapping
2. `location` mapping
3. `organization` default
4. no trusted mapping

## Behavior
- Organization mappings provide the baseline operational default.
- Location mappings override when a location stocks a different operational item.
- Operation-unit mappings override when a bar, prep kitchen, or another unit needs a different stocked item than the broader location default.

## Active and inactive records
- Active mappings participate in resolution.
- Inactive mappings remain historical but are ignored.

## Preferred versus alternate
- A preferred mapping is the resolver's first trusted choice for that scope.
- Alternate mappings are valid but not primary.
- Automated matching in this phase manages preferred mappings only. Alternate paths remain candidate or manual review material until approved.

## Engine contract
Future engines should resolve inventory items by:
- `canonical_ingredient_id`
- subject scope context

The response should identify:
- resolved inventory item id if trusted
- matched scope
- mapping status
- confidence
- explanation text
