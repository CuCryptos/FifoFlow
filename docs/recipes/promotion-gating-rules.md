# Promotion Gating Rules

## A. Save draft
Allowed when:
- builder job exists
- source text or template source exists
- parsed rows may still be incomplete

## B. Mark review-ready
Allowed when:
- draft has ingredient rows
- blocked parse failures are absent or isolated for review
- the draft can be shown as a candidate for promotion review

## C. Promote to operational recipe
Required:
- recipe name present
- yield quantity present
- yield unit present
- no `BLOCKED` ingredient rows
- no unresolved canonical ingredient identity
- no ingredient rows still marked `NEEDS_REVIEW`
- quantity and unit normalization trustworthy enough for each promoted row

Policy notes:
- vague rows like `salt to taste` should not auto-promote
- parse failures must be corrected or removed before promotion
- unresolved inventory item mapping does not block operational promotion by itself

## D. Promote to costable recipe
Required for costable status:
- operational promotion succeeded
- yield quantity and yield unit exist
- promoted rows are trustworthy
- inventory-item linkage is complete enough for costing

Important distinction:
- a recipe may be operationally promoted but still not be costable now
- unresolved inventory-item mapping may allow operational promotion but should usually keep costability at review-only status
