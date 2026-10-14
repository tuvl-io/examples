---
name: review-sentiment
owner: product-feedback
workflow: analyze_sentiment
---
# Intent
Product reviews arrive from the storefront and from support. Each one is classified as positive,
neutral or negative with a confidence, stored, and returned to the caller, so dashboards and
follow-up flows can use the classification.

# Actors
The storefront and support tools (callers), a sentiment model.

# Data
- **Review** (existing) — `id` (uuid), `text` (text; required), `source` (string),
  `sentiment` (enum: positive | neutral | negative; required), `confidence` (numeric; required),
  `created_at` (timestamptz)

# Flows

## Flow: analyze_sentiment
Trigger: POST /api/reviews/analyze · signed-in
Input: `text` (str), `source` (str?)
Ends: default 200 · failed 502

1. `classify` — llm default · in `text` · out `sentiment` (enum[positive, neutral, negative]), `confidence` (float) · budget 1000 tok, 60s, retry 2
   - parse_error, timeout, budget_exceeded → END.failed
2. `persist` — tool db create Review · in `text`, `source`, `sentiment`, `confidence` · out `review` (Review)
   - conflict → END.failed

# Policies
- The classification is based on the review text only.
- If the model fails or returns an unusable answer, the caller gets a 502 and nothing is stored.
- At most 1k model tokens per review.

# Acceptance
```tuvl-example
name: a positive review is stored and returned
input: { text: "Love it — works perfectly and arrived early.", source: storefront }
mocks:
  classify: { outputs: { sentiment: positive, confidence: 0.94 } }
expect:
  end: default
  path: [classify, persist]
  output: { status: 200, body: { sentiment: positive, source: storefront } }
  assertions: ["output.body.confidence == 0.94"]
```
```tuvl-example
name: a model failure returns 502 and stores nothing
input: { text: "meh" }
mocks:
  classify: { signal: parse_error }
expect:
  end: failed
  path: [classify]
  output: { status: 502 }
```
