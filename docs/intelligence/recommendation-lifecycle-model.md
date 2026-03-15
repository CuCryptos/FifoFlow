# Recommendation Lifecycle Model

## Statuses
### OPEN
New synthesized recommendation awaiting operator review.

### REVIEWED
A human has examined the recommendation but not yet closed it.

### ACTIVE
The recommendation is being acted on operationally.

### DISMISSED
The recommendation was reviewed and intentionally not pursued.

### SUPERSEDED
A stronger or materially changed recommendation replaced the older active case.

## Dedupe rules
Current active dedupe is deterministic:
- same `recommendation_type`
- same recommendation subject key
- active status window

If a new synthesized recommendation matches the active case and is not materially different, FIFOFlow updates the existing recommendation instead of creating a duplicate.

## Supersession rules
If a matching active recommendation exists but the synthesized action changes materially, FIFOFlow supersedes the older recommendation and creates a new one.

Material change currently includes changes to:
- summary
- severity
- confidence
- urgency
- expected benefit payload
- operator action payload

## Reconfirmation behavior
When later signals reconfirm the same active recommendation case:
- the existing recommendation is updated
- evidence count is refreshed
- additional evidence refs are attached
- history is preserved

## New-case behavior
A materially different subject case should create a new recommendation.
Examples:
- a different recipe
- a different scoped inventory variance case
- a different vendor-item pricing case

## Recommendations vs standards
Recommendations are operator actions.
Standards are governed operating rules.

A recommendation can later support standards review, but it is not itself a standard and should not be treated as one.
