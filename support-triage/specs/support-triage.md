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
SupportTicket (existing): id, subject, body, category, urgency, resolution, created_at.
AccountCredit (existing): id, customer_id, amount, reason, created_at.

# Flows
1. The widget posts the customer id, subject and body.
2. A model classifies the category (billing, technical, account) and urgency (low, medium, high).
3. Routing: technical tickets are stored; high-urgency billing tickets are investigated; anything
   else is decided by a decision model, and an uncertain decision is investigated.
4. The investigation looks up the account and may issue a credit through the `issue_credit` workflow.
5. Whatever the investigation's outcome — resolved, needs a human, or out of budget — the ticket is
   stored with its resolution and returned with 201.

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
