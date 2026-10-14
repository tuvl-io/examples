---
name: support-triage
owner: customer-support
workflow: triage
---
# Intent
Every incoming support ticket is categorised, routed and stored. Technical tickets go straight to the
queue; urgent billing problems are investigated before a person picks them up, and the investigation
may issue a small goodwill credit — larger credits need a team lead.

# Actors
Customers (via the help widget), a classification model, a routing decision model, an investigating
agent, team leads.

# Data
- **SupportTicket** (existing) — `id` (uuid), `subject` (string), `body` (text), `category` (string),
  `urgency` (string), `resolution` (text), `created_at` (timestamptz)
- **AccountCredit** (existing) — `id` (uuid), `customer_id` (string; required), `amount` (numeric; required),
  `reason` (text), `created_at` (timestamptz)

# Flows

## Flow: triage
Trigger: POST /support/triage · signed-in
Input: `customer_id` (str), `subject` (str), `body` (str)
Ends: default 201 · failed 502
   - failed: no example — only a model or database failure reaches it

1. `classify` — llm default · in `subject`, `body` · out `category` (enum[billing, technical, account]), `urgency` (enum[low, medium, high]) · budget 300 tok, 60s, retry 2
   - parse_error, timeout, budget_exceeded → END.failed
2. `route` — decide rules + model triage-classifier ≥ 0.7 · in `category`, `urgency`, `subject`, `body` · out `route` (enum[investigate, store]) · budget 20s, retry 2
   - `category == "technical"` → store
   - `category == "billing" and urgency == "high"` → investigate
   - investigate → `investigate`
   - store → `persist`
   - low_confidence → `investigate`
3. `investigate` — loop default · in `customer_id`, `subject`, `body` · out `resolution` (str) · budget 6 iterations, 4 tool calls, 20000 tok, 3m · guardrails `no-secrets@1`
   · tools: `lookup_account`, workflow `issue_credit` (approval team_leads when `args.amount > 50`; max 1 call)
   - resolved, needs_human, max_iterations, budget_exceeded, timeout, aborted, guardrail_violation → `persist`
T1. `lookup_account` — code · effect read · tool of `loop` · in `customer_id` · out `account` (json)
4. `persist` — tool db create SupportTicket · in `subject`, `body`, `category`, `urgency`, `resolution`? · out `ticket` (SupportTicket)
   - conflict → END.failed

## Flow: issue_credit
Trigger: tool
Input: `customer_id` (str), `amount` (int), `reason` (str)
Ends: default 201 · failed 502
   - failed: no example — only a database failure reaches it

1. `credit` — tool db create AccountCredit · in `customer_id`, `amount`, `reason` · out `credit` (AccountCredit)
   - conflict → END.failed

# Policies
- Credits above 50 need a team lead's approval before they are issued.
- The investigation is bounded: at most 6 iterations, 4 tool calls, 20k tokens and 3 minutes.
- A loop that keeps repeating the same call is paused by its supervisor.

# Acceptance
```tuvl-example
name: a technical ticket is stored without investigation
input: { customer_id: C-1, subject: "App crashes", body: "The app crashes on login." }
mocks:
  classify: { outputs: { category: technical, urgency: low } }
expect:
  end: default
  path: [classify, route, persist]
  decisions: { route: { source: "rule#1" } }
  output: { status: 201, body: { category: technical } }
```
```tuvl-example
name: an urgent billing ticket is investigated and stored with its resolution
input: { customer_id: C-2, subject: "Charged twice", body: "I was billed twice this month." }
mocks:
  classify: { outputs: { category: billing, urgency: high } }
  investigate: { signal: resolved, outputs: { resolution: "Refunded the duplicate charge." } }
expect:
  end: default
  path: [classify, route, investigate, persist]
  decisions: { route: { source: "rule#2" } }
  output: { status: 201, body: { category: billing, resolution: "Refunded the duplicate charge." } }
```
```tuvl-example
name: an uncertain routing decision is investigated
input: { customer_id: C-3, subject: "Account question", body: "How do I change my email?" }
mocks:
  classify: { outputs: { category: account, urgency: low } }
  route: { signal: low_confidence }
  investigate: { signal: needs_human, outputs: { resolution: "Needs an account specialist." } }
expect:
  end: default
  path: [classify, route, investigate, persist]
```
```tuvl-example
name: a credit is recorded
workflow: issue_credit
input: { customer_id: C-2, amount: 20, reason: duplicate charge }
expect:
  end: default
  path: [credit]
  output: { status: 201 }
```
