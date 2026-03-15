# Canonical Ingredient Guardrail

This module owns semantic ingredient identity.

It does not own:
- operational inventory item identity
- vendor-item identity

Keep canonical ingredient resolution explicit so downstream recipe, pricing, and cross-location logic do not treat local item names or supplier descriptions as universal truth.
