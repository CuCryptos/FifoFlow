# Benchmark and Peer Group Model

## Why peer groups matter
Cross-location comparisons become noisy when unlike operations are compared directly. A commissary, banquet kitchen, snack bar, and high-volume bar do not share the same operating profile.

Peer groups constrain comparison to comparable operating contexts.

## Core concepts
- `peer group`: a curated set of comparable subjects
- `benchmark definition`: a named benchmark concept such as `variance.weekly.expected_range`
- `benchmark scope`: where that benchmark applies
- `benchmark snapshot`: a future derived record containing observed baseline metrics

Policies tell FIFOFlow what threshold to use. Benchmarks tell FIFOFlow what peer baseline to compare against.

## Peer group design
Locations or operation units can belong to one or more peer groups. Example peer groups:
- `high_volume_bars`
- `banquet_kitchens`
- `fine_dining_kitchens`
- `commissary_ops`
- `snack_bar_programs`

## Recommended entities
- `peer_groups`
- `peer_group_memberships`
- `benchmark_definitions`
- `benchmark_scopes`
- `benchmark_snapshots` future-facing

## Safe comparisons
Safe:
- a fine-dining kitchen against fine-dining kitchen peers
- a bar program against high-volume bar peers
- seafood cost drift within the same recipe-group benchmark family

Unsafe:
- a commissary against a table-service line kitchen
- a bar beverage program against kitchen waste benchmarks
- a location-wide benchmark applied to a storage-area-only subject without translation

## Versioning and scope
Benchmarks should be versioned or snapshotted as derived observations later. This phase only scaffolds definitions, scope attachment, and peer membership resolution.
