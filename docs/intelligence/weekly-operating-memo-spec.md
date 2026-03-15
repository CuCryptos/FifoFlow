# FIFOFlow Weekly Operating Memo Spec

The weekly operating memo is not a dashboard dump. It is a manager-facing operations brief for one week of kitchen, bar, or hospitality activity.

The memo should help an operator answer:
- what changed this week
- where cost or usage drift is building
- what needs immediate review
- which recommendations deserve action first
- which standards need follow-up

## Audience

Primary users:
- kitchen manager
- bar manager
- inventory lead
- purchasing manager
- F&B director

## Memo scope

The memo should be generated for a chosen scope:
- organization summary
- location summary
- operation unit summary

The default working memo should be location plus operation unit aware so it reflects real kitchen and bar execution.

## Memo sections

### 1. Price watch

Purpose: highlight material input cost changes that affect purchasing or recipe costing.

Include:
- biggest normalized price increases
- unstable vendor items
- items needing vendor review
- whether alternates exist

Example output style:
- `Ahi Tuna: +11.3% vs last invoice from Vendor A; now $7.12/lb`
- `Champagne split pack pricing unstable across 3 invoices; review preferred vendor item`

### 2. Recipe cost drift

Purpose: show which active recipes are becoming more expensive and why.

Include:
- top recipes with total cost drift
- top ingredient contributors
- whether recipe review is recommended
- whether margin-sensitive menu items are exposed

Example output style:
- `Seared Ahi Plate: +8.4% cost drift, driven by tuna and sesame oil`

### 3. Variance watchlist

Purpose: show where counts and actual depletion are not matching expectations.

Include:
- items with repeated count variance
- storage areas with count inconsistency
- unresolved non-recipe usage candidates
- urgent cycle count recommendations

Example output style:
- `Walk In / Ahi Tuna: 3 of last 5 counts outside tolerance`

### 4. Purchasing mismatch

Purpose: compare buying behavior to recipe demand and par assumptions.

Include:
- recurring over-order candidates
- recurring under-order candidates
- purchases not tied to mapped recipe demand
- open unmapped purchase issues

Example output style:
- `Panko Breadcrumbs purchased 42% above theoretical demand over the last 2 weeks`

### 5. Waste watchlist

Purpose: isolate waste conditions that deserve operator review.

Include:
- items with waste spikes
- repeated waste reasons by operation unit
- recipes or prep flows associated with waste drift
- recommendations to tighten waste capture or process

Example output style:
- `Paradise Kitchen: Ahi Tuna waste 3.2x baseline this week, mostly spoilage`

### 6. Top recommendations

Purpose: list the most actionable next steps.

Recommendation ordering should consider:
- severity
- confidence
- financial impact
- operational urgency
- owner clarity

Each recommendation row should include:
- recommendation summary
- owner role
- due timing
- expected benefit
- evidence anchor

### 7. Standards needing review

Purpose: ensure adopted standards are measured instead of forgotten.

Include:
- adopted standards due for effectiveness review
- standards that improved outcomes
- standards showing weak or inconclusive results
- standards that should be retired or widened

## Memo format

Recommended memo structure:
- title with scope and week-ending date
- one-paragraph operator summary
- seven structured sections in fixed order
- each section capped to the most important items first
- evidence-backed language, not vague trend talk

## Tone and language

The memo should sound like an operating memo for a kitchen manager.

It should:
- use item, recipe, vendor, and storage names operators recognize
- state concrete deltas and time windows
- avoid abstract analytics wording
- make clear when confidence is weak or evidence is incomplete

It should not:
- sound like a generic BI dashboard
- hide uncertainty
- present recommendations without evidence

## Required fields for memo generation

- scope type and scope id
- memo period start and end
- top price signals
- top recipe drift signals
- top variance patterns
- top purchasing mismatch patterns
- top waste patterns
- open recommendations
- standards effectiveness reviews due

## Example summary paragraph

`This week, seafood cost pressure increased, with tuna and shrimp showing the largest input changes. Paradise Kitchen also showed repeated count variance in the Walk In and elevated tuna waste. Purchasing on two dry goods items remained above theoretical demand. Three recommendations need action this week: review tuna sourcing, tighten Walk In count discipline, and resolve two unmapped purchases blocking recipe-demand coverage.`

## Operational use

The weekly memo is the manager-facing output of FIFOFlow's intelligence engine. It is how the platform turns facts, signals, and recommendations into a disciplined weekly operating conversation.
