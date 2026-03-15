# Contributor Checklist

Before shipping a FIFOFlow data model or intelligence change, ask:

- Am I introducing a place where recipe ingredients point directly to vendor items?
- Am I using inventory items as if they are semantic ingredient identity?
- Am I attaching vendor price directly to recipe rows without a resolved identity path?
- Will this design still work if two locations stock different items for the same canonical ingredient?
- Will this design still work if vendors change pack size or SKU?
- Can FIFOFlow still explain canonical meaning, operational fulfillment, and supplier source separately?
- Am I preserving the mapping step instead of skipping it because the names happen to look similar today?
