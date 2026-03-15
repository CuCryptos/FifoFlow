# Recipe Cost Identity Guardrail

Recipe cost logic must not collapse:
- canonical ingredient identity
- inventory item identity
- vendor-item identity

Recipe cost starts from recipe meaning, then resolves through operational fulfillment and supplier cost evidence.

Required path:
`recipe ingredient -> canonical ingredient -> inventory item -> vendor item`

If a future change tries to attach vendor price directly to recipe semantics, it is the wrong model.
