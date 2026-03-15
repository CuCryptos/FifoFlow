# Inventory Mapping Confidence and Review Model

## Mapping statuses
- `UNMAPPED`: no safe inventory item candidate was found
- `AUTO_MAPPED`: a unique deterministic match was accepted automatically
- `NEEDS_REVIEW`: one or more candidates exist but FIFOFlow will not guess
- `MANUALLY_MAPPED`: a human approved the mapping
- `REJECTED`: a human rejected automated mapping for this scope

## Confidence labels
- `HIGH`: unique deterministic match or approved manual mapping
- `MEDIUM`: reserved for future constrained review flows
- `LOW`: unresolved or ambiguous outcomes

## Match reasons
- `exact_inventory_name`
- `normalized_inventory_name`
- `alias_based_match`
- `scoped_default`
- `manual_resolution`
- `ambiguous_inventory_match`
- `no_match`

## Auto-accept policy
Auto-accept is allowed only when one active inventory item matches safely through:
- exact inventory name
- normalized inventory name
- alias-based overlap that still resolves to one unique inventory item

## Review policy
A mapping must go to review when:
- multiple inventory items match the same canonical ingredient
- scope filtering still leaves multiple plausible operational items
- inventory catalog drift makes prior assumptions unsafe

## Rejections and remapping
Rejected mappings should remain visible and durable. Reruns should not silently replace them. If the inventory catalog changes later, a new automated pass may produce new candidates, but human rejection remains part of the lineage.
