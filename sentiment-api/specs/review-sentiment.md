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
Review (existing): id, text, source, sentiment, confidence, created_at.

# Flows
1. A caller posts the review text and, optionally, where it came from.
2. A model classifies the sentiment and gives a confidence between 0 and 1.
3. The review is stored with its classification.
4. The stored review's id, sentiment, confidence and source are returned.

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
