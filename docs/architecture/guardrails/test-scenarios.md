# Test Scenarios

Future features should test these minimum identity-discipline scenarios.

## Canonical ingredient, different inventory items
- same canonical ingredient
- different inventory items across locations
- recipe meaning remains stable
- cross-location logic still compares safely

## Same inventory intent, different vendor packs
- one inventory item
- multiple vendor items over time
- price history changes without changing recipe semantics

## Vendor switch without recipe semantic change
- same canonical ingredient
- same operational inventory intent
- different supplier SKU
- recipe cost change should attribute to vendor cost, not recipe meaning

## Recipe cost change caused by vendor price change
- same recipe
- same canonical ingredient mapping
- same inventory item mapping
- vendor price rises
- drift should be explainable as supplier cost pressure

## Cross-location comparison with shared canonical meaning
- location A and B use different inventory items
- both map to the same canonical ingredient
- benchmarking works only because canonical identity is stable

## Unsafe shortcut prevention
- ensure no feature silently treats invoice descriptions as canonical ingredient identity
- ensure no feature attaches vendor price directly to recipe rows without lineage
