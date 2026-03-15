# Memo Section Model

## Section order
1. `Top Priority Items`
2. `Price Watch`
3. `Recipe Cost Watch`
4. `Inventory Discipline`
5. `Needs Review / Incomplete Intelligence`
6. `Standards Review`

## Section definitions
### Top Priority Items
- Purpose: highest-ranked items across all live packs
- Source types: all memo-eligible signals
- Default max items: `5`
- Summary style: cross-pack operating brief

### Price Watch
- Source types: `PRICE_INCREASE`, `PRICE_DROP`, `PRICE_VOLATILITY`
- Default max items: `5`
- Summary style: purchasing-focused cost movement and supplier instability

### Recipe Cost Watch
- Source types: `RECIPE_COST_DRIFT`, `INGREDIENT_COST_DRIVER`
- Default max items: `5`
- Summary style: recipe profitability and driver movement

### Inventory Discipline
- Source types: `COUNT_VARIANCE`, `COUNT_INCONSISTENCY`
- Default max items: `5`
- Summary style: count execution and repeated operational inconsistency

### Needs Review / Incomplete Intelligence
- Source types: any memo item with low trust markers, including:
  - policy fallback used
  - `Early signal`
  - thin evidence
- Default max items: `5`
- Summary style: items the operator should review with caution

### Standards Review
- Source types: none yet in this phase
- Default max items: `3`
- Summary style: placeholder only until standards-review payloads are durable memo inputs

## Low-trust handling
Low-trust items are not discarded. They remain visible, but are pulled into `Needs Review / Incomplete Intelligence` so the memo does not present them as equally settled facts.
