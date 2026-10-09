# Support Triage

Post a support ticket and get back a triaged, persisted ticket. Rules decide what they can, a decision model handles the rest, and billing escalations are investigated by a bounded tool loop that needs a team lead's approval before issuing a credit above 50.

Built with [tuvl](https://tuvl.io) 2.0 — try it without installing at
[try.tuvl.online](https://try.tuvl.online).

## What it demonstrates

- **`decide`** (`route`): rules first (technical → store, high-urgency billing → investigate), then
  a decision model (`llms/triage_classifier.yaml`, `type: decision`) with a `low_confidence` route.
- **`loop`** (`investigate`) with hard budgets and two tools: an off-spine `code` agent
  (`lookup_account`) and **another workflow** (`issue_credit`); a credit above 50 waits for a
  team lead's **approval** (`required_group: team_leads`) before it runs.
- A loop **supervisor** that pauses or aborts a run that repeats itself.
- Every loop exit (`resolved`, `needs_human`, budgets, `aborted`) still stores the ticket.

## Spec, tests and the CI gate

The intent lives in [`specs/support-triage.md`](specs/support-triage.md). Its task plan (`*.tasks.yaml`) was derived by
`tuvl spec analyse`, and its `tuvl-example` blocks are the tests in `tests/` (`tuvl codegen`). All
of it runs offline:

```bash
tuvl validate --strict && tuvl codegen --check && tuvl lock --check && tuvl test && tuvl spec status --strict
```

## Run it

Prerequisites: [tuvl](https://tuvl.dev/getting-started/installation/) 2.0
(`uv tool install "tuvl[standard]"`), PostgreSQL 15+ with a `tuvl_support` database, and a model key
(`GEMINI_API_KEY` by default — any LiteLLM model works; edit `llms/*.yaml`).

```bash
cp .env.example .env          # Postgres settings and GEMINI_API_KEY
tuvl dev --auto-login         # Insight at http://localhost:8885/insight
```

```bash
curl -s -X POST localhost:8885/support/triage -H 'content-type: application/json' \
  -d '{"customer_id": "C-1001", "subject": "Charged twice", "body": "I was billed twice this month — please refund one."}'
# a credit above 50 pauses the run (waiting_approval): approve, edit or reject the call
# on the Insight Runs page, or POST /api/approvals/<id> {"decision": "approve"}
```

Open **Workflows** in Insight to see the graph, **Runs** to follow a run's journal, and pin a run
as a test fixture.
