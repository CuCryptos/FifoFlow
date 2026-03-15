# Recipe Template And Freeform Ingestion

The builder supports two bounded ingestion modes in this phase.

## A. Template-based assembly

Flow:
- start from an existing recipe template
- load structured template ingredient rows
- seed parsed rows directly from template quantity, unit, and ingredient name
- reuse template ingredient canonical mapping if one already exists and is trusted
- route the rows into the common draft assembly model

Template mode avoids reparsing text that is already structured.

## B. Freeform ingredient-list assembly

Flow:
- accept pasted ingredient-list text
- split into lines
- parse each line deterministically
- resolve canonical ingredient identity where possible
- persist parsed rows and resolution rows
- route the rows into the common draft assembly model

## Convergence model

Both modes end in the same persisted outputs:
- `recipe_builder_jobs`
- `recipe_builder_parsed_rows`
- `recipe_builder_resolution_rows`
- `recipe_builder_draft_recipes`

That convergence matters because later review, costing, and recipe creation should not care whether the draft started from:
- a template
- a prep sheet
- a pasted ingredient list
