# Policy Scope Model

## Supported dimensions
FIFOFlow policies can attach to these scope dimensions:
- `organization`
- `location`
- `operation_unit`
- `storage_area`
- `inventory_category`
- `recipe_group`
- `peer_group`
- exact subject entity override
- `global` platform default

## Subject scope context
Every future engine should pass a subject scope context that may include:
- `organization_id`
- `location_id`
- `operation_unit_id`
- `storage_area_id`
- `inventory_category_id`
- `recipe_group_id`
- `peer_group_ids[]`
- `subject_entity_type`
- `subject_entity_id`

The engine owns building the context. The policy layer owns resolving the best matching active policy.

## Recommended entities
- `policy_definitions`: stable identity for a policy key such as `price.volatility.threshold`
- `policy_versions`: dated versions of a definition
- `policy_scopes`: where a version applies
- `policy_values`: actual JSON value payload for that scope
- `policy_resolution_logs` optional future audit trail

## Defaults and overrides
- Global defaults are regular policy scopes with `scope_type = global`.
- Scoped overrides are more specific policy scopes tied to one scope dimension.
- Exact subject overrides are for rare, controlled exceptions.

## Version history
Policies should keep effective-date history.
- A version is active when `effective_start_at <= effective_at`.
- It stops applying when `effective_end_at` is reached or the version is deactivated.
- New versions should not mutate historical meaning.

## Engine contract
Future engines should ask for policy resolution by:
- `policy_key`
- subject scope context
- `effective_at`

The response should include:
- resolved value
- matched scope
- policy version id
- explanation text and resolution path
