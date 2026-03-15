# Recipe Promotion Lineage Model

## Required lineage references

A promoted recipe version should retain references to:
- `recipe_builder_job_id`
- `recipe_builder_draft_recipe_id`
- `source_template_id` when applicable
- `source_template_version_id` when applicable
- `source_text_snapshot` when the source was freeform or should be preserved for audit

A promoted recipe ingredient row should retain references to:
- `source_parsed_row_id`
- `source_resolution_row_id`
- original raw ingredient text

## Promotion event model

Every promotion attempt should record an event with:
- builder job id
- draft recipe id
- action type
- resulting promotion status
- promoted recipe id if created or reused
- promoted recipe version id if created or reused
- notes and actor metadata when available

## Promotion links

A promotion link ties a builder draft to the operational recipe/version it produced.

This supports:
- idempotent repeat promotion handling
- later revision promotion
- provenance checks during recipe-cost and governance workflows

## Later edits

Later edits should not destroy provenance.
If a promoted recipe is revised, FIFOFlow should create a new recipe version and preserve the earlier source builder lineage rather than overwriting version history in place.
